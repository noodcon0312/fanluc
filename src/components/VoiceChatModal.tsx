import React, { useState, useEffect, useRef } from "react";
import { ChatMessage } from "../types";
import { RandomFontText } from "../utils/randomFont";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string, activeLang: string) => Promise<void>;
  messages: ChatMessage[];
  isLoading: boolean;
  isDarkMode: boolean;
}

const LANGUAGES_CONFIG = [
  { code: "en-US", name: "English" },
  { code: "vi-VN", name: "Vietnamese" },
  { code: "zh-CN", name: "Chinese" },
  { code: "fr-FR", name: "French" },
];

function cleanTextForSpeech(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]+>/g, " ") // Remove tool tags
    .replace(/\[[^\]]+\]/g, " ") // Remove bracket headers
    .replace(/[*#_`~>-]+/g, " ") // Remove markdown formatting
    .replace(/https?:\/\/\S+/g, "") // Remove URLs
    .replace(/\s+/g, " ")
    .trim();
}

export const VoiceChatModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSendMessage,
  messages,
  isLoading,
  isDarkMode,
}) => {
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["en-US"]);
  const [activeLang, setActiveLang] = useState<string>("en-US");
  const [transcript, setTranscript] = useState<string>("");
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>("READY...");
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [audioVolume, setAudioVolume] = useState<number>(0);

  const toggleLanguage = (code: string) => {
    setSelectedLangs((prev) => {
      let updated: string[];
      if (prev.includes(code)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        updated = prev.filter((c) => c !== code);
      } else {
        updated = [...prev, code];
      }
      
      if (!updated.includes(activeLang)) {
        setActiveLang(updated[0]);
      }
      return updated;
    });
  };

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const isOpenRef = useRef<boolean>(isOpen);
  const isLoadingRef = useRef<boolean>(isLoading);
  const isAiSpeakingRef = useRef<boolean>(isAiSpeaking);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  isOpenRef.current = isOpen;
  isLoadingRef.current = isLoading;
  isAiSpeakingRef.current = isAiSpeaking;

  // New refs for noise/stable volume filter & auto-send logic
  const currentVolumeRef = useRef<number>(0);
  const volumeHistoryRef = useRef<number[]>([]);
  const lastTranscriptRef = useRef<string>("");
  const lastTranscriptChangeTimeRef = useRef<number>(Date.now());
  const autoSendTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check Web Speech API support & setup recognition instance
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setStatusText("BROWSER NOT SUPPORTED");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = activeLang; // Dynamically set recognition language

      recognition.onstart = () => {
        setIsListening(true);
        if (!isAiSpeakingRef.current && !isLoadingRef.current) {
          setStatusText("LISTENING...");
        }
      };

      recognition.onresult = (event: any) => {
        if (isAiSpeakingRef.current || isLoadingRef.current) return;

        let interimStr = "";
        let finalStr = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalStr += trans + " ";
          } else {
            interimStr += trans;
          }
        }

        const fullText = (finalStr + interimStr).trim();
        setTranscript(fullText);

        if (fullText.length > 0) {
          setIsUserSpeaking(true);
          setStatusText("CAPTURING...");

          if (fullText !== lastTranscriptRef.current) {
            lastTranscriptRef.current = fullText;
            lastTranscriptChangeTimeRef.current = Date.now();
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Voice recognition error:", event.error);
        if (event.error === "no-speech") {
          setIsUserSpeaking(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setIsUserSpeaking(false);
        if (
          isOpenRef.current &&
          !isLoadingRef.current &&
          !isAiSpeakingRef.current
        ) {
          try {
            recognition.start();
          } catch (e) {
            // Ignore restart errors
          }
        }
      };

      recognitionRef.current = recognition;
    } catch (err) {
      console.error("Failed to setup SpeechRecognition:", err);
      setSpeechSupported(false);
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, [activeLang]);

  // Automated sending timer based on user criteria
  useEffect(() => {
    if (!isOpen) {
      if (autoSendTimerRef.current) clearInterval(autoSendTimerRef.current);
      volumeHistoryRef.current = [];
      return;
    }

    lastTranscriptRef.current = "";
    lastTranscriptChangeTimeRef.current = Date.now();
    volumeHistoryRef.current = [];

    const interval = setInterval(() => {
      if (isAiSpeakingRef.current || isLoadingRef.current) {
        volumeHistoryRef.current = [];
        lastTranscriptChangeTimeRef.current = Date.now();
        return;
      }

      const curVol = currentVolumeRef.current;
      volumeHistoryRef.current.push(curVol);

      if (volumeHistoryRef.current.length > 25) {
        volumeHistoryRef.current.shift();
      }

      const text = lastTranscriptRef.current.trim();
      if (!text) {
        return;
      }

      const now = Date.now();
      const timeSinceLastWord = now - lastTranscriptChangeTimeRef.current;
      const noNewWords = timeSinceLastWord >= 2500; // auto-send after 2.5s of silence

      let volumeIsStable = false;
      if (volumeHistoryRef.current.length >= 25) {
        const maxVol = Math.max(...volumeHistoryRef.current);
        const minVol = Math.min(...volumeHistoryRef.current);
        if (maxVol - minVol <= 0.1) {
          volumeIsStable = true;
        }
      }

      if (noNewWords && volumeIsStable) {
        volumeHistoryRef.current = [];
        lastTranscriptChangeTimeRef.current = now;
        lastTranscriptRef.current = "";
        handleSendVoice(text);
      }
    }, 100);

    autoSendTimerRef.current = interval;

    return () => {
      clearInterval(interval);
    };
  }, [isOpen]);

  // Handle opening and closing modal + real-time mic volume analyzer
  useEffect(() => {
    if (isOpen) {
      setTranscript("");
      setIsUserSpeaking(false);
      setIsAiSpeaking(false);
      setStatusText("READY...");

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((micStream) => {
            micStreamRef.current = micStream;

            if (recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {}
            }

            const AudioCtxClass =
              window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtxClass) {
              const audioCtx = new AudioCtxClass();
              audioCtxRef.current = audioCtx;

              const source = audioCtx.createMediaStreamSource(micStream);
              const analyser = audioCtx.createAnalyser();
              analyser.fftSize = 256;
              source.connect(analyser);
              analyserRef.current = analyser;

              const dataArray = new Uint8Array(analyser.frequencyBinCount);

              const updateVolume = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);

                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  sum += dataArray[i];
                }
                const avg = sum / dataArray.length;
                const normalizedVol = Math.min(1, avg / 100);

                setAudioVolume((prev) => {
                  const newVol = prev * 0.3 + normalizedVol * 0.7;
                  currentVolumeRef.current = newVol;
                  return newVol;
                });

                animFrameRef.current = requestAnimationFrame(updateVolume);
              };

              updateVolume();
            }
          })
          .catch((err) => {
            console.warn("Microphone access error:", err);
            if (recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {}
            }
          });
      } else if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {}
      }
    } else {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      setAudioVolume(0);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [isOpen]);

  // Handle sending text spoken by user
  const handleSendVoice = async (textToSend: string) => {
    if (!textToSend || isLoading) return;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    setIsUserSpeaking(false);
    setStatusText("PROCESSING...");
    setTranscript(textToSend);

    await onSendMessage(textToSend, activeLang);
    setTranscript("");
  };

  // Listen for AI's response and speak it aloud
  useEffect(() => {
    if (!isOpen) return;

    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];

      if (
        lastMsg.role === "assistant" &&
        lastMsg.id !== lastSpokenMessageIdRef.current &&
        !isLoading &&
        lastMsg.status !== "error"
      ) {
        lastSpokenMessageIdRef.current = lastMsg.id;

        const speakText = cleanTextForSpeech(lastMsg.content);

        if (speakText && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();

          const utterance = new SpeechSynthesisUtterance(speakText);
          utterance.lang = activeLang;
          utterance.rate = 1.05;

          utterance.onstart = () => {
            setIsAiSpeaking(true);
            setStatusText("SPEAKING...");
          };

          const handleFinishSpeech = () => {
            setIsAiSpeaking(false);
            setStatusText("READY...");
            if (recognitionRef.current && isOpenRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {}
            }
          };

          utterance.onend = handleFinishSpeech;
          utterance.onerror = handleFinishSpeech;

          window.speechSynthesis.speak(utterance);
        } else {
          setStatusText("READY...");
          if (recognitionRef.current && isOpenRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {}
          }
        }
      }
    }
  }, [messages, isLoading, isOpen, activeLang]);

  if (!isOpen) return null;

  // Extract last messages
  const userMessages = messages.filter((m) => m.role === "user");
  const aiMessages = messages.filter((m) => m.role === "assistant");
  const lastUserMessageText = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : "";
  const lastAiMessageText = aiMessages.length > 0 ? aiMessages[aiMessages.length - 1].content : "";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 font-mono select-none transition-colors duration-200 ${
        isDarkMode ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      {/* Top Right Exit Button */}
      <button
        type="button"
        onClick={() => {
          if ("speechSynthesis" in window) window.speechSynthesis.cancel();
          onClose();
        }}
        className={`fixed top-4 right-4 sm:top-6 sm:right-6 z-50 px-3.5 py-1.5 border-2 font-mono font-bold text-xs sm:text-sm uppercase tracking-wider transition-colors shrink-0 ${
          isDarkMode
            ? "border-white bg-black text-white hover:bg-white hover:text-black active:bg-white active:text-black"
            : "border-black bg-white text-black hover:bg-black hover:text-white active:bg-black active:text-white"
        }`}
      >
        <RandomFontText text="[CLOSE]" />
      </button>

      {/* Main Grid/Split Layout */}
      <div className="flex flex-col md:flex-row items-center justify-center w-full max-w-5xl mx-auto px-4 gap-8 md:gap-16">
        
        {/* Left column: Text boxes (User speech line 1, AI speech line 2) */}
        <div className="flex-1 w-full flex flex-col justify-center space-y-6 text-left max-w-md">
          {/* User Speech (Line 1) */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider opacity-60 font-bold">
              <RandomFontText text="YOU" />
            </div>
            <div className="text-sm sm:text-base border-2 border-black dark:border-white p-3 min-h-[70px] flex items-center break-words bg-transparent font-mono">
              <RandomFontText text={transcript || lastUserMessageText || "Waiting for speech..."} />
            </div>
          </div>

          {/* AI Reply (Line 2) */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider opacity-60 font-bold">
              <RandomFontText text="AI" />
            </div>
            <div className="text-sm sm:text-base border-2 border-black dark:border-white p-3 min-h-[70px] flex items-center break-words bg-transparent font-mono">
              {isAiSpeaking || isLoading ? (
                <span className="animate-pulse">
                  <RandomFontText text={isLoading ? "Thinking..." : "Speaking..."} />
                </span>
              ) : (
                <RandomFontText text={lastAiMessageText || "Waiting for response..."} />
              )}
            </div>
          </div>

          {/* Languages Selector */}
          <div className="space-y-3 border-2 border-black dark:border-white p-3 font-mono">
            <div>
              <div className="text-[10px] uppercase tracking-wider opacity-60 font-bold mb-1.5">
                <RandomFontText text="LANGUAGES (SELECT 1 OR MORE)" />
              </div>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES_CONFIG.map((lang) => {
                  const isSelected = selectedLangs.includes(lang.code);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => toggleLanguage(lang.code)}
                      className={`px-2.5 py-1.5 border-2 text-xs font-bold uppercase transition-colors duration-150 ${
                        isSelected
                          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                          : "border-black/15 text-black hover:border-black hover:text-black dark:border-white/15 dark:text-white dark:hover:border-white dark:hover:text-white"
                      }`}
                    >
                      <RandomFontText text={lang.name} />
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedLangs.length > 1 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-60 font-bold mb-1.5">
                  <RandomFontText text="ACTIVE SPEECH LANGUAGE" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES_CONFIG.filter((l) => selectedLangs.includes(l.code)).map((lang) => {
                    const isActive = activeLang === lang.code;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setActiveLang(lang.code)}
                        className={`px-2.5 py-1 border-2 text-xs font-bold uppercase transition-colors duration-150 ${
                          isActive
                            ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                            : "border-black/15 text-black hover:border-black hover:text-black dark:border-white/15 dark:text-white dark:hover:border-white dark:hover:text-white"
                        }`}
                      >
                        <RandomFontText text={`[ACTIVE] ${lang.name}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Minimalist Audio Level Indicator (No flashing circles) */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-black dark:border-white bg-transparent min-h-[220px]">
          <div className="text-[11px] uppercase tracking-wider font-bold mb-4">
            <RandomFontText text="[AUDIO_LEVEL]" />
          </div>
          <div className="flex items-end justify-center gap-2 h-24 w-full max-w-[220px] border-b-2 border-black dark:border-white pb-1">
            {[0.25, 0.45, 0.75, 1.0, 0.85, 0.55, 0.35].map((multiplier, idx) => {
              const barHeight = Math.max(6, Math.min(84, Math.round(audioVolume * 240 * multiplier)));
              return (
                <div
                  key={idx}
                  className="flex-1 bg-black dark:bg-white transition-all duration-75"
                  style={{ height: `${barHeight}px` }}
                />
              );
            })}
          </div>
          <div className="mt-4 font-mono text-[11px] uppercase tracking-widest opacity-80 text-center font-bold">
            <RandomFontText text={`[STATUS: ${statusText}]`} />
          </div>
        </div>

      </div>
    </div>
  );
};
