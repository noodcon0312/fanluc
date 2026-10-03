export type EffortLevel = "fast" | "cautious" | "thorough" | "meticulous" | "omni";

export interface Skill {
  id: string;
  title: string;
  describe: string;
  content: string;
  tags?: string[];
  enabled?: boolean;
  isDefault?: boolean;
  isLocked?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface MemEntry {
  id: string;
  name: string;
  keywords: string[];
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  apiUrl: string;
  apiKey: string;
  model?: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  reasoningEffort?: ReasoningEffort;
  effort: EffortLevel;
  tag: "text" | "image";
  createdAt: number;
  updatedAt: number;
}

export interface ApiConfig {
  apiUrl: string;
  apiKey: string;
  model?: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  reasoningEffort?: ReasoningEffort;
  useProxy?: boolean;
  useSerifLora?: boolean;
  effort?: EffortLevel;
  thinkStartTag?: string;
  thinkEndTag?: string;
  stripOpenTags?: string;
  stripCloseTags?: string;
  skills?: Skill[];
  memEnabled?: boolean;
  userMemEntries?: MemEntry[];
  aiMemEntries?: MemEntry[];
  agentEnabled?: boolean;
  agents?: AgentConfig[];
}

export interface AttachedFile {
  name: string;
  type: "image" | "text" | "binary";
  mimeType: string;
  size: number;
  dataUrl?: string; // Base64 data URL for images
  textContent?: string; // Text content for txt/json/etc files
}

export interface VirtualFile {
  path: string;
  name: string;
  content: string;
  originalContent?: string;
  previousContent?: string;
  language: string;
  size: number;
  updatedAt: number;
  /** "base64" for binary uploads (content is base64 text) */
  encoding?: "base64";
}

export interface ThoughtStep {
  step: number;
  durationSeconds: number;
  text: string;
}

export interface MapPlace {
  name: string;
}

export interface MapCardData {
  title?: string;
  places: MapPlace[];
}

export interface StepGuideData {
  steps: string[];
}

export type TabCardMode = "none" | "copy" | "need_complete";

export interface TabCheckboxItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface TabItem {
  title: string;
  content: string;
  checkboxes?: TabCheckboxItem[];
}

export interface TabCardData {
  tabs: TabItem[];
  mode: TabCardMode;
}

export interface ChartSeries {
  name?: string;
  color?: string;
  values?: (number | null | undefined)[];
  points?: { x: number | string; y: number }[];
}

export interface ChartAxis {
  data?: (string | number)[];
  format?: string;
  min?: number;
  max?: number;
  scale?: "linear" | "log";
  title?: string;
}

export interface ChartDisplayData {
  style: "line" | "bar" | "scatter";
  series: ChartSeries[];
  title?: string;
  x_axis?: ChartAxis;
  y_axis?: ChartAxis;
}

export interface PieChartSlice {
  label: string;
  value: number;
  color?: string;
}

export interface PieChartDisplayData {
  title?: string;
  style?: "pie" | "donut";
  slices: PieChartSlice[];
  unit?: string;
  show_legend?: boolean;
  show_percentages?: boolean;
}

export interface TranslationCardData {
  id?: string;
  originalText: string;
  translatedText: string;
  fromLang?: string;
  toLang: string;
  title?: string;
  error?: string;
}

export interface WeatherCardData {
  id?: string;
  location: string;
  temperature: number;
  condition: string;
  isDay?: boolean;
  time?: string;
  date?: string;
  error?: string;
}


export interface ImageSearchResult {
  title: string;
  src: string;
  thumb: string;
  page: string;
}

export interface ImageSearchCardData {
  query: string;
  images: ImageSearchResult[];
  count?: number;
}

export interface McpServerStatus {
  name: string;
  type: string;
  status: "connected" | "failed" | "disabled" | "connecting";
  toolCount: number;
  tools: any[];
  error?: string | null;
}

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  attachment?: AttachedFile;
  timestamp: number;
  status?: "sending" | "sent" | "error";
  errorDetails?: string;
  fileArtifacts?: string[]; // list of file paths in session.files
  sources?: string[]; // list of fetched URLs
  durationSeconds?: number;
  thoughtSteps?: ThoughtStep[];
  mapCards?: MapCardData[]; // list of resolved map cards
  stepGuides?: StepGuideData[]; // list of step-by-step interactive guides
  tabCards?: TabCardData[]; // list of interactive tab display cards
  charts?: ChartDisplayData[]; // list of native inline charts
  pieCharts?: PieChartDisplayData[]; // list of native inline pie/donut charts
  translations?: TranslationCardData[]; // list of translation cards
  weatherCards?: WeatherCardData[]; // list of weather cards
  imageSearchCards?: ImageSearchCardData[]; // list of image search grids
  mcpStatus?: McpServerStatus[]; // for /mcps display
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  files?: Record<string, VirtualFile>;
}

export interface TestResult {
  success: boolean;
  status?: number;
  responseText?: string;
  aiReply?: string;
  error?: string;
  latencyMs?: number;
}
