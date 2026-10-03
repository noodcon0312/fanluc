import { useState, useEffect, useRef, useMemo } from "react";
import { ApiConfig, ChatMessage, ChatSession, AttachedFile, VirtualFile } from "./types";
import { sendChatMessage } from "./utils/api";
import {
  extractSearchCommand,
  extractAllSearchCommands,
  extractFetchCommand,
  extractAllFetchCommands,
  hasUnexecutedFetch,
  detectUnrecognizedOrMalformedCommands,
  cleanAiCommands,
  performYahooSearch,
  performFetchUrl,
} from "./utils/yahooSearch";
import {
  extractAllImageSearchCommands,
  extractImageSearchCommands,
  stripImageSearchCommands,
  performImageSearch,
} from "./utils/imageSearch";
import {
  extractAllMcpCalls,
  getMcpToolsPrompt,
  hasMcpCall,
  stripMcpCalls,
  fetchMcpStatus,
  callMcpTool,
  formatMcpStatusForChat,
} from "./utils/mcpHelper";
import { ImageSearchCard } from "./components/ImageSearchCard";
import { McpPanel } from "./components/McpPanel";
import {
  extractListHistoryCommand,
  extractAllListHistoryCommands,
  extractSeeHistoryCommand,
  extractAllSeeHistoryCommands,
  extractListKeywordsCommand,
  extractAllListKeywordsCommands,
  extractHistoryTurns,
  handleListHistory,
  handleSeeHistory,
  handleListChatKeywords,
} from "./utils/historyHelper";
import {
  parseWriteCommands,
  parseEditCommands,
  parseReadCommands,
  parseGlobCommands,
  parseGrepCommands,
  parseDeleteCommands,
  parseMoveCommands,
  parseGitDiffCommands,
  parseGitCheckoutCommands,
  executeWrite,
  executeRead,
  executeEdit,
  executeGlob,
  executeGrep,
  executeDelete,
  executeMove,
  executeGitDiff,
  executeGitCheckout,
  stripAllFileCommands,
  uploadFileToWorkspace,
  syncServerWorkspaceFiles,
  isBinaryFile,
} from "./utils/fileCommands";
import {
  parseRunCmdCommands,
  executeRunCmd,
  stripRunCodeCommands,
  parseReplaceOutputCommands,
  stripReplaceOutputCommands,
  stripFakeIntermediateTags,
  parseRunCmdBgCommands,
  stripRunCmdBgCommands,
  executeRunCmdBg,
  parseListCmdBgCommands,
  stripListCmdBgCommands,
  executeListCmdBg,
  parseKillCmdBgCommands,
  stripKillCmdBgCommands,
  executeKillCmdBg,
  parseReadCmdBgLogCommands,
  stripReadCmdBgLogCommands,
  executeReadCmdBgLog,
} from "./utils/codeRunner";
import { stripTurtleCardCommands } from "./components/TurtleCard";
import {
  parseListAgentCommands,
  executeListAgent,
  stripListAgentCommands,
  parsePromptAgentCommands,
  stripPromptAgentCommands,
  runSubAgent,
  parseViewImageAgentCommands,
  stripViewImageAgentCommands,
  executeViewImageAgent,
  findMostRecentImageAttachment,
  getAgentToolsPrompt,
} from "./utils/agentHelper";
import {
  parseWriteMemCommands,
  stripWriteMemCommands,
  applyWriteMem,
  parseReadMemCommands,
  stripReadMemCommands,
  executeReadMem,
  findMatchingMemEntries,
  buildMemHint,
  getMemToolsPrompt,
  getStoredUserMems,
  saveStoredUserMems,
  getStoredAiMems,
  saveStoredAiMems,
} from "./utils/memHelper";
import {
  hasListSkillsCommand,
  parseLoadSkillsCommands,
  executeListSkills,
  executeLoadSkills,
  hasInstallPackCommand,
  buildActiveSkillsPrompt,
  executeInstallPack,
  stripInstallPackCommands,
} from "./utils/skillHelper";
import {
  extractShowMapCommands,
  stripShowMapCommands,
} from "./components/MapEmbedCard";
import {
  extractStepGuides,
  stripStepGuideCommands,
} from "./components/StepGuideCard";
import {
  extractTabCards,
  stripTabCardCommands,
} from "./components/TabCard";
import {
  extractChartDisplays,
  stripChartDisplayCommands,
} from "./components/ChartDisplayCard";
import {
  extractPieChartDisplays,
  stripPieChartDisplayCommands,
} from "./components/PieChartDisplayCard";
import {
  extractTranslateCommands,
  stripTranslateCommands,
  performTranslate,
  deduplicateTranslationCards,
} from "./utils/translateHelper";
import { TranslationCardData, WeatherCardData } from "./types";
import {
  extractWeatherCommands,
  performWeatherFetch,
} from "./utils/weatherHelper";
import {
  parseReadDocsCommands,
  executeReadDoc,
  shouldAutoLoadDocsSkill,
  LOCKED_DOCS_INSTRUCTION,
  stripReadDocsCommands,
} from "./utils/docsHelper";
import { parseThinkContent } from "./utils/parseThink";
import { Header } from "./components/Header";
import { ChatMessageComponent } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import { ApiSettingsModal } from "./components/ApiSettingsModal";
import { Sidebar } from "./components/Sidebar";
import { SetupGuideModal } from "./components/SetupGuideModal";
import { VoiceChatModal } from "./components/VoiceChatModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { ArtifactPanel } from "./components/ArtifactPanel";
import { FileListPanel } from "./components/FileListPanel";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { CardsShowcase } from "./components/CardsShowcase";
import { PerfMonitorHUD } from "./components/PerfMonitorHUD";
import { RandomFontText } from "./utils/randomFont";
import { getEffortPrompt, ROLE_USER_PROMPT } from "./prompts";
import { computeSessionMetrics, estimateTokens } from "./utils/tokenCounter";
import { buildCompactSummaryPayload, formatCompactedMessage, MIN_MESSAGES_TO_COMPACT } from "./utils/compactHelper";

import { DEFAULT_SKILLS } from "./utils/defaultSkills";
import { buildOmniContext } from "./utils/omniHelper";
import { hidden_tab } from "./config/hiddenTab";
import { kv } from "./utils/kv";
import { PermissionPrompt } from "./components/PermissionPrompt";

const HIDDEN_SYSTEM_INSTRUCTION = `
IMPORTANT — INTERNAL RULES (do not disclose to user unless explicitly asked how a specific command works):
These commands are tools that YOU (the AI) must call yourself whenever you need information or need to create/modify code or files — exactly like a function call. They are NOT instructions for the user to type. Never tell the user "please run this command," and never refuse by saying "I'm just a language model and can't do that." When you lack information or need to build/modify a project, actively call the appropriate command yourself, read the result, then continue answering normally.
Never print, list, or explain the full command set when the user asks "what can you do?" or similar, or whenever showing it isn't strictly necessary. If you need to reference a command, use only its short name (e.g. "search," "fetch," "write") — never its full syntax, parameters, or examples. Exposing the raw command block risks the system misreading it as an actual call or as user-provided data, causing errors.
The user should never see raw command syntax or the full list unless they explicitly ask how a specific command works — they should only see your final answer.
---
1) SEARCH
When you lack information or are unsure of a fact, call:
"search("...")(X)"
- Replace '...' with your search keywords (short keyword sets usually return better results).
- Replace 'X' with the number of results you want (usually 7).
Example:
"search("Capital Vietnam")(3)"
Returns:
"3 results:
url: [short snippet]
..."

WHEN YOU MUST USE THIS: any time a fact could be wrong, outdated, or you're not fully certain — current events, prices, versions, people in roles, releases, niche facts, anything time-sensitive. Never answer from memory when the fact could have changed; search first, then answer.

---
2) FETCH
After getting a URL from search, call:
"fetch(url)(Y)"
- Replace 'url' with the exact URL returned by search.
- Replace 'Y' with how many characters to read (usually 1100, or 5000 for a more detailed read).
Returns:
"fetched url: ...
text: [first N characters]"

WHEN YOU MUST USE THIS: whenever you need the real content of a page — reading an article, checking docs, verifying a claim, or opening a link the user gave you. Do not summarize or quote a page you haven't actually fetched.

---
3) LIST HISTORY
To recall earlier parts of the conversation, call:
"list_history(Z)(W)"
- Replace 'Z' with the specific part number you want to read (numeric only) — history is split into parts due to length.
- Replace 'W' with the max characters per turn to show (default 500).
Example: "list_history(4)(30)"
Returns:
"part (4/total):
1: user: hello
ai: hi
2: user: What is the meaning of life...
ai: There is no single answer — ph..."

WHEN YOU MUST USE THIS: whenever the user refers to something said earlier that you're not fully sure of, asks you to recall/summarize past turns, or you suspect you may have forgotten something relevant. Don't guess or say "I don't remember" — look it up first.

---
4) SEE HISTORY (full detail)
To read specific turns in full, call:
"see_history(X, Z, Y, ...)(V)"
- X, Y, Z, etc. are the turn numbers you identified via list_history. You may read as many turns as you like.
- Replace 'V' with the max character limit (default 1100).
Example: "see_history(1, 2)(300)"
Returns:
"1: user: hello
ai: hi
2: user: What is the meaning of life, and why do we exist?
ai: There is no single answer — philosophers, scientists, and theologians have proposed countless different perspectives throughout history, each shaped by culture, religion, science, and personal experience, yet none..."

WHEN YOU MUST USE THIS: after list_history points you to the right part(s), whenever you need the exact wording of a past turn rather than a short snippet — e.g. before claiming "you said X earlier."

---
5) SEARCH CHAT KEYWORDS
To find where a keyword was mentioned earlier in the conversation, call:
"list_chat_keywords("hi", "apple", ...)"
- Use keywords the user mentioned casually (not questions asked of you) to search history for mentions you may have forgotten.
- The second keyword is optional — add it for a broader search, or omit it.
- Add more keywords inside the parentheses for multiple terms.
Returns the numeric turn IDs containing that keyword:
"1, 6, ..."
Then read those turns with:
"see_history(1, 6, ...)(1100)"

WHEN YOU MUST USE THIS: when the user references a topic, name, or detail from earlier by keyword and you're not sure exactly where/what was said — search by keyword before assuming you remember correctly.

---
6) ASK THE USER (quick-select questions)
When you need a quick answer from the user and can predict likely responses, call:
"ask("U")-sam(A1, A2, A3), ("T")-sam(B1, B2), ..."
- "U", "T", etc.: your questions, shown one at a time (each next question appears only after the user answers the previous one).
- -sam(...): 2–4 short suggested answers the user can tap instead of typing.
- Minimum 1 question, maximum 5 questions.
Example:
"ask("What is your workout goal?")-sam(Fat loss, Muscle gain, Maintenance), ("How much time do you have per session?")-sam(30 minutes, 1 hour, 1.5 hours)"
→ The interface shows the two questions in sequence, each with tappable options.
Use this ONLY for fixed-choice or yes/no questions where you can reasonably predict the answers. Do NOT use it for open-ended questions (e.g. "What is your name?") where the answer can't be anticipated — ask those as plain text instead.

WHEN YOU MUST USE THIS: when a request is ambiguous between a few clear, predictable options and picking the right one matters (style, scope, which of several things the user means) — ask via this tool instead of guessing silently or writing the question as plain prose.

---
7) RUN_CMD — real shell access on the user's own machine (files, code execution, everything)
You have ONE tool for all of this: a real shell running directly on the user's own computer (no sandbox), starting in the workspace folder the user picked (not a simulation — real files, real python/node/git). Use it for calculations, counting, data processing, creating/editing/moving files, searching file contents, and unzipping archives.

"run_cmd{...}"
Replace the ... with the exact shell command(s) you want to run, exactly as you'd type them at a real terminal. No quotes around the whole thing, no "call:" prefix.

Example — run a calculation:
"run_cmd{
python3 -c "print(84 * 2)"
}"
The system runs it for real and returns the exact stdout: "168"

Example — count characters:
"run_cmd{
python3 -c "s='strawbrewyr'; print('total characters:', len(s)); print(chr(39)+'r'+chr(39)+' count:', s.count('r'))"
}"

Example — create a file (use a heredoc so multi-line content, quotes, and special characters are preserved exactly):
"run_cmd{
cat > game.html << 'EOF'
<h1>TIC TAC TOE</h1>
...full file content...
EOF
}"
The system returns real stdout/stderr from that command (e.g. nothing on success, or an error if the command failed).

Example — edit/find-and-replace inside an existing file (sed, in-place):
"run_cmd{
sed -i 's/<h1>TIC TAC TOE<\\/h1>/<h1>OXO GAME<\\/h1>/' game.html
}"
For anything more delicate than a one-line swap (multi-line blocks, ambiguous matches), read the file first (cat/sed -n) so you know exactly what you're replacing, then apply the edit.

Example — move/rename a file:
"run_cmd{ mv temp.txt src/main.txt }"

Example — list/find files:
"run_cmd{ find . -maxdepth 3 -type f }"   or   "run_cmd{ ls -la }"

Example — search inside files:
"run_cmd{ grep -rn "function" --include='*.html' . }"

Example — unzip an archive:
"run_cmd{ unzip -o archive.zip -d extracted/ && ls extracted/ }"

Missing a tool or library ("command not found", "ModuleNotFoundError")? Install it yourself with the right non-interactive command (pip install <package>, npm i <package>, winget/brew/apt with -y). Check the <environment> block for the OS and shell first.

Example — see what changed / undo a mistake (only if this is a real git repo; check with \`git status\` first):
"run_cmd{ git diff -- index.html }"
"run_cmd{ git checkout -- index.html }"

Notes on the environment:
- Every call starts fresh in the workspace folder — these are real files on the user's disk and persist.
- Python 3 and Node.js are both available (python3 ...; node -e "..."; or write a .py/.js file and run it).
- Commands run with the user's own permissions and have internet access. Only catastrophic commands (formatting disks, rm -rf /) are blocked. Be careful: you are touching real files.
- Output is capped and commands time out after ~2 minutes — use run_cmd_bg for anything longer.

CRITICAL RULES:
- Always use run_cmd to actually save code/documents/data — NEVER just say "I will create a file" and stop there, and never paste a whole file's content into the chat as a substitute for creating it (unless it's only a few lines or the user explicitly asks to see it inline).
- Read a file (cat) before editing it if you haven't seen its current content recently.
- After a sizeable edit, it's fine to \`cat\` the file back or \`git diff\` (if a git repo) so the change is visible.

CRITICAL — THERE IS NO SUCH THING AS "SHOWING THE CODE" AS A SUBSTITUTE FOR RUNNING IT:
Writing code inside triple-backtick fences, labeling it [PYTHON]/[JS], adding "[COPY]", or writing "Let me run this..." does NOT execute anything and does NOT count as calling run_cmd. The ONLY valid execution is the literal call run_cmd{...}. If you write code or a command anywhere else (fenced block, plain text, "here's the script"), nothing happened — any numbers or file contents you state afterward are fabricated, not real.

MANDATORY BEHAVIOR: when you decide to compute or create/edit something, your entire output for that step is the run_cmd{...} call and NOTHING else — no code fences, no "the result is", no summary. Stop there. Only after the real tool output comes back do you write the answer, using the exact output returned.

FORBIDDEN (short, absolute):
- Never print a fenced/labeled code block as a stand-in for running it — that is not execution.
- Never write "the result is / file created / calculated result:" in the same turn you also displayed the command, unless that turn also contains a real run_cmd call and you're reporting its actual returned output.
- Never tell the user to run the command themselves or to "wait for the system" — you run it, not them.
Self-check before answering with any number or claiming a file exists: did I actually call run_cmd (the literal call, not a shown code block) and read real returned output? If not, call it now — don't answer yet.

Example of the exact failure to avoid:
User asks to count letters in a string.
WRONG: AI writes "Let me run a script:" then a triple-backtick python fenced block, then immediately "The result is: 8" — this is fabrication; nothing actually ran.
RIGHT: AI calls run_cmd{...} (the real call, no fences, no preamble code shown), waits for the actual tool output, then answers using only that returned output.

---

REMINDER: All actions above are ones you take on your own initiative during reasoning, not requests handed back to the user. If information is missing, use search/fetch/history/run_cmd yourself first, then respond with a complete answer.`;

const DEFAULT_CONFIG: ApiConfig = {
  apiUrl: "https://...ngrok-free.dev/v1/chat/completions",
  apiKey: "123",
  model: "",
  systemPrompt: "You are a helpful AI assistant.",
  temperature: 0.7,
  maxTokens: 8000,
  topP: 0.95,
  topK: 40,
  repeatPenalty: 1.01,
  reasoningEffort: "high",
  useSerifLora: true,
  effort: "fast",
  thinkStartTag: "<think>",
  thinkEndTag: "</think>",
  stripOpenTags: "",
  stripCloseTags: "",
  skills: DEFAULT_SKILLS,
  memEnabled: true,
  userMemEntries: [],
  aiMemEntries: [],
  agentEnabled: true,
  agents: [],
};

export default function App() {
  // Load initial settings from localStorage or defaults
  const [config, setConfig] = useState<ApiConfig>(() => {
    try {
      const saved = kv.getItem("ai_chat_api_config");
      const fallbackUserMems = getStoredUserMems();
      const fallbackAiMems = getStoredAiMems();
      if (saved) {
        const parsed = JSON.parse(saved);
        const parsedSkills = Array.isArray(parsed?.skills) ? parsed.skills : [];
        // Merge missing default skills and ensure isDefault is assigned
        const mergedSkills = [...parsedSkills];
        for (const ds of DEFAULT_SKILLS) {
          const existingIdx = mergedSkills.findIndex(s => s.id === ds.id);
          if (existingIdx === -1) {
            mergedSkills.push({ ...ds, isDefault: true, enabled: true });
          } else {
            mergedSkills[existingIdx] = {
              ...ds,
              enabled: mergedSkills[existingIdx].enabled ?? true,
              isDefault: true,
              isLocked: ds.isLocked,
            };
          }
        }
        const userMems = Array.isArray(parsed?.userMemEntries) && parsed.userMemEntries.length > 0
          ? parsed.userMemEntries
          : fallbackUserMems;
        const aiMems = Array.isArray(parsed?.aiMemEntries) && parsed.aiMemEntries.length > 0
          ? parsed.aiMemEntries
          : fallbackAiMems;

        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          skills: mergedSkills,
          userMemEntries: userMems,
          aiMemEntries: aiMems,
        };
      }
      return {
        ...DEFAULT_CONFIG,
        userMemEntries: fallbackUserMems,
        aiMemEntries: fallbackAiMems,
      };
    } catch {
      return {
        ...DEFAULT_CONFIG,
        userMemEntries: getStoredUserMems(),
        aiMemEntries: getStoredAiMems(),
      };
    }
  });

  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return kv.getItem("ai_chat_theme") === "dark";
  });

  // Sessions state
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = kv.getItem("ai_chat_sessions");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 16).map((s: ChatSession) => ({
            ...s,
            messages: (s.messages || []).slice(-100),
          }));
        }
      }
    } catch {
      // fallback
    }
    const initialId = Date.now().toString();
    return [
      {
        id: initialId,
        title: "Initial Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      },
    ];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return sessions[0]?.id || Date.now().toString();
  });

  const randomGreeting = useMemo(() => {
    const now = new Date();
    const pool: string[] = ["Hi!", "Sup Ya?"];

    const hours = now.getHours();
    if (hours >= 5 && hours < 12) {
      pool.push("Morning!");
    } else if (hours >= 12 && hours < 18) {
      pool.push("Afternoon!");
    } else if (hours >= 18 && hours < 23) {
      pool.push("Evening!");
    } else {
      // 23:00 - 4:59
      pool.push("Is something up tonight?");
    }

    const month = now.getMonth(); // 0 = Jan ... 9 = Oct, 11 = Dec
    const date = now.getDate();

    // Halloween (late October, around 31/10: 24/10 - 31/10)
    if (month === 9 && date >= 24) {
      pool.push("What do you want to dress up as this Halloween?");
    }

    // Christmas (24-25/12)
    if (month === 11 && (date === 24 || date === 25)) {
      pool.push("Merry Christmas!");
    }

    // New Year (31/12 - 1/1)
    if ((month === 11 && date === 31) || (month === 0 && date === 1)) {
      pool.push("Happy New Year!");
    }

    // Summer (June to August: months 5, 6, 7)
    if (month >= 5 && month <= 7) {
      pool.push("Are you going anywhere this summer?");
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }, [currentSessionId]);

  // UI Modals & Drawers
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSetupGuideOpen, setIsSetupGuideOpen] = useState(false);
  const [isVoiceChatOpen, setIsVoiceChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Diagnostic Switches (Managed in Settings -> DEV_MODE)
  // NOTE: when hidden_tab.dev_mode is false, the DEV_MODE panel itself is hidden and
  // there is no UI left to turn these switches back off. So while hidden, we force
  // them to stay off and ignore any stale "true" value left over in localStorage
  // from before the tab was hidden.
  const [isPerfMonitorEnabled, setIsPerfMonitorEnabled] = useState<boolean>(() => {
    return hidden_tab.dev_mode && kv.getItem("fanluc_perf_monitor") === "true";
  });
  const [isRawViewEnabled, setIsRawViewEnabled] = useState<boolean>(() => {
    return hidden_tab.dev_mode && kv.getItem("fanluc_raw_view") === "true";
  });
  const [isAiRoleSimEnabled, setIsAiRoleSimEnabled] = useState<boolean>(() => {
    return hidden_tab.dev_mode && kv.getItem("fanluc_role_sim") === "true";
  });
  const [isSeeAllCardEnabled, setIsSeeAllCardEnabled] = useState<boolean>(false);
  const [lastRawRequest, setLastRawRequest] = useState<any>(null);
  const [lastRawResponse, setLastRawResponse] = useState<string>("");

  const togglePerfMonitor = () => {
    setIsPerfMonitorEnabled((prev) => {
      const next = !prev;
      kv.setItem("fanluc_perf_monitor", String(next));
      return next;
    });
  };

  const toggleRawView = () => {
    setIsRawViewEnabled((prev) => {
      const next = !prev;
      kv.setItem("fanluc_raw_view", String(next));
      return next;
    });
  };

  const toggleAiRoleSim = () => {
    setIsAiRoleSimEnabled((prev) => {
      const next = !prev;
      kv.setItem("fanluc_role_sim", String(next));
      return next;
    });
  };

  const toggleSeeAllCard = () => {
    setIsSeeAllCardEnabled((prev) => !prev);
  };
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setSearchStatus(null);
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== currentSessionId) return s;
        return {
          ...s,
          messages: s.messages.map((m) =>
            m.status === "sending" ? { ...m, status: "sent" } : m
          ),
        };
      })
    );
  };
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  // Split-pane artifact state
  const [activeArtifactPath, setActiveArtifactPath] = useState<string | null>(null);
  const [isArtifactExpanded, setIsArtifactExpanded] = useState<boolean>(false);
  const [showFileList, setShowFileList] = useState<boolean>(false);

  // ChatInput's text/attachment/error live here, not inside ChatInput itself:
  // there are two <ChatInput> render sites below (bottom-of-page vs. next to
  // an open artifact/file panel) and only one is mounted at a time, so
  // toggling the panel unmounts one and mounts the other. Local state inside
  // ChatInput would reset to "" on that swap and silently drop whatever the
  // person had just typed; keeping it here means it survives the remount.
  const [chatInputText, setChatInputText] = useState<string>("");
  const [chatInputAttachment, setChatInputAttachment] = useState<AttachedFile | undefined>(undefined);
  const [chatInputError, setChatInputError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);
  const autoScrollEnabledRef = useRef<boolean>(true);

  // Scroll detection to toggle SCROLL button and track whether user scrolled up
  useEffect(() => {
    const handleScroll = () => {
      const container = chatContainerRef.current;
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
        const isUp = distanceFromBottom > 60;
        isUserScrolledUpRef.current = isUp;
        if (isUp) {
          autoScrollEnabledRef.current = false;
        }
        setShowScrollButton(isUp);
      } else {
        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const clientHeight = window.innerHeight;
        const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
        const isUp = distanceFromBottom > 80;
        isUserScrolledUpRef.current = isUp;
        if (isUp) {
          autoScrollEnabledRef.current = false;
        }
        setShowScrollButton(isUp);
      }
    };

    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (container) {
        container.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleScrollToBottom = () => {
    autoScrollEnabledRef.current = true;
    isUserScrolledUpRef.current = false;
    setShowScrollButton(false);
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Save config to localStorage and persist memories
  useEffect(() => {
    try {
      kv.setItem("ai_chat_api_config", JSON.stringify(config));
      if (Array.isArray(config.userMemEntries)) {
        saveStoredUserMems(config.userMemEntries);
      }
      if (Array.isArray(config.aiMemEntries)) {
        saveStoredAiMems(config.aiMemEntries);
      }
    } catch (e) {
      console.error("Failed to save config/mems to localStorage", e);
    }
  }, [config]);

  // Flush memories and config on beforeunload to prevent data loss when exiting page
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        kv.setItem("ai_chat_api_config", JSON.stringify(config));
        if (Array.isArray(config.userMemEntries)) {
          saveStoredUserMems(config.userMemEntries);
        }
        if (Array.isArray(config.aiMemEntries)) {
          saveStoredAiMems(config.aiMemEntries);
        }
      } catch {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [config]);

  // Apply dark mode class to root html element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      kv.setItem("ai_chat_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      kv.setItem("ai_chat_theme", "light");
    }
  }, [isDarkMode]);

  // Save sessions to localStorage
  useEffect(() => {
    try {
      // Files already live in the workspace folder on disk: don't duplicate their content in the chat store
      const slim = sessions.map((s) => (s.files ? { ...s, files: {} } : s));
      kv.setItem("ai_chat_sessions", JSON.stringify(slim));
    } catch (e) {
      console.warn("Could not save sessions (storage full?)", e);
    }
  }, [sessions]);

  // Auto scroll to bottom on new message
  const currentSession = sessions.find((s) => s.id === currentSessionId) || sessions[0];
  const messages = currentSession?.messages || [];
  const activeArtifact = activeArtifactPath && currentSession?.files ? currentSession.files[activeArtifactPath] || null : null;
  const filesCount = currentSession?.files ? Object.keys(currentSession.files).length : 0;

  // Host info (OS, shell, workspace path) so the model writes commands that fit this machine.
  const [hostInfo, setHostInfo] = useState<any>(null);
  const [isWorkspacePickerOpen, setIsWorkspacePickerOpen] = useState(false);
  const loadHostInfo = () =>
    fetch("/api/workspace")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHostInfo(d))
      .catch(() => {});
  useEffect(() => {
    loadHostInfo();
  }, []);
  const environmentBlock = useMemo(() => {
    if (!hostInfo?.system) return "";
    const sys = hostInfo.system;
    const win = sys.platform === "win32";
    return `<environment>
OS: ${sys.os} (${sys.platform}/${sys.arch}). Shell used by run_cmd: ${sys.shell}${sys.shellKind === "powershell" ? " (PowerShell syntax: no heredocs, no && in Windows PowerShell 5; use ; and here-strings)" : sys.shellKind === "cmd" ? " (cmd.exe syntax)" : " (POSIX/bash syntax)"}.
Workspace (cwd of every run_cmd): ${hostInfo.workspace}
Home: ${sys.home}. Python: ${sys.python || "not found on PATH"}. Node: ${sys.node}. Git: ${sys.git ? "yes" : "no"}.
${win ? "On Windows prefer python / PowerShell for zip, find and grep tasks; zip/unzip/sed may not exist.\n" : ""}Commands run directly on the user's real machine with their permissions (no sandbox). Work inside the workspace unless the user says otherwise.
</environment>`;
  }, [hostInfo]);

  const activeSystemPrompt = useMemo(() => {
    if (isAiRoleSimEnabled) {
      return config.systemPrompt && config.systemPrompt.trim()
        ? `${config.systemPrompt.trim()}\n\n${ROLE_USER_PROMPT}`.trim()
        : ROLE_USER_PROMPT;
    }
    const selectedEffort = config.effort || "fast";
    const effortInstruction = getEffortPrompt(selectedEffort);
    const withEnv = `${effortInstruction.trim()}${environmentBlock ? `\n\n${environmentBlock}` : ""}`;
    if (config.systemPrompt && config.systemPrompt.trim()) {
      return `${config.systemPrompt.trim()}\n\n${withEnv}`.trim();
    }
    return withEnv.trim();
  }, [isAiRoleSimEnabled, config.systemPrompt, config.effort, environmentBlock]);

  // Reset scroll button state when changing sessions or message count to prevent getting stuck
  useEffect(() => {
    setShowScrollButton(false);
    autoScrollEnabledRef.current = true;
    isUserScrolledUpRef.current = false;
  }, [currentSessionId]);

  const refreshWorkspaceFiles = async () => {
    if (!currentSessionId) return;
    const synced = await syncServerWorkspaceFiles(currentSession?.files || {});
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== currentSessionId) return s;
        const currentFiles = s.files || {};
        const currentKeys = Object.keys(currentFiles);
        const syncedKeys = Object.keys(synced);
        if (currentKeys.length === syncedKeys.length) {
          let hasDiff = false;
          for (const k of syncedKeys) {
            if (
              !currentFiles[k] ||
              currentFiles[k].content !== synced[k].content ||
              currentFiles[k].size !== synced[k].size
            ) {
              hasDiff = true;
              break;
            }
          }
          if (!hasDiff) return s;
        }
        return { ...s, files: synced };
      })
    );
  };

  // Real-time synchronization for workspace files
  useEffect(() => {
    refreshWorkspaceFiles();

    // Poll every 1.5s whenever the file tab is open or AI is actively working/executing commands
    let intervalId: any = null;
    if (showFileList || isLoading) {
      intervalId = setInterval(() => {
        refreshWorkspaceFiles();
      }, 1500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [currentSessionId, showFileList, isLoading]);

  useEffect(() => {
    if (autoScrollEnabledRef.current && !isUserScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, searchStatus]);

  const handleSaveConfig = (newConfig: ApiConfig) => {
    setConfig(newConfig);
  };

  const handleToggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Chat Actions
  // historyOverride, when provided, replaces `messages` as the base conversation this
  // turn builds on top of (used by "edit message": everything after the edited message
  // is dropped and the model never sees it, instead of using the live session history).
  const handleSendMessage = async (
    text: string,
    attachment?: AttachedFile,
    isVoice?: boolean,
    voiceLanguage?: string,
    historyOverride?: ChatMessage[]
  ) => {
    if ((!text.trim() && !attachment) || isLoading) return;

    // Save attached file to workspace disk if present
    if (attachment && attachment.name) {
      const isBinary = isBinaryFile(attachment.name) || attachment.type === "binary";
      let content = attachment.textContent || "";
      if (isBinary) {
        if (content.includes(",")) content = content.split(",")[1];
        await uploadFileToWorkspace(attachment.name, content, "base64");
      } else {
        await uploadFileToWorkspace(attachment.name, content, "utf-8");
      }
    }

    const baseMessages = historyOverride !== undefined ? historyOverride : messages;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      attachment: attachment,
      timestamp: Date.now(),
    };

    const updatedMessages = [...baseMessages, userMsg].slice(-100);

    // Update session title if first message
    let sessionTitle = currentSession.title;
    if (baseMessages.length === 0) {
      const displayTitle = text || attachment?.name || "New Chat";
      sessionTitle = displayTitle.slice(0, 30) + (displayTitle.length > 30 ? "..." : "");
    }

    // Update sessions state locally first
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? {
              ...s,
              title: sessionTitle,
              updatedAt: Date.now(),
              messages: updatedMessages,
            }
          : s
      )
    );

    const normalizedText = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
    const isFirstUserMessage = baseMessages.filter((m) => m.role === "user").length === 0;
    const isGreeting = normalizedText === "hi" || normalizedText === "hello";

    // Handle /help command directly ONLY when Role Simulator is active
    if (isAiRoleSimEnabled && text.trim().toLowerCase() === "/help") {
      const helpManual = `=== [DEV_MODE TOOL COMMANDS MANUAL (/help)] ===
You are in Developer Mode. You can execute these AI tool commands:

0. SKILLS & WORKFLOWS:
   list_skills
   load_skills("id1", "id2")
   Example: list_skills
   Example: load_skills("applet-seo", "pwa-integration")

1. WEB SEARCH:
   search("...")(X)
   Example: search("Capital Vietnam")(3)
   Example: search("latest react 19 features")(5)

2. URL SCRAPING / FETCH:
   fetch("https://...")(Y)
   Example: fetch("https://news.ycombinator.com")(1100)

3. RUN_CMD (real shell on the user's machine — python, node, cat, sed, mv, unzip, git):
   run_cmd{ shell command }
   Example: run_cmd{ python3 -c "print(84*2)" }
   Example (save file): run_cmd{ cat > app.py << 'EOF'
print("hi")
EOF }
   Example (edit file): run_cmd{ sed -i 's/old/new/' app.py }
   Example (move file): run_cmd{ mv temp.txt src/main.txt }
   Example (unzip file): run_cmd{ unzip -o archive.zip -d out/ }

4. REAL-TIME WEATHER:
   show_weather(location="auto" | "City Name")
   Example: show_weather(location="Tokyo")

5. MAP LANDMARKS:
   show_map(places=[{"name": "Location Name"}])
   Example: show_map(places=[{"name": "Hoan Kiem Lake, Hanoi"}])

6. TRANSLATION:
   translate(text="...", from="auto", to="vi"|"en"|"ja")
   Example: translate(text="Hello world", from="en", to="vi")

7. VIRTUAL FILESYSTEM (Direct Helper Commands):
   write_file(path="path/to/file.ext", content="...")
   read_file(path="path/to/file.ext")
   edit_file(path="path/to/file.ext", old_content="...", new_content="...")
   delete_file(path="path/to/file.ext")
   move_file(source="path/a", destination="path/b")
   git_diff(path="path/to/file.ext")
   git_checkout(path="path/to/file.ext")
   glob(pattern="**/*.ts")
   grep(pattern="searchTerm")

8. NATIVE VISUALIZATIONS:
   chart(title="...", style="line"|"bar", series=[...])
   pie_chart(title="...", style="donut"|"pie", slices=[...])
   tab_card(mode="copy", tabs=[...])
   step_guide(steps=["Step 1", "Step 2"])

9. CONTEXT COMPACTION (user-typed command):
   /compact
   /compact <optional focus hint>
   Summarizes the entire conversation so far into a single dense message
   to free up context window, like Claude Code's /compact.
   Example: /compact keep all code snippets in full`;

      const helpMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: helpManual,
        timestamp: Date.now(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...updatedMessages, helpMsg].slice(-100),
              }
            : s
        )
      );
      return;
    }

    // Handle /mcps and /mcp command — show MCP servers status (like Claude Code /mcp and opencode mcp list)
    if (text.trim().toLowerCase() === "/mcps" || text.trim().toLowerCase() === "/mcp" || text.trim().toLowerCase().startsWith("/mcps ") || text.trim().toLowerCase().startsWith("/mcp ")) {
      setIsLoading(true);
      try {
        const statusData = await fetchMcpStatus();
        const formatted = formatMcpStatusForChat(statusData);
        const mcpMsg = {
          id: (Date.now() + 1).toString(),
          role: "assistant" as const,
          content: formatted,
          timestamp: Date.now(),
          mcpStatus: statusData.servers,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, updatedAt: Date.now(), messages: [...updatedMessages, mcpMsg].slice(-100) }
              : s
          )
        );
      } catch (e:any) {
        const errMsg = {
          id: (Date.now() + 1).toString(),
          role: "assistant" as const,
          content: `MCP status error: ${e?.message || e}`,
          timestamp: Date.now(),
          status: "error" as const,
        };
        setSessions((prev) => prev.map((s) => s.id === currentSessionId ? { ...s, updatedAt: Date.now(), messages: [...updatedMessages, errMsg].slice(-100) } : s));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Handle /compact command directly - summarizes the entire conversation
    // so far into a single dense message (like Claude Code / OpenCode /compact),
    // freeing up context window. Usage: "/compact" or "/compact <focus hint>".
    if (/^\/compact(\s|$)/i.test(text.trim())) {
      const focusInstruction = text.trim().replace(/^\/compact/i, "").trim();

      if (baseMessages.length < MIN_MESSAGES_TO_COMPACT) {
        const notEnoughMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Not enough conversation history to compact (at least a few turns are needed before running /compact).",
          timestamp: Date.now(),
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, updatedAt: Date.now(), messages: [...updatedMessages, notEnoughMsg].slice(-100) }
              : s
          )
        );
        return;
      }

      setIsLoading(true);
      setSearchStatus(`[COMPACTING_CONTEXT: ${baseMessages.length} messages]`);
      abortControllerRef.current = new AbortController();
      const compactSignal = abortControllerRef.current.signal;

      const beforeTokens = estimateTokens(activeSystemPrompt) + baseMessages.reduce(
        (sum, m) => sum + estimateTokens(m.content),
        0
      );
      const compactPayload = buildCompactSummaryPayload(baseMessages, focusInstruction);

      try {
        const summaryText = await sendChatMessage(compactPayload, config, undefined, compactSignal);
        const afterTokens = estimateTokens(summaryText);

        const compactedContent = formatCompactedMessage(summaryText, {
          beforeMessages: baseMessages.length,
          beforeTokens,
          afterTokens,
        });

        const compactedMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: compactedContent,
          timestamp: Date.now(),
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, updatedAt: Date.now(), messages: [compactedMsg] }
              : s
          )
        );
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          const errMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `[ERROR] Unable to compact conversation: ${err?.message || "unknown error"}. Conversation history preserved.`,
            timestamp: Date.now(),
            status: "error",
          };
          setSessions((prev) =>
            prev.map((s) =>
              s.id === currentSessionId
                ? { ...s, updatedAt: Date.now(), messages: [...updatedMessages, errMsg].slice(-100) }
                : s
            )
          );
        }
      } finally {
        setIsLoading(false);
        setSearchStatus(null);
      }
      return;
    }


    // Direct User Command Execution (in AI Role Simulator / Dev Mode)
    const userWriteCmds = parseWriteCommands(text);
    const userEditCmds = parseEditCommands(text);
    const userDeleteCmds = parseDeleteCommands(text);
    const userMoveCmds = parseMoveCommands(text);
    const userGitDiffCmds = parseGitDiffCommands(text);
    const userGitCheckoutCmds = parseGitCheckoutCommands(text);
    const userReadCmds = parseReadCommands(text);
    const userGlobCmds = parseGlobCommands(text);
    const userGrepCmds = parseGrepCommands(text);
    const userSearchCmds = extractAllSearchCommands(text);
    const userFetchCmds = extractAllFetchCommands(text);
    const userListHistoryCmds = extractAllListHistoryCommands(text);
    const userSeeHistoryCmds = extractAllSeeHistoryCommands(text);
    const userListKeywordsCmds = extractAllListKeywordsCommands(text);
    const userHasListSkills = hasListSkillsCommand(text);
    const userLoadSkillsCmds = parseLoadSkillsCommands(text);
    const userHasInstallPack = hasInstallPackCommand(text);
    const userReadDocsCmds = parseReadDocsCommands(text);
    const userRunCmdCmds = parseRunCmdCommands(text);
    const userShowMapCmds = extractShowMapCommands(text);
    const userTranslateCmds = extractTranslateCommands(text);
    const userWeatherCmds = extractWeatherCommands(text);
    const userStepGuides = extractStepGuides(text);
    const userTabCards = extractTabCards(text);
    const userCharts = extractChartDisplays(text);
    const userPieCharts = extractPieChartDisplays(text);

    const userImageSearchCmds = extractAllImageSearchCommands(text);
    const userMcpCallCmds = extractAllMcpCalls(text);
    const totalUserCommandsCount =
      userWriteCmds.length +
      userEditCmds.length +
      userDeleteCmds.length +
      userMoveCmds.length +
      userGitDiffCmds.length +
      userGitCheckoutCmds.length +
      userReadCmds.length +
      userGlobCmds.length +
      userGrepCmds.length +
      userSearchCmds.length +
      userFetchCmds.length +
      userListHistoryCmds.length +
      userSeeHistoryCmds.length +
      userListKeywordsCmds.length +
      (userHasListSkills ? 1 : 0) +
      userLoadSkillsCmds.length +
      (userHasInstallPack ? 1 : 0) +
      userReadDocsCmds.length +
      userRunCmdCmds.length +
      userShowMapCmds.length +
      userTranslateCmds.length +
      userWeatherCmds.length +
      userStepGuides.length +
      userTabCards.length +
      userCharts.length +
      userPieCharts.length +
      userImageSearchCmds.length +
      userMcpCallCmds.length;

    if (totalUserCommandsCount > 0) {
      setIsLoading(true);
      const combinedOutputs: string[] = [];
      let currentSessionFiles: Record<string, VirtualFile> = { ...(currentSession?.files || {}) };
      const touchedFilesThisTurn = new Set<string>();
      const generatedMapCards: any[] = [];
      const generatedTranslationCards: TranslationCardData[] = [];
      const generatedWeatherCards: WeatherCardData[] = [];
      const generatedImageCards: any[] = [];
      let mcpStatusForMessage: any = null;

      // 1. File Writes
      for (const w of userWriteCmds) {
        setSearchStatus(`Creating file ${w.filePath}...`);
        const res = executeWrite(currentSessionFiles, w.filePath, w.content);
        currentSessionFiles = res.updatedFiles;
        touchedFilesThisTurn.add(res.savedFile.path);
        combinedOutputs.push(res.result);
      }

      // 2. File Edits
      for (const e of userEditCmds) {
        setSearchStatus(`Editing file ${e.filePath}...`);
        const res = executeEdit(currentSessionFiles, e.filePath, e.oldString, e.newString, e.replaceAll);
        currentSessionFiles = res.updatedFiles;
        if (res.savedFile) touchedFilesThisTurn.add(res.savedFile.path);
        combinedOutputs.push(res.result);
      }

      // 3. File Deletes
      for (const d of userDeleteCmds) {
        setSearchStatus(`Deleting file ${d.filePath}...`);
        const res = executeDelete(currentSessionFiles, d.filePath);
        currentSessionFiles = res.updatedFiles;
        if (res.deletedPath) {
          touchedFilesThisTurn.delete(res.deletedPath);
          if (activeArtifactPath === res.deletedPath) {
            const remainingPaths = Object.keys(currentSessionFiles);
            setActiveArtifactPath(remainingPaths.length > 0 ? remainingPaths[0] : null);
          }
        }
        combinedOutputs.push(res.result);
      }

      // 4. File Moves
      for (const m of userMoveCmds) {
        setSearchStatus(`Moving file ${m.sourcePath} -> ${m.destinationPath}...`);
        const res = executeMove(currentSessionFiles, m.sourcePath, m.destinationPath);
        currentSessionFiles = res.updatedFiles;
        if (res.movedFile) {
          touchedFilesThisTurn.delete(m.sourcePath);
          touchedFilesThisTurn.add(res.movedFile.path);
          if (activeArtifactPath === m.sourcePath) {
            setActiveArtifactPath(res.movedFile.path);
          }
        }
        combinedOutputs.push(res.result);
      }

      // 5. Git Diff
      for (const df of userGitDiffCmds) {
        setSearchStatus(`Checking git diff ${df.filePath}...`);
        const res = executeGitDiff(currentSessionFiles, df.filePath);
        combinedOutputs.push(res);
      }

      // 6. Git Checkout
      for (const co of userGitCheckoutCmds) {
        setSearchStatus(`Reverting file (git checkout) ${co.filePath}...`);
        const res = executeGitCheckout(currentSessionFiles, co.filePath);
        currentSessionFiles = res.updatedFiles;
        if (res.revertedFile) {
          touchedFilesThisTurn.add(res.revertedFile.path);
        }
        combinedOutputs.push(res.result);
      }

      // 7. File Reads
      for (const r of userReadCmds) {
        setSearchStatus(`Reading file ${r.filePath}...`);
        const readResult = executeRead(currentSessionFiles, r.filePath, r.offset, r.limit);
        combinedOutputs.push(readResult);
      }

      // 8. Glob
      for (const g of userGlobCmds) {
        setSearchStatus(`Listing directory ${g.pattern}...`);
        const globResult = executeGlob(currentSessionFiles, g.pattern, g.path);
        combinedOutputs.push(globResult);
      }

      // 9. Grep
      for (const gr of userGrepCmds) {
        setSearchStatus(`Searching inside files ${gr.pattern}...`);
        const grepResult = executeGrep(currentSessionFiles, gr.pattern, gr.path, gr.glob);
        combinedOutputs.push(grepResult);
      }

      // 10. Web Searches
      for (const s of userSearchCmds) {
        setSearchStatus(`Searching the web: "${s.query}"...`);
        const searchResultText = await performYahooSearch(s.query, s.count);
        combinedOutputs.push(searchResultText);
      }

      // 11. URL Fetches
      for (const f of userFetchCmds) {
        setSearchStatus(`Fetching URL ${f.url.slice(0, 30)}...`);
        const fetchResultText = await performFetchUrl(f.url, f.length);
        const effectiveResult = fetchResultText && fetchResultText.trim()
          ? fetchResultText
          : "you entered an incorrect URL, are missing characters, or the website no longer exists";
        combinedOutputs.push(effectiveResult);
      }

      // 12. History List
      for (const lh of userListHistoryCmds) {
        setSearchStatus(`Reading chat history part ${lh.part}...`);
        const turns = extractHistoryTurns(baseMessages, true, config.thinkStartTag, config.thinkEndTag);
        const historyResultText = handleListHistory(turns, lh.part, lh.limit);
        combinedOutputs.push(historyResultText);
      }

      // 13. See History
      for (const sh of userSeeHistoryCmds) {
        setSearchStatus(`Viewing chat turns ${sh.turnNumbers.join(", ")}...`);
        const turns = extractHistoryTurns(baseMessages, true, config.thinkStartTag, config.thinkEndTag);
        const historyResultText = handleSeeHistory(turns, sh.turnNumbers, sh.limit);
        combinedOutputs.push(historyResultText);
      }

      // 14. History Keywords
      for (const lk of userListKeywordsCmds) {
        setSearchStatus(`Searching chat history for ${lk.keywords.join(", ")}...`);
        const turns = extractHistoryTurns(baseMessages, true, config.thinkStartTag, config.thinkEndTag);
        const keywordsResultText = handleListChatKeywords(turns, lk.keywords);
        combinedOutputs.push(keywordsResultText);
      }

      // 15. run_cmd (real shell on the user's machine)
      for (const cmd of userRunCmdCmds) {
        setSearchStatus(`Running command...`);
        const runResult = await executeRunCmd(cmd.code);
        combinedOutputs.push(runResult);
      }
      currentSessionFiles = await syncServerWorkspaceFiles(currentSessionFiles);
      for (const p of Object.keys(currentSessionFiles)) {
        const f = currentSessionFiles[p];
        if (f.updatedAt && f.updatedAt >= Date.now() - 30000) {
          touchedFilesThisTurn.add(p);
        }
      }

      // 17. Skills list
      if (userHasListSkills) {
        setSearchStatus("Listing available skills...");
        const listSkillsResult = executeListSkills(config.skills || [], text);
        combinedOutputs.push(listSkillsResult);
      }

      // 18. Skills load
      for (const ls of userLoadSkillsCmds) {
        setSearchStatus(`Loading skill(s): ${ls.skillIds.join(", ")}...`);
        const loadedResult = executeLoadSkills(config.skills || [], ls.skillIds, text);
        combinedOutputs.push(loadedResult);
      }

      // 18.1. Install Pack V1
      if (userHasInstallPack) {
        setSearchStatus("Installing and verifying essential library packages (install_pack_v1)...");
        const installResult = await executeInstallPack();
        combinedOutputs.push(installResult);
      }

      // 19. Read docs
      for (const rd of userReadDocsCmds) {
        setSearchStatus(`Reading doc ${rd.docName}...`);
        const docResult = await executeReadDoc(rd.docName);
        combinedOutputs.push(docResult);
      }

      // 20. Show Map
      for (const mCmd of userShowMapCmds) {
        const validPlaces = mCmd.places.filter((p) => p.name && p.name.trim());
        if (validPlaces.length > 0) {
          setSearchStatus(`Rendering map for ${validPlaces.map((p) => p.name).join(", ")}...`);
          const mapCardData = { title: mCmd.title, places: validPlaces };
          generatedMapCards.push(mapCardData);
          const mapRes = `Map displayed for: ${validPlaces.map((p) => p.name).join(", ")}.`;
          combinedOutputs.push(mapRes);
        }
      }

      // 21. Translate
      for (const tCmd of userTranslateCmds) {
        setSearchStatus(`Translating text: "${tCmd.text.slice(0, 25)}..."...`);
        const transCardData = await performTranslate(tCmd);
        generatedTranslationCards.push(transCardData);
        const transRes = transCardData.error
          ? `Translation error: ${transCardData.error}`
          : `[TRANSLATION RESULT: "${transCardData.originalText}" (${transCardData.fromLang} -> ${transCardData.toLang}): "${transCardData.translatedText}"]`;
        combinedOutputs.push(transRes);
      }

      // 22. Weather
      for (const wCmd of userWeatherCmds) {
        setSearchStatus(`Fetching weather for ${wCmd.location}...`);
        const weatherCardData = await performWeatherFetch(wCmd);
        generatedWeatherCards.push(weatherCardData);
        const weatherRes = weatherCardData.error 
          ? `Weather fetch error: ${weatherCardData.error}`
          : `[WEATHER RESULT: ${weatherCardData.location} - ${weatherCardData.temperature}°C, ${weatherCardData.condition}]`;
        combinedOutputs.push(weatherRes);
      }

      // 23. Image search (SearXNG images)
      for (const imCmd of userImageSearchCmds) {
        setSearchStatus(`Searching images: "${imCmd.query}"...`);
        const { images, formattedText } = await performImageSearch(imCmd.query, imCmd.count);
        generatedImageCards.push({ query: imCmd.query, images, count: images.length });
        const line = formattedText || `Displayed ${images.length} images for "${imCmd.query}"`;
        combinedOutputs.push(line);
      }

      // 24. MCP calls
      for (const mCmd of userMcpCallCmds) {
        setSearchStatus(`Calling MCP ${mCmd.server}.${mCmd.tool}...`);
        try {
          const mRes = await callMcpTool(mCmd.server, mCmd.tool, mCmd.args);
          const textOut = Array.isArray((mRes as any)?.content) ? (mRes as any).content.map((b:any)=>b.text||JSON.stringify(b)).join("\n") : JSON.stringify(mRes).slice(0, 4000);
          combinedOutputs.push(`[MCP ${mCmd.server}.${mCmd.tool} result]: ${textOut}`);
        } catch (e:any){
          combinedOutputs.push(`[MCP ${mCmd.server}.${mCmd.tool} error]: ${e?.message || e}`);
        }
      }

      if (touchedFilesThisTurn.size > 0 && !activeArtifactPath) {
        setActiveArtifactPath(Array.from(touchedFilesThisTurn)[0]);
      }

      const cleanSummary = combinedOutputs.filter(Boolean).join("\n\n") || "Command executed successfully.";

      const cmdExecutionMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: cleanSummary,
        timestamp: Date.now(),
        fileArtifacts: touchedFilesThisTurn.size > 0 ? Array.from(touchedFilesThisTurn) : undefined,
        mapCards: generatedMapCards.length > 0 ? generatedMapCards : undefined,
        translations: generatedTranslationCards.length > 0 ? generatedTranslationCards : undefined,
        weatherCards: generatedWeatherCards.length > 0 ? generatedWeatherCards : undefined,
        imageSearchCards: generatedImageCards.length > 0 ? generatedImageCards : undefined,
        stepGuides: userStepGuides.length > 0 ? userStepGuides : undefined,
        tabCards: userTabCards.length > 0 ? userTabCards : undefined,
        charts: userCharts.length > 0 ? userCharts : undefined,
        pieCharts: userPieCharts.length > 0 ? userPieCharts : undefined,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...updatedMessages, cmdExecutionMsg].slice(-100),
                files: currentSessionFiles,
              }
            : s
        )
      );

      setSearchStatus(null);
      setIsLoading(false);
      return;
    }

    if (isFirstUserMessage && isGreeting) {
      setIsLoading(true);
      setTimeout(() => {
        const aiResponse = isAiRoleSimEnabled
          ? "Hello! I am a developer working on a project and need assistance. Can you help me write, test code, or run commands?"
          : Math.random() < 0.5 
            ? "Hi! How can I help you today?" 
            : "Hello! How can I assist you today?";
        
        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: aiResponse,
          timestamp: Date.now(),
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? {
                  ...s,
                  updatedAt: Date.now(),
                  messages: [...updatedMessages, aiMsg].slice(-100),
                }
              : s
          )
        );
        setIsLoading(false);
      }, 400);
      return;
    }

    setIsLoading(true);
    setSearchStatus(null);
    abortControllerRef.current = new AbortController();
    const currentSignal = abortControllerRef.current.signal;

    // Prepare API messages list (custom system prompt + active history)
    const apiMessagesPayload: { role: string; content: string | any[] }[] = [];
    
    let finalSystemPrompt = "";
    if (isAiRoleSimEnabled) {
      finalSystemPrompt = config.systemPrompt && config.systemPrompt.trim()
        ? `${config.systemPrompt.trim()}\n\n${ROLE_USER_PROMPT}`.trim()
        : ROLE_USER_PROMPT;
    } else {
      const selectedEffort = config.effort || "fast";
      const effortInstruction = getEffortPrompt(selectedEffort);
      
      if (config.systemPrompt && config.systemPrompt.trim()) {
        finalSystemPrompt = effortInstruction.trim() 
          ? `${config.systemPrompt.trim()}\n\n${effortInstruction.trim()}`.trim()
          : config.systemPrompt.trim();
      } else {
        finalSystemPrompt = effortInstruction.trim();
      }
    }

    if (isVoice) {
      let speakLanguageName = "English";
      if (voiceLanguage === "vi-VN") speakLanguageName = "Vietnamese";
      else if (voiceLanguage === "zh-CN") speakLanguageName = "Chinese";
      else if (voiceLanguage === "fr-FR") speakLanguageName = "French";

      finalSystemPrompt += 
        "\n\n[Voice Mode System Constraints]:" +
        `\n- Please speak strictly in simple ${speakLanguageName}.` +
        "\n- Keep replies short, clear, and direct.";
    }

    if (!isAiRoleSimEnabled) {
      finalSystemPrompt += await getMcpToolsPrompt();
      if (config.memEnabled) {
        finalSystemPrompt += getMemToolsPrompt();
      }
      if (config.agentEnabled) {
        finalSystemPrompt += getAgentToolsPrompt(config.agents || []);
      }
    }

    const latestUserMsg = updatedMessages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
    if (shouldAutoLoadDocsSkill(latestUserMsg) || shouldAutoLoadDocsSkill(text)) {
      finalSystemPrompt = finalSystemPrompt.trim()
        ? `${finalSystemPrompt.trim()}\n\n[System Documentation Skill Loaded]:\n${LOCKED_DOCS_INSTRUCTION}`
        : `[System Documentation Skill Loaded]:\n${LOCKED_DOCS_INSTRUCTION}`;
    }

    // Appended last on purpose: skills matched to this message (or, in omni mode,
    // everything) are shown at the end so the model does not need list_skills.
    if (!isAiRoleSimEnabled) {
      if (config.effort === "omni") {
        finalSystemPrompt += buildOmniContext(config);
      } else {
        finalSystemPrompt += buildActiveSkillsPrompt(config.skills || [], latestUserMsg || text);
      }
    }

    if (finalSystemPrompt) {
      apiMessagesPayload.push({ role: "system", content: finalSystemPrompt });
    }

    // Mem keyword hint: if the mem toggle is on and this turn's own text
    // matches a saved memory's keywords, prepend a short reminder to use
    // read_mem -- for the API call only, so read_mem still works even if the
    // AI hasn't loaded the write_mem skill (which covers the deeper "when to
    // proactively save something" guidance, not needed just to read one back).
    const memHintForThisTurn =
      config.memEnabled
        ? buildMemHint(findMatchingMemEntries(text, config.userMemEntries || [], config.aiMemEntries || []))
        : "";

    const recentMessagesSlice = updatedMessages.slice(-20);
    recentMessagesSlice.forEach((m, mIdx) => {
      const isCurrentTurnUserMsg = memHintForThisTurn && mIdx === recentMessagesSlice.length - 1 && m.role === "user";
      if (m.role === "assistant" || m.role === "system") {
        apiMessagesPayload.push({ role: m.role, content: m.content });
      } else {
        // User message formatting
        if (m.attachment?.type === "image" && m.attachment.dataUrl) {
          let imageUrl = m.attachment.dataUrl.trim();
          if (!imageUrl.startsWith("data:image") && !imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
            const mime = m.attachment.mimeType || "image/jpeg";
            imageUrl = `data:${mime};base64,${imageUrl}`;
          }

          apiMessagesPayload.push({
            role: "user",
            content: [
              {
                type: "text",
                text: isCurrentTurnUserMsg
                  ? `${memHintForThisTurn}\n\n${m.content || "Describe this image in detail"}`
                  : m.content || "Describe this image in detail",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          });
        } else if (m.attachment && m.attachment.name) {
          const sizeKb = ((m.attachment.size || 0) / 1024).toFixed(1);
          const fileNotice = `[FILE_UPLOADED_TO_WORKSPACE: ${m.attachment.name} (${sizeKb} KB)]\nThis file has been saved in your workspace files environment as "${m.attachment.name}". Do NOT ask the user to re-paste or re-send it. Use \`run_cmd\` (e.g. unzip, python3 -m zipfile, cat, head) or \`Read("${m.attachment.name}")\` to inspect and read its content as needed.`;
          let formattedText = m.content
            ? `${m.content}\n\n${fileNotice}`
            : fileNotice;
          if (isCurrentTurnUserMsg) formattedText = `${memHintForThisTurn}\n\n${formattedText}`;
          apiMessagesPayload.push({ role: "user", content: formattedText });
        } else {
          const content = isCurrentTurnUserMsg ? `${memHintForThisTurn}\n\n${m.content}` : m.content;
          apiMessagesPayload.push({ role: "user", content });
        }
      }
    });

    try {
      const workingPayload = [...apiMessagesPayload];
      const MAX_SEARCH_STEPS = 8;
      let searchSteps = 0;
      let finalResponse = "";
      // Permission tab: max tool calls the AI may use in one turn (empty = no limit)
      let toolCallLimit = 0;
      try {
        const pr = await fetch("/api/permissions");
        if (pr.ok) toolCallLimit = Math.floor(parseFloat((await pr.json())?.limits?.maxToolCalls)) || 0;
      } catch {}
      let toolCallsUsed = 0;
      let toolLimitWarned = false;

      let currentSessionFiles: Record<string, VirtualFile> = { ...(currentSession?.files || {}) };
      const touchedFilesThisTurn = new Set<string>();
      let currentAiMemEntries = config.aiMemEntries || [];

      const updateRealtimeFiles = (newFiles: Record<string, VirtualFile>, newArtifacts?: string[]) => {
        if (newArtifacts && newArtifacts.length > 0) {
          newArtifacts.forEach((p) => touchedFilesThisTurn.add(p));
        }
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== currentSessionId) return s;
            const msgs = [...s.messages];
            const existingIdx = msgs.findIndex((m) => m.id === turnPlaceholderId);
            if (existingIdx !== -1) {
              const artifactsArr = Array.from(touchedFilesThisTurn);
              msgs[existingIdx] = {
                ...msgs[existingIdx],
                fileArtifacts: artifactsArr.length > 0 ? artifactsArr : undefined,
              };
            }
            return {
              ...s,
              files: newFiles,
              messages: msgs,
            };
          })
        );
      };
      
      const startPayloadLength = workingPayload.length;
      const turnPlaceholderId = (Date.now() + Math.random()).toString();
      const turnStartTime = Date.now();
      const collectedThoughtSteps: { step: number; durationSeconds: number; text: string }[] = [];
      const generatedMapCards: any[] = [];
      const generatedTranslationCards: TranslationCardData[] = [];
      const generatedWeatherCards: WeatherCardData[] = [];
      const generatedImageCards: any[] = [];
      let mcpStatusForMessage: any = null;

      // Autonomous execution loop for search, fetch, history, and file system commands
      while (searchSteps < MAX_SEARCH_STEPS) {
        searchSteps++;
        const stepStartTime = Date.now();

        setLastRawRequest({
          model: config.model,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          top_p: config.topP,
          top_k: config.topK,
          repeat_penalty: config.repeatPenalty,
          reasoning_effort: config.reasoningEffort,
          messages: workingPayload,
        });

        let currentResponse = await sendChatMessage(workingPayload, config, (chunkText) => {
          if (chunkText) {
            setSearchStatus(null);
          }

          const aiMessagesSinceStart = workingPayload
            .slice(startPayloadLength)
            .filter(m => m.role === "assistant")
            .map(m => m.content as string);
            
          let fullContent = aiMessagesSinceStart.map(msg => `[INTERMEDIATE]\n${msg}\n[/INTERMEDIATE]`).join("\n\n");
          if (fullContent) fullContent += "\n\n";
          fullContent += chunkText;

          const currentArtifacts = Array.from(touchedFilesThisTurn);
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== currentSessionId) return s;
              const msgs = [...s.messages];
              const existingIdx = msgs.findIndex(m => m.id === turnPlaceholderId);
              const streamingMsg: ChatMessage = {
                id: turnPlaceholderId,
                role: "assistant",
                content: fullContent,
                timestamp: Date.now(),
                status: "sending",
                fileArtifacts: currentArtifacts.length > 0 ? currentArtifacts : undefined,
              };
              if (existingIdx !== -1) {
                msgs[existingIdx] = streamingMsg;
              } else {
                msgs.push(streamingMsg);
              }
              return { ...s, files: currentSessionFiles, messages: msgs.slice(-100) };
            })
          );

          if (autoScrollEnabledRef.current && !isUserScrolledUpRef.current) {
            if (chatContainerRef.current) {
              chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
          }
        }, currentSignal);

        // See stripFakeIntermediateTags' own comment: [INTERMEDIATE] tags are
        // ours, never the model's — drop any it echoed before this response
        // is stored, displayed, or fed back into workingPayload.
        currentResponse = stripFakeIntermediateTags(currentResponse);

        setLastRawResponse(currentResponse);

        const stepDurationSeconds = Math.max(1, Math.round((Date.now() - stepStartTime) / 1000));
        const stepThinkParsed = parseThinkContent(
          currentResponse,
          config.thinkStartTag || "<think>",
          config.thinkEndTag || "</think>"
        );
        if (stepThinkParsed.hasThought && stepThinkParsed.thoughtText) {
          collectedThoughtSteps.push({
            step: searchSteps,
            durationSeconds: stepDurationSeconds,
            text: stepThinkParsed.thoughtText,
          });
        }

        // Strip thinking/reasoning tags to ensure commands inside <think>...</think> are NOT executed
        const thinkParsed = parseThinkContent(
          currentResponse,
          config.thinkStartTag || "<think>",
          config.thinkEndTag || "</think>"
        );
        const commandSourceText = thinkParsed.mainText;

        // If AI Role Simulator is active, the AI is role-playing as the User (posing tasks/sharing prompts/manuals).
        // It must NOT execute any autonomous tool commands or loops.
        if (isAiRoleSimEnabled) {
          finalResponse = currentResponse;
          setSearchStatus(null);
          break;
        }

        const writeCmds = parseWriteCommands(commandSourceText);
        const editCmds = parseEditCommands(commandSourceText);
        const deleteCmds = parseDeleteCommands(commandSourceText);
        const moveCmds = parseMoveCommands(commandSourceText);
        const gitDiffCmds = parseGitDiffCommands(commandSourceText);
        const gitCheckoutCmds = parseGitCheckoutCommands(commandSourceText);
        const readCmds = parseReadCommands(commandSourceText);
        const globCmds = parseGlobCommands(commandSourceText);
        const grepCmds = parseGrepCommands(commandSourceText);

        const allSearchCmds = extractAllSearchCommands(commandSourceText);
        const allFetchCmds = extractAllFetchCommands(commandSourceText);
        const allListHistoryCmds = extractAllListHistoryCommands(commandSourceText);
        const allSeeHistoryCmds = extractAllSeeHistoryCommands(commandSourceText);
        const allListKeywordsCmds = extractAllListKeywordsCommands(commandSourceText);
        const hasListSkills = hasListSkillsCommand(commandSourceText);
        const loadSkillsCmds = parseLoadSkillsCommands(commandSourceText);
        const hasInstallPack = hasInstallPackCommand(commandSourceText);
        const readDocsCmds = parseReadDocsCommands(commandSourceText);
        const runCmdCmds = parseRunCmdCommands(commandSourceText);
        const writeMemCmds = config.memEnabled ? parseWriteMemCommands(commandSourceText) : [];
        const readMemCmds = config.memEnabled ? parseReadMemCommands(commandSourceText) : [];
        const listAgentCmds = config.agentEnabled ? parseListAgentCommands(commandSourceText) : [];
        const promptAgentCmds = config.agentEnabled ? parsePromptAgentCommands(commandSourceText) : [];
        const viewImageAgentCmds = config.agentEnabled ? parseViewImageAgentCommands(commandSourceText) : [];
        const runCmdBgCmds = parseRunCmdBgCommands(commandSourceText);
        const listCmdBgCmds = parseListCmdBgCommands(commandSourceText);
        const killCmdBgCmds = parseKillCmdBgCommands(commandSourceText);
        const readCmdBgLogCmds = parseReadCmdBgLogCommands(commandSourceText);
        const hasFailedFetch = hasUnexecutedFetch(commandSourceText);
        const hasUnrecognizedCmd = detectUnrecognizedOrMalformedCommands(commandSourceText);
        const allShowMapCmds = extractShowMapCommands(commandSourceText);
        const allTranslateCmds = extractTranslateCommands(commandSourceText);
        const allWeatherCmds = extractWeatherCommands(commandSourceText);
        const allImageSearchCmds = extractAllImageSearchCommands(commandSourceText);
        const allMcpCallCmds = extractAllMcpCalls(commandSourceText);

        const totalCommandsCount =
          writeCmds.length +
          editCmds.length +
          deleteCmds.length +
          moveCmds.length +
          gitDiffCmds.length +
          gitCheckoutCmds.length +
          readCmds.length +
          globCmds.length +
          grepCmds.length +
          allSearchCmds.length +
          allFetchCmds.length +
          allListHistoryCmds.length +
          allSeeHistoryCmds.length +
          allListKeywordsCmds.length +
          (hasListSkills ? 1 : 0) +
          loadSkillsCmds.length +
          (hasInstallPack ? 1 : 0) +
          readDocsCmds.length +
          runCmdCmds.length +
          writeMemCmds.length +
          readMemCmds.length +
          listAgentCmds.length +
          promptAgentCmds.length +
          viewImageAgentCmds.length +
          runCmdBgCmds.length +
          listCmdBgCmds.length +
          killCmdBgCmds.length +
          readCmdBgLogCmds.length +
          allShowMapCmds.length +
          allTranslateCmds.length +
          allWeatherCmds.length +
          allImageSearchCmds.length +
          allMcpCallCmds.length;

        if (toolCallLimit > 0 && totalCommandsCount > 0) {
          toolCallsUsed += totalCommandsCount;
          if (toolCallsUsed > toolCallLimit) {
            // Over the user's per-turn tool-call limit: run nothing, tell the AI to wrap up.
            setSearchStatus(null);
            if (toolLimitWarned) {
              finalResponse = `[Tool-call limit reached: the user allows at most ${toolCallLimit} tool calls per turn.]`;
              break;
            }
            toolLimitWarned = true;
            workingPayload.push({ role: "assistant", content: currentResponse });
            workingPayload.push({
              role: "user",
              content: `[TOOL_LIMIT] The user allows at most ${toolCallLimit} tool calls per turn and that limit is reached. Those last calls were NOT run. Do not call any more tools: write your final answer now from what you already have, and say what is left undone.`,
            });
            continue;
          }
        }

        if (totalCommandsCount > 0 || hasFailedFetch || hasUnrecognizedCmd) {
          const combinedOutputs: string[] = [];

          // 1. File Writes
          for (const w of writeCmds) {
            setSearchStatus(`Creating file ${w.filePath}...`);
            const res = executeWrite(currentSessionFiles, w.filePath, w.content);
            currentSessionFiles = res.updatedFiles;
            touchedFilesThisTurn.add(res.savedFile.path);
            updateRealtimeFiles(currentSessionFiles, [res.savedFile.path]);
            combinedOutputs.push(res.result);
          }

          // 2. File Edits
          for (const e of editCmds) {
            setSearchStatus(`Editing file ${e.filePath}...`);
            const res = executeEdit(currentSessionFiles, e.filePath, e.oldString, e.newString, e.replaceAll);
            currentSessionFiles = res.updatedFiles;
            if (res.savedFile) {
              touchedFilesThisTurn.add(res.savedFile.path);
              updateRealtimeFiles(currentSessionFiles, [res.savedFile.path]);
            }
            combinedOutputs.push(res.result);
          }

          // 3. File Deletions
          for (const d of deleteCmds) {
            setSearchStatus(`Deleting file ${d.filePath}...`);
            const res = executeDelete(currentSessionFiles, d.filePath);
            currentSessionFiles = res.updatedFiles;
            if (res.deletedPath) {
              touchedFilesThisTurn.delete(res.deletedPath);
              if (activeArtifactPath === res.deletedPath) {
                const remainingPaths = Object.keys(currentSessionFiles);
                setActiveArtifactPath(remainingPaths.length > 0 ? remainingPaths[0] : null);
              }
            }
            updateRealtimeFiles(currentSessionFiles);
            combinedOutputs.push(res.result);
          }

          // 4. File Moves
          for (const m of moveCmds) {
            setSearchStatus(`Moving file ${m.sourcePath} -> ${m.destinationPath}...`);
            const res = executeMove(currentSessionFiles, m.sourcePath, m.destinationPath);
            currentSessionFiles = res.updatedFiles;
            if (res.movedFile) {
              touchedFilesThisTurn.delete(m.sourcePath);
              touchedFilesThisTurn.add(res.movedFile.path);
              if (activeArtifactPath === m.sourcePath) {
                setActiveArtifactPath(res.movedFile.path);
              }
              updateRealtimeFiles(currentSessionFiles, [res.movedFile.path]);
            }
            combinedOutputs.push(res.result);
          }

          // 5. Git Diff
          for (const df of gitDiffCmds) {
            setSearchStatus(`Checking git diff ${df.filePath}...`);
            const res = executeGitDiff(currentSessionFiles, df.filePath);
            combinedOutputs.push(res);
          }

          // 6. Git Checkout
          for (const co of gitCheckoutCmds) {
            setSearchStatus(`Reverting file (git checkout) ${co.filePath}...`);
            const res = executeGitCheckout(currentSessionFiles, co.filePath);
            currentSessionFiles = res.updatedFiles;
            if (res.revertedFile) {
              touchedFilesThisTurn.add(res.revertedFile.path);
              updateRealtimeFiles(currentSessionFiles, [res.revertedFile.path]);
            }
            combinedOutputs.push(res.result);
          }

          // 7. File Reads
          for (const r of readCmds) {
            setSearchStatus(`Reading file ${r.filePath}...`);
            const readResult = executeRead(currentSessionFiles, r.filePath, r.offset, r.limit);
            combinedOutputs.push(readResult);
          }

          // 8. Glob directory listings
          for (const g of globCmds) {
            setSearchStatus(`Listing directory ${g.pattern}...`);
            const globResult = executeGlob(currentSessionFiles, g.pattern, g.path);
            combinedOutputs.push(globResult);
          }

          // 9. Grep searches
          for (const gr of grepCmds) {
            setSearchStatus(`Searching inside files ${gr.pattern}...`);
            const grepResult = executeGrep(currentSessionFiles, gr.pattern, gr.path, gr.glob);
            combinedOutputs.push(grepResult);
          }

          // 10. Web Searches (execute all)
          for (const s of allSearchCmds) {
            setSearchStatus(`Searching the web: "${s.query}"...`);
            const searchResultText = await performYahooSearch(s.query, s.count);
            combinedOutputs.push(searchResultText);
          }

          // 11. URL Fetches (execute all)
          for (const f of allFetchCmds) {
            setSearchStatus(`Fetching URL ${f.url.slice(0, 30)}...`);
            const fetchResultText = await performFetchUrl(f.url, f.length);
            const effectiveResult = fetchResultText && fetchResultText.trim()
              ? fetchResultText
              : "you entered an incorrect URL, are missing characters, or the website no longer exists";
            combinedOutputs.push(effectiveResult);
          }

          // 12. History List commands
          for (const lh of allListHistoryCmds) {
            setSearchStatus(`Reading chat history part ${lh.part}...`);
            const turns = extractHistoryTurns(baseMessages, true, config.thinkStartTag, config.thinkEndTag);
            const historyResultText = handleListHistory(turns, lh.part, lh.limit);
            combinedOutputs.push(historyResultText);
          }

          // 13. See History Turn commands
          for (const sh of allSeeHistoryCmds) {
            setSearchStatus(`Viewing chat turns ${sh.turnNumbers.join(", ")}...`);
            const turns = extractHistoryTurns(baseMessages, true, config.thinkStartTag, config.thinkEndTag);
            const historyResultText = handleSeeHistory(turns, sh.turnNumbers, sh.limit);
            combinedOutputs.push(historyResultText);
          }

          // 14. History Keywords commands
          for (const lk of allListKeywordsCmds) {
            setSearchStatus(`Searching chat history for ${lk.keywords.join(", ")}...`);
            const turns = extractHistoryTurns(baseMessages, true, config.thinkStartTag, config.thinkEndTag);
            const keywordsResultText = handleListChatKeywords(turns, lk.keywords);
            combinedOutputs.push(keywordsResultText);
          }

          // 15. run_cmd commands (execute all — real shell on the user's machine)
          for (const cmd of runCmdCmds) {
            setSearchStatus(`Running command...`);
            const runResult = await executeRunCmd(cmd.code);
            combinedOutputs.push(runResult);
            // Real-time disk sync immediately after each command!
            const prevKeys = new Set(Object.keys(currentSessionFiles));
            currentSessionFiles = await syncServerWorkspaceFiles(currentSessionFiles);
            const newlyTouched: string[] = [];
            for (const p of Object.keys(currentSessionFiles)) {
              const f = currentSessionFiles[p];
              if (!prevKeys.has(p) || (f.updatedAt && f.updatedAt >= turnStartTime)) {
                newlyTouched.push(p);
              }
            }
            updateRealtimeFiles(currentSessionFiles, newlyTouched);
          }

          // 16a. Memory: write_mem (AI's own memory only) / read_mem (both namespaces)
          for (const cmd of writeMemCmds) {
            setSearchStatus(`Saving memory "${cmd.name}"...`);
            const { updated, resultText } = applyWriteMem(currentAiMemEntries, cmd);
            currentAiMemEntries = updated;
            saveStoredAiMems(updated);
            setConfig((prev) => ({ ...prev, aiMemEntries: updated }));
            combinedOutputs.push(resultText);
          }
          for (const cmd of readMemCmds) {
            setSearchStatus(`Reading memory "${cmd.name}"...`);
            combinedOutputs.push(executeReadMem(cmd.name, config.userMemEntries || [], currentAiMemEntries));
          }

          // 16a-2. Sub-agents: list / prompt / view-image
          for (const _cmd of listAgentCmds) {
            setSearchStatus("Listing agents...");
            combinedOutputs.push(executeListAgent(config.agents || []));
          }
          for (const cmd of promptAgentCmds) {
            const agent = (config.agents || []).find((a) => a.name.toLowerCase() === cmd.agentName.toLowerCase());
            if (!agent) {
              combinedOutputs.push(`No agent named "${cmd.agentName}" found. Use list_agent() to see available agents.`);
              continue;
            }
            if (agent.tag === "image") {
              combinedOutputs.push(`"${agent.name}" is an image agent (tag: image) -- use view_image_agent("${agent.name}") instead of prompt_agent for it.`);
              continue;
            }
            setSearchStatus(`Asking agent "${agent.name}"...`);
            try {
              combinedOutputs.push(await runSubAgent(agent, cmd.prompt, currentSignal));
            } catch (e: any) {
              combinedOutputs.push(`Error running agent "${agent.name}": ${e?.message || e}`);
            }
          }
          for (const cmd of viewImageAgentCmds) {
            const agent = (config.agents || []).find((a) => a.name.toLowerCase() === cmd.arg.toLowerCase());
            if (!agent) {
              combinedOutputs.push(`No agent named "${cmd.arg}" found. Use list_agent() to see available agents.`);
              continue;
            }
            if (agent.tag !== "image") {
              combinedOutputs.push(`"${agent.name}" is not an image agent (tag: text) -- use prompt_agent for it instead.`);
              continue;
            }
            const imageDataUrl = findMostRecentImageAttachment(updatedMessages);
            if (!imageDataUrl) {
              combinedOutputs.push("No image has been attached in this conversation yet, so there is nothing to send to the image agent.");
              continue;
            }
            setSearchStatus(`Asking image agent "${agent.name}"...`);
            combinedOutputs.push(await executeViewImageAgent(agent, imageDataUrl));
          }

          // 16b. Background commands: start / list / read log / kill
          for (const cmd of runCmdBgCmds) {
            setSearchStatus("Starting background command...");
            combinedOutputs.push(await executeRunCmdBg(cmd.code));
          }
          for (const cmd of listCmdBgCmds) {
            setSearchStatus("Listing background commands...");
            combinedOutputs.push(await executeListCmdBg());
          }
          for (const cmd of readCmdBgLogCmds) {
            setSearchStatus("Reading background command log...");
            const [bgId, bgOffset, bgLimit] = cmd.args;
            combinedOutputs.push(await executeReadCmdBgLog(bgId, bgOffset, bgLimit));
          }
          for (const cmd of killCmdBgCmds) {
            setSearchStatus("Stopping background command...");
            combinedOutputs.push(await executeKillCmdBg(cmd.args[0]));
          }

          // 17. Skills list command
          if (hasListSkills) {
            setSearchStatus("Listing available skills...");
            const listSkillsResult = executeListSkills(config.skills || [], latestUserMsg || text);
            combinedOutputs.push(listSkillsResult);
          }

          // 18. Skills load command
          for (const ls of loadSkillsCmds) {
            setSearchStatus(`Loading skill(s): ${ls.skillIds.join(", ")}...`);
            const loadedResult = executeLoadSkills(config.skills || [], ls.skillIds, latestUserMsg || text);
            combinedOutputs.push(loadedResult);
          }

          // 18.1. Install pack v1 command
          if (hasInstallPack) {
            setSearchStatus("Installing and verifying essential library packages (install_pack_v1)...");
            const installResult = await executeInstallPack();
            combinedOutputs.push(installResult);
          }

          // 19. Read docs commands
          for (const rd of readDocsCmds) {
            setSearchStatus(`Reading doc ${rd.docName}...`);
            const docResult = await executeReadDoc(rd.docName);
            combinedOutputs.push(docResult);
          }

          // 20. Show Map command (zero geocode backend, interactive client-side iframe)
          for (const mCmd of allShowMapCmds) {
            const validPlaces = mCmd.places.filter((p) => p.name && p.name.trim());
            if (validPlaces.length > 0) {
              setSearchStatus(`Rendering map for ${validPlaces.map((p) => p.name).join(", ")}...`);
              const mapCardData = { title: mCmd.title, places: validPlaces };
              generatedMapCards.push(mapCardData);
              const mapRes = `Map displayed for: ${validPlaces.map((p) => p.name).join(", ")}.`;
              combinedOutputs.push(mapRes);
            }
          }

          // 21. Translation commands
          for (const tCmd of allTranslateCmds) {
            const existingCard = generatedTranslationCards.find(
              (c) =>
                c.originalText.trim().toLowerCase() === tCmd.text.trim().toLowerCase() &&
                c.toLang.toLowerCase() === tCmd.to.toLowerCase()
            );

            if (existingCard) {
              // Already translated this turn, reuse output without duplicating card
              const transRes = existingCard.error
                ? `Translation error: ${existingCard.error}`
                : `[TRANSLATION RESULT: "${existingCard.originalText}" (${existingCard.fromLang} -> ${existingCard.toLang}): "${existingCard.translatedText}"]`;
              combinedOutputs.push(transRes);
            } else {
              setSearchStatus(`Translating text: "${tCmd.text.slice(0, 25)}..."...`);
              const transCardData = await performTranslate(tCmd);
              generatedTranslationCards.push(transCardData);
              const transRes = transCardData.error
                ? `Translation error: ${transCardData.error}`
                : `[TRANSLATION RESULT: "${transCardData.originalText}" (${transCardData.fromLang} -> ${transCardData.toLang}): "${transCardData.translatedText}"]`;
              combinedOutputs.push(transRes);
            }
          }

          // 22. Weather commands
          for (const wCmd of allWeatherCmds) {
            setSearchStatus(`Fetching weather for ${wCmd.location}...`);
            const weatherCardData = await performWeatherFetch(wCmd);
            generatedWeatherCards.push(weatherCardData);
            const weatherRes = weatherCardData.error 
              ? `Weather fetch error: ${weatherCardData.error}`
              : `[WEATHER RESULT: ${weatherCardData.location} - ${weatherCardData.temperature}°C, ${weatherCardData.condition}]`;
            combinedOutputs.push(weatherRes);
          }

          // 23. Image search (SearXNG images) — UI grid, model gets one line
          for (const imCmd of allImageSearchCmds) {
            setSearchStatus(`Searching images: "${imCmd.query}"...`);
            const { images, formattedText } = await performImageSearch(imCmd.query, imCmd.count);
            generatedImageCards.push({ query: imCmd.query, images, count: images.length });
            combinedOutputs.push(formattedText || `Displayed ${images.length} images for "${imCmd.query}"`);
          }

          // 24. MCP tool calls
          for (const mCmd of allMcpCallCmds) {
            setSearchStatus(`Calling MCP ${mCmd.server}.${mCmd.tool}...`);
            try {
              const mRes = await callMcpTool(mCmd.server, mCmd.tool, mCmd.args);
              const textOut = Array.isArray((mRes as any)?.content) ? (mRes as any).content.map((b:any)=>b.text||JSON.stringify(b)).join("\n") : JSON.stringify(mRes).slice(0, 4000);
              combinedOutputs.push(`[MCP ${mCmd.server}.${mCmd.tool} result]: ${textOut}`);
            } catch (e:any){
              combinedOutputs.push(`[MCP ${mCmd.server}.${mCmd.tool} error]: ${e?.message || e}`);
            }
          }

          // 23. Fallback if unexecuted/malformed fetch exists without valid match
          if (allFetchCmds.length === 0 && hasFailedFetch) {
            setSearchStatus("[FETCH_URL_FAILED]");
            combinedOutputs.push("you entered an incorrect URL, are missing characters, or the website no longer exists");
          }

          // 24. Fallback if command was detected but produced no output
          if (combinedOutputs.length === 0 && hasUnrecognizedCmd) {
            setSearchStatus("[COMMAND_ERROR]");
            combinedOutputs.push("error: command detected but returned no output or had invalid arguments.");
          }

          // Ensure no empty outputs are sent back
          const sanitizedOutputs = combinedOutputs.map((out) => {
            if (!out || typeof out !== "string" || !out.trim()) {
              return "error";
            }
            return out;
          });

          if (sanitizedOutputs.length === 0) {
            sanitizedOutputs.push("error");
          }

          // Push single round-trip with assistant turn and combined results
          workingPayload.push({ role: "assistant", content: currentResponse });
          workingPayload.push({ role: "user", content: sanitizedOutputs.join("\n\n") });
          setSearchStatus(null);
          continue;
        } else {
          // Finished: AI generated final natural response
          finalResponse = currentResponse;
          setSearchStatus(null);
          break;
        }
      }

      if (!isAiRoleSimEnabled) {
        // Check if final response itself had any trailing file commands (outside thinking block)
        const finalThinkParsed = parseThinkContent(
          finalResponse || "",
          config.thinkStartTag || "<think>",
          config.thinkEndTag || "</think>"
        );
        const finalCommandSourceText = finalThinkParsed.mainText;

        const trailingWrites = parseWriteCommands(finalCommandSourceText);
        for (const w of trailingWrites) {
          const res = executeWrite(currentSessionFiles, w.filePath, w.content);
          currentSessionFiles = res.updatedFiles;
          touchedFilesThisTurn.add(res.savedFile.path);
        }
        const trailingEdits = parseEditCommands(finalCommandSourceText);
        for (const e of trailingEdits) {
          const res = executeEdit(currentSessionFiles, e.filePath, e.oldString, e.newString, e.replaceAll);
          currentSessionFiles = res.updatedFiles;
          if (res.savedFile) touchedFilesThisTurn.add(res.savedFile.path);
        }
        const trailingDeletes = parseDeleteCommands(finalCommandSourceText);
        for (const d of trailingDeletes) {
          const res = executeDelete(currentSessionFiles, d.filePath);
          currentSessionFiles = res.updatedFiles;
          if (res.deletedPath) {
            touchedFilesThisTurn.delete(res.deletedPath);
            if (activeArtifactPath === res.deletedPath) {
              const remainingPaths = Object.keys(currentSessionFiles);
              setActiveArtifactPath(remainingPaths.length > 0 ? remainingPaths[0] : null);
            }
          }
        }
        const trailingMoves = parseMoveCommands(finalCommandSourceText);
        for (const m of trailingMoves) {
          const res = executeMove(currentSessionFiles, m.sourcePath, m.destinationPath);
          currentSessionFiles = res.updatedFiles;
          if (res.movedFile) {
            touchedFilesThisTurn.delete(m.sourcePath);
            touchedFilesThisTurn.add(res.movedFile.path);
            if (activeArtifactPath === m.sourcePath) {
              setActiveArtifactPath(res.movedFile.path);
            }
          }
        }
        const trailingCheckouts = parseGitCheckoutCommands(finalCommandSourceText);
        for (const co of trailingCheckouts) {
          const res = executeGitCheckout(currentSessionFiles, co.filePath);
          currentSessionFiles = res.updatedFiles;
          if (res.revertedFile) {
            touchedFilesThisTurn.add(res.revertedFile.path);
          }
        }
        
        const trailingShowMaps = extractShowMapCommands(finalCommandSourceText);
        for (const mCmd of trailingShowMaps) {
          const validPlaces = mCmd.places.filter((p) => p.name && p.name.trim());
          if (validPlaces.length > 0) {
            generatedMapCards.push({ title: mCmd.title, places: validPlaces });
          }
        }
      }

      // Ensure all internal commands are stripped clean from what the user sees
      const aiMessagesSinceStart = workingPayload
        .slice(startPayloadLength)
        .filter(m => m.role === "assistant")
        .map(m => m.content as string);
      
      let fullTurnRawContent = aiMessagesSinceStart.map(msg => `[INTERMEDIATE]\n${msg}\n[/INTERMEDIATE]`).join("\n\n");

      if (finalResponse) {
        if (fullTurnRawContent) fullTurnRawContent += "\n\n";
        fullTurnRawContent += finalResponse;
      }

      let cleanedContent = fullTurnRawContent;
      if (!isAiRoleSimEnabled) {
        cleanedContent = cleanAiCommands(fullTurnRawContent);
        cleanedContent = stripAllFileCommands(cleanedContent);
        cleanedContent = stripRunCodeCommands(cleanedContent);
        cleanedContent = stripRunCmdBgCommands(cleanedContent);
        cleanedContent = stripWriteMemCommands(cleanedContent);
        cleanedContent = stripReadMemCommands(cleanedContent);
        cleanedContent = stripPromptAgentCommands(cleanedContent);
        cleanedContent = stripListAgentCommands(cleanedContent);
        cleanedContent = stripViewImageAgentCommands(cleanedContent);
        cleanedContent = stripTurtleCardCommands(cleanedContent);
        cleanedContent = stripShowMapCommands(cleanedContent);
        cleanedContent = stripImageSearchCommands(cleanedContent);
        cleanedContent = stripMcpCalls(cleanedContent);
        cleanedContent = stripStepGuideCommands(cleanedContent);
        cleanedContent = stripTabCardCommands(cleanedContent);
        cleanedContent = stripChartDisplayCommands(cleanedContent);
        cleanedContent = stripPieChartDisplayCommands(cleanedContent);
        cleanedContent = stripReadDocsCommands(cleanedContent);
      }

      if (!cleanedContent.trim() && hasUnexecutedFetch(fullTurnRawContent)) {
        cleanedContent = "you entered an incorrect URL, are missing characters, or the website no longer exists";
      }

      if (!cleanedContent.trim() && touchedFilesThisTurn.size > 0) {
        cleanedContent = `File created: ${Array.from(touchedFilesThisTurn).join(", ")}.`;
      }

      const fileArtifactsList = Array.from(touchedFilesThisTurn);
      const turnThinkParsed = parseThinkContent(
        fullTurnRawContent,
        config.thinkStartTag || "<think>",
        config.thinkEndTag || "</think>"
      );
      const mainTurnContent = turnThinkParsed.mainText;

      const fetchedSourcesList = Array.from(
        new Set(extractAllFetchCommands(mainTurnContent).map((f) => f.url))
      ).filter(Boolean);
      const stepGuidesList = extractStepGuides(
        mainTurnContent,
        config.thinkStartTag || "<think>",
        config.thinkEndTag || "</think>"
      );
      const tabCardsList = extractTabCards(
        mainTurnContent,
        config.thinkStartTag || "<think>",
        config.thinkEndTag || "</think>"
      );
      const chartsList = extractChartDisplays(
        mainTurnContent,
        config.thinkStartTag || "<think>",
        config.thinkEndTag || "</think>"
      );
      const pieChartsList = extractPieChartDisplays(
        mainTurnContent,
        config.thinkStartTag || "<think>",
        config.thinkEndTag || "</think>"
      );

      const totalTurnDurationSeconds = Math.max(1, Math.round((Date.now() - turnStartTime) / 1000));

      currentSessionFiles = await syncServerWorkspaceFiles(currentSessionFiles);

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: fullTurnRawContent,
        timestamp: Date.now(),
        fileArtifacts: fileArtifactsList.length > 0 ? fileArtifactsList : undefined,
        sources: fetchedSourcesList.length > 0 ? fetchedSourcesList : undefined,
        durationSeconds: totalTurnDurationSeconds,
        thoughtSteps: collectedThoughtSteps.length > 0 ? collectedThoughtSteps : undefined,
        mapCards: generatedMapCards.length > 0 ? generatedMapCards : undefined,
        stepGuides: stepGuidesList.length > 0 ? stepGuidesList : undefined,
        tabCards: tabCardsList.length > 0 ? tabCardsList : undefined,
        charts: chartsList.length > 0 ? chartsList : undefined,
        pieCharts: pieChartsList.length > 0 ? pieChartsList : undefined,
        translations: deduplicateTranslationCards(generatedTranslationCards).length > 0
          ? deduplicateTranslationCards(generatedTranslationCards)
          : undefined,
        weatherCards: generatedWeatherCards.length > 0 ? generatedWeatherCards : undefined,
        imageSearchCards: generatedImageCards.length > 0 ? generatedImageCards : undefined,
      };

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== currentSessionId) return s;
          const finalMessages = s.messages.filter(m => m.id !== turnPlaceholderId);
          return {
            ...s,
            updatedAt: Date.now(),
            messages: [...finalMessages, aiMsg].slice(-100),
            files: currentSessionFiles,
          };
        })
      );

      // Automatically open the artifact panel or file list
      if (fileArtifactsList.length === 1) {
        setActiveArtifactPath(fileArtifactsList[0]);
        setIsArtifactExpanded(false);
        setShowFileList(false);
      } else if (fileArtifactsList.length > 1) {
        setShowFileList(true);
        setActiveArtifactPath(null);
        setIsArtifactExpanded(false);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.log("Request aborted by user");
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== currentSessionId) return s;
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.status === "sending" ? { ...m, status: "sent" } : m
              ),
            };
          })
        );
      } else {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "[API_CONNECTION_ERROR] Failed to send message to API.",
          timestamp: Date.now(),
          status: "error",
          errorDetails: error?.message || "REST API Connection Error. Please verify your REST API URL and API Key in Settings.",
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? {
                  ...s,
                  updatedAt: Date.now(),
                  messages: [...s.messages, errorMsg].slice(-100),
                }
              : s
          )
        );
      }
    } finally {
      setIsLoading(false);
      setSearchStatus(null);
    }
  };

  const handleRetryLastMessage = () => {
    if (messages.length === 0) return;

    // Find last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      // Remove any error messages at the end
      const filtered = messages.filter((m) => m.status !== "error");
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages: filtered }
            : s
        )
      );
      handleSendMessage(lastUserMsg.content, lastUserMsg.attachment);
    }
  };

  // Edit a user message: drop it and everything after it from THIS chat, then
  // regenerate using only the messages before it + the edited content. The model
  // never sees the old content or anything that came after the edit point.
  const handleEditUserMessage = (messageId: string, newText: string) => {
    if (isLoading) return;
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1 || messages[idx].role !== "user") return;
    const trimmed = newText.trim();
    if (!trimmed) return;

    const priorMessages = messages.slice(0, idx);
    handleSendMessage(trimmed, messages[idx].attachment, false, undefined, priorMessages);
  };

  // Branch: fork the chat at a given message into a brand new, independent chat
  // session. The new session gets everything up to and including that message;
  // the original session is left completely untouched.
  const handleBranchSession = (messageId: string) => {
    if (sessions.length >= 16 || !currentSession) return;
    const idx = currentSession.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const sourceMsg = currentSession.messages[idx];
    if (sourceMsg.status === "sending") return; // don't branch an in-flight response

    const branchedMessages = currentSession.messages.slice(0, idx + 1).map((m) => ({ ...m }));
    const newId = (Date.now() + 1).toString();
    const newSession: ChatSession = {
      id: newId,
      title: `${currentSession.title || "Chat"} (branch)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: branchedMessages,
      files: currentSession.files ? { ...currentSession.files } : undefined,
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setActiveArtifactPath(null);
    setIsSidebarOpen(false);
  };

  const handleRenameSession = (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, title: trimmed.slice(0, 60) } : s
      )
    );
  };

  // Session Management
  const handleNewSession = () => {
    if (sessions.length >= 16) return;
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: `Chat ${sessions.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setActiveArtifactPath(null);
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = (id: string) => {
    setActiveArtifactPath(null);
    if (sessions.length <= 1) {
      // If only 1 session left, reset it
      const resetSession: ChatSession = {
        id: Date.now().toString(),
        title: "New Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };
      setSessions([resetSession]);
      setCurrentSessionId(resetSession.id);
      return;
    }

    const filtered = sessions.filter((s) => s.id !== id);
    setSessions(filtered);
    if (currentSessionId === id) {
      setCurrentSessionId(filtered[0].id);
    }
  };

  const requestDeleteSession = (id: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: "DELETE CHAT?",
      message: "Are you sure you want to delete this chat session?",
      confirmLabel: "[DELETE]",
      onConfirm: () => {
        handleDeleteSession(id);
        setConfirmModalConfig(null);
      },
    });
  };

  const handleClearAll = () => {
    setActiveArtifactPath(null);
    const resetSession: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    setSessions([resetSession]);
    setCurrentSessionId(resetSession.id);
  };

  const requestClearAll = () => {
    setConfirmModalConfig({
      isOpen: true,
      title: "CLEAR ALL?",
      message: "Are you sure you want to clear all chat sessions and history?",
      confirmLabel: "[CLEAR_ALL]",
      onConfirm: () => {
        handleClearAll();
        setConfirmModalConfig(null);
      },
    });
  };

  const handleToggleArtifacts = () => {
    if (showFileList || activeArtifactPath) {
      setShowFileList(false);
      setActiveArtifactPath(null);
    } else {
      setShowFileList(true);
      setIsArtifactExpanded(false);
    }
  };

  const handleExportChat = () => {
    if (messages.length === 0) return;
    const content = messages
      .map(
        (m) =>
          `[${m.role.toUpperCase()}] (${new Date(m.timestamp).toLocaleString()}):\n${
            m.content
          }\n\n----------------------------------------\n`
      )
      .join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_export_${currentSessionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`h-screen h-[100dvh] flex flex-col overflow-hidden bg-white text-black dark:bg-black dark:text-white font-mono transition-colors ${config.useSerifLora ? "use-serif-lora" : ""}`}>
      {/* Top Header */}
      <Header
        config={config}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSetupGuide={() => setIsSetupGuideOpen(true)}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        isSidebarOpen={isSidebarOpen}
        filesCount={filesCount}
        onToggleArtifactPanel={handleToggleArtifacts}
        workspaceName={hostInfo?.name}
        workspacePath={hostInfo?.workspace}
        onOpenWorkspace={() => setIsWorkspacePickerOpen(true)}
      />

      <WorkspacePicker
        isOpen={isWorkspacePickerOpen}
        onClose={() => setIsWorkspacePickerOpen(false)}
        onChanged={() => {
          loadHostInfo();
          refreshWorkspaceFiles();
        }}
      />

      {/* Performance Monitor HUD Overlay */}
      {isPerfMonitorEnabled && (
        <PerfMonitorHUD
          metrics={computeSessionMetrics(currentSession, activeSystemPrompt)}
          onClose={togglePerfMonitor}
          onOpenDevMode={() => setIsSettingsOpen(true)}
          systemPromptType={isAiRoleSimEnabled ? "ROLE_SIM (USER_PROMPT)" : (config.effort || "FAST").toUpperCase()}
        />
      )}

      {/* Main Container */}
      <div className={`flex-1 w-full flex overflow-hidden ${(activeArtifact || showFileList) ? "flex-col md:flex-row max-w-none" : "flex-col w-full max-w-6xl mx-auto px-2 sm:px-4 md:px-6 py-2 justify-between"}`}>
        {/* Chat Column */}
        <div className={`flex flex-col h-full overflow-hidden ${(activeArtifact || showFileList) ? (isArtifactExpanded && !showFileList ? "hidden" : "hidden md:flex md:w-1/2 p-2 sm:p-4 md:p-6") : "w-full flex-1"}`}>
          {/* Welcome Greeting when chat is empty */}
          {messages.length === 0 && (
            <div className="my-auto py-16 px-4 text-center">
              <h1 className="font-lora text-3xl sm:text-5xl md:text-6xl font-normal tracking-tight opacity-90 select-none">
                {randomGreeting}
              </h1>
            </div>
          )}

          {/* Message List */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
            {messages.map((msg, idx) => {
              const hasFollowupUserMessage = messages.slice(idx + 1).some((m) => m.role === "user");
              const isStreaming = Boolean(isLoading && idx === messages.length - 1 && msg.role === "assistant");
              return (
                <ChatMessageComponent
                  key={msg.id}
                  message={msg}
                  onRetry={handleRetryLastMessage}
                  onOpenSetupGuide={() => setIsSetupGuideOpen(true)}
                  customModelName={config.model}
                  onSelectAnswers={(answersText) => handleSendMessage(answersText)}
                  isAnswered={hasFollowupUserMessage || isLoading}
                  sessionFiles={currentSession?.files}
                  onOpenArtifact={(file) => {
                    setActiveArtifactPath(file.path);
                    setShowFileList(false);
                    setIsArtifactExpanded(false);
                  }}
                  thinkStartTag={config.thinkStartTag}
                  thinkEndTag={config.thinkEndTag}
                  stripOpenTags={config.stripOpenTags}
                  stripCloseTags={config.stripCloseTags}
                  isStreaming={isStreaming}
                  isRawView={isRawViewEnabled}
                  isLoading={isLoading}
                  isAiRoleSimEnabled={isAiRoleSimEnabled}
                  onEditMessage={
                    msg.role === "user"
                      ? (newText) => handleEditUserMessage(msg.id, newText)
                      : undefined
                  }
                  onBranchMessage={() => handleBranchSession(msg.id)}
                />
              );
            })}

            {/* Loading / Searching Indicator (Only shown before assistant message starts streaming) */}
            {isLoading && searchStatus && (
              <div className="p-3 font-mono text-xs text-black dark:text-white flex items-center space-x-2">
                <RandomFontText text={searchStatus} />
              </div>
            )}
            {isLoading && !searchStatus && (messages.length === 0 || messages[messages.length - 1]?.role !== "assistant") && (
              <div className="p-3 flex items-center">
                <img
                  src="/shrink_rotate.gif"
                  alt=""
                  className="w-14 h-14 object-contain select-none dark:hidden"
                />
                <img
                  src="/msh_spin_inverted.gif"
                  alt=""
                  className="w-14 h-14 object-contain select-none hidden dark:block"
                />
              </div>
            )}

            {/* Live Cards Showcase in Chat Area when see_all_card is enabled */}
            {isSeeAllCardEnabled && (
              <div className="p-3 border-2 border-black dark:border-white bg-white dark:bg-black my-3 space-y-2 font-mono">
                <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-2">
                  <span className="font-bold text-xs uppercase tracking-wider">[SEE_ALL_CARDS]: ALL NATIVE UI CARDS</span>
                  <button
                    onClick={toggleSeeAllCard}
                    className="text-xs px-2 py-0.5 border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase transition-colors"
                  >
                    [HIDE CARDS]
                  </button>
                </div>
                <CardsShowcase
                  onOpenArtifact={(file) => {
                    setActiveArtifactPath(file.path);
                    setShowFileList(false);
                  }}
                />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input inside left column when artifact split-screen is active */}
          {(activeArtifact || showFileList) && (
            <div className="pt-2 flex-shrink-0">
              <ChatInput
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                onStop={handleStop}
                showScrollButton={showScrollButton}
                onScrollToBottom={handleScrollToBottom}
                text={chatInputText}
                onTextChange={setChatInputText}
                attachment={chatInputAttachment}
                onAttachmentChange={setChatInputAttachment}
                errorMessage={chatInputError}
                onErrorMessageChange={setChatInputError}
              />
            </div>
          )}
        </div>

        {/* Right Artifact Panel */}
        {(activeArtifact || showFileList) && (
          <div className="flex-1 h-full overflow-hidden">
            {activeArtifact && !showFileList ? (
              <ArtifactPanel
                file={activeArtifact}
                isExpanded={isArtifactExpanded}
                onToggleExpand={() => setIsArtifactExpanded(!isArtifactExpanded)}
                onClose={() => setActiveArtifactPath(null)}
              />
            ) : (
              <FileListPanel
                files={currentSession?.files || {}}
                onSelect={(path) => {
                  setActiveArtifactPath(path);
                  setShowFileList(false);
                }}
                onClose={() => setShowFileList(false)}
                onRefreshFiles={refreshWorkspaceFiles}
              />
            )}
          </div>
        )}
      </div>

      {/* Chat Input at bottom when no artifact is open */}
      {(!activeArtifact && !showFileList) && (
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          onStop={handleStop}
          showScrollButton={showScrollButton}
          onScrollToBottom={handleScrollToBottom}
          text={chatInputText}
          onTextChange={setChatInputText}
          attachment={chatInputAttachment}
          onAttachmentChange={setChatInputAttachment}
          errorMessage={chatInputError}
          onErrorMessageChange={setChatInputError}
        />
      )}

      {/* Settings Modal (Includes DEV_MODE tab) */}
      <ApiSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSave={handleSaveConfig}
        isPerfMonitorEnabled={isPerfMonitorEnabled}
        onTogglePerfMonitor={togglePerfMonitor}
        isRawViewEnabled={isRawViewEnabled}
        onToggleRawView={toggleRawView}
        isAiRoleSimEnabled={isAiRoleSimEnabled}
        onToggleAiRoleSim={toggleAiRoleSim}
        isSeeAllCardEnabled={isSeeAllCardEnabled}
        onToggleSeeAllCard={toggleSeeAllCard}
        lastRawRequest={lastRawRequest}
        lastRawResponse={lastRawResponse}
        session={currentSession}
        activeSystemPrompt={activeSystemPrompt}
        onOpenArtifact={(file) => {
          setIsSettingsOpen(false);
          setActiveArtifactPath(file.path);
          setShowFileList(false);
        }}
        onSendAsUser={(text) => {
          setIsSettingsOpen(false);
          handleSendMessage(text);
        }}
      />

      {/* Setup Guide Modal */}
      <SetupGuideModal
        isOpen={isSetupGuideOpen}
        onClose={() => setIsSetupGuideOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Custom Confirm Modal */}
      <PermissionPrompt />
      <ConfirmModal
        isOpen={!!confirmModalConfig?.isOpen}
        title={confirmModalConfig?.title || "CONFIRM ACTION"}
        message={confirmModalConfig?.message || ""}
        confirmLabel={confirmModalConfig?.confirmLabel || "[CONFIRM]"}
        onConfirm={() => confirmModalConfig?.onConfirm()}
        onCancel={() => setConfirmModalConfig(null)}
      />

      {/* Sidebar Drawer */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => {
          setCurrentSessionId(id);
          setIsSidebarOpen(false);
        }}
        onNewSession={handleNewSession}
        onDeleteSession={requestDeleteSession}
        onRenameSession={handleRenameSession}
        onClearAll={requestClearAll}
        onExportChat={handleExportChat}
        config={config}
        onOpenSettings={() => {
          setIsSidebarOpen(false);
          setIsSettingsOpen(true);
        }}
        onOpenVoiceChat={() => {
          setIsSidebarOpen(false);
          setIsVoiceChatOpen(true);
        }}
      />

      {/* Voice Chat Modal Overlay */}
      <VoiceChatModal
        isOpen={isVoiceChatOpen}
        onClose={() => setIsVoiceChatOpen(false)}
        onSendMessage={(text, activeLang) => handleSendMessage(text, undefined, true, activeLang)}
        messages={messages}
        isLoading={isLoading}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
