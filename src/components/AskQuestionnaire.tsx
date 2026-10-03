import React, { useState } from "react";
import { AskQuestion } from "../utils/askHelper";
import { RandomFontText } from "../utils/randomFont";

interface Props {
  questions: AskQuestion[];
  onComplete: (answers: { question: string; answer: string }[]) => void;
  disabled?: boolean;
}

export const AskQuestionnaire: React.FC<Props> = ({
  questions,
  onComplete,
  disabled = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [isDone, setIsDone] = useState(false);

  if (!questions || questions.length === 0) return null;

  const handleSelectOption = (questionText: string, option: string) => {
    if (disabled || isDone) return;

    const newAnswers = [...selectedAnswers, { question: questionText, answer: option }];
    setSelectedAnswers(newAnswers);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsDone(true);
      onComplete(newAnswers);
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-black/20 dark:border-white/20 font-mono text-xs">
      <div className="mb-2 text-[11px] uppercase tracking-widest opacity-60">
        <RandomFontText text="[QUICK RESPONSE REQUIRED]" />
      </div>

      <div className="space-y-3">
        {/* Render already answered questions */}
        {selectedAnswers.map((item, idx) => (
          <div
            key={idx}
            className="p-2 border border-black/30 dark:border-white/30 bg-black/5 dark:bg-white/5"
          >
            <div className="text-[11px] uppercase tracking-wider opacity-70 mb-1">
              <RandomFontText text={`Q${idx + 1}/${questions.length}: ${item.question}`} />
            </div>
            <div className="inline-block px-2 py-0.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold">
              <RandomFontText text={`[${item.answer}]`} />
            </div>
          </div>
        ))}

        {/* Render the current active question if not yet done */}
        {!isDone && currentIndex < questions.length && (
          <div className={`p-3 border border-black dark:border-white bg-white dark:bg-black ${disabled ? "opacity-60" : ""}`}>
            <div className="font-bold text-xs uppercase tracking-wider mb-2">
              <RandomFontText text={`Q${currentIndex + 1}/${questions.length}: ${questions[currentIndex].question}`} />
            </div>
            <div className="flex flex-wrap gap-2">
              {questions[currentIndex].options.map((option, optIdx) => (
                <button
                  key={optIdx}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectOption(questions[currentIndex].question, option)}
                  className="px-3 py-1.5 border border-black dark:border-white text-xs font-mono uppercase tracking-wider hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black active:translate-y-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RandomFontText text={option} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
