import React, { useState, useEffect } from "react";
import { ApiConfig, EffortLevel, Skill, ChatSession, VirtualFile, MemEntry, AgentConfig } from "../types";
import { newMemEntry, saveStoredUserMems, saveStoredAiMems } from "../utils/memHelper";
import { importMemoriesFromText, OTHER_AI_EXPORT_PROMPT, candidatesToMemEntries, MemCandidate } from "../utils/memImportHelper";
import { newAgentConfig, testAgent, agentWorkspaceFolder } from "../utils/agentHelper";
import { RandomFontText, RandomFontInput, RandomFontTextarea } from "../utils/randomFont";
import { SYSTEM_PROMPT_PRESETS } from "../constants/systemPrompts";
import { API_PROVIDER_PRESETS } from "../constants/apiProviders";
import { isOllamaUrl } from "../utils/api";
import { EFFORT_OPTIONS } from "../prompts";
import { extractTopTags } from "../utils/skillHelper";
import { McpPanel } from "./McpPanel";
import { PermissionPanel } from "./PermissionPanel";
import { Code, Check, Copy } from "lucide-react";
import { hidden_tab } from "../config/hiddenTab";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConfig;
  onSave: (newConfig: ApiConfig) => void;
  // Dev mode props
  isPerfMonitorEnabled?: boolean;
  onTogglePerfMonitor?: () => void;
  isRawViewEnabled?: boolean;
  onToggleRawView?: () => void;
  isAiRoleSimEnabled?: boolean;
  onToggleAiRoleSim?: () => void;
  isSeeAllCardEnabled?: boolean;
  onToggleSeeAllCard?: () => void;
  lastRawRequest?: any;
  lastRawResponse?: string;
  session?: ChatSession;
  activeSystemPrompt?: string;
  onOpenArtifact?: (file: VirtualFile) => void;
  onSendAsUser?: (text: string) => void;
}

type TabType = "general" | "chat_template" | "effort" | "skills" | "mem" | "agent" | "mcp" | "permission" | "docs" | "dev_mode";

export const ApiSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  config,
  onSave,
  isPerfMonitorEnabled = false,
  onTogglePerfMonitor,
  isRawViewEnabled = false,
  onToggleRawView,
  isAiRoleSimEnabled = false,
  onToggleAiRoleSim,
  isSeeAllCardEnabled = false,
  onToggleSeeAllCard,
  lastRawRequest,
  lastRawResponse,
  session,
  activeSystemPrompt = "",
  onOpenArtifact,
  onSendAsUser,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("general");
  const effectiveTab: TabType = (!hidden_tab.dev_mode && activeTab === "dev_mode") ? "general" : activeTab;
  const [copiedReq, setCopiedReq] = useState(false);
  const [copiedRes, setCopiedRes] = useState(false);
  const [formData, setFormData] = useState<ApiConfig>(() => ({
    ...config,
    topP: config.topP !== undefined ? config.topP : 0.95,
    topK: config.topK !== undefined ? config.topK : 20,
    repeatPenalty: config.repeatPenalty !== undefined ? config.repeatPenalty : 1.05,
    reasoningEffort: config.reasoningEffort || "medium",
    effort: config.effort || "fast",
    thinkStartTag: config.thinkStartTag !== undefined ? config.thinkStartTag : "<think>",
    thinkEndTag: config.thinkEndTag !== undefined ? config.thinkEndTag : "</think>",
    stripOpenTags: config.stripOpenTags !== undefined ? config.stripOpenTags : "",
    stripCloseTags: config.stripCloseTags !== undefined ? config.stripCloseTags : "",
    skills: Array.isArray(config.skills) ? config.skills : [],
    memEnabled: config.memEnabled ?? false,
    userMemEntries: Array.isArray(config.userMemEntries) ? config.userMemEntries : [],
    aiMemEntries: Array.isArray(config.aiMemEntries) ? config.aiMemEntries : [],
    agentEnabled: config.agentEnabled ?? false,
    agents: Array.isArray(config.agents) ? config.agents : [],
  }));
  const [maxTokensInput, setMaxTokensInput] = useState<string>(String(config.maxTokens || ""));

  // Skills state inside modal
  const [skillSearch, setSkillSearch] = useState("");
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [skillTitle, setSkillTitle] = useState("");
  const [skillDescribe, setSkillDescribe] = useState("");
  const [skillContent, setSkillContent] = useState("");
  const [expandedSkillIds, setExpandedSkillIds] = useState<Set<string>>(new Set());

  // Mem state inside modal
  const [memSearch, setMemSearch] = useState("");
  const [editingMemId, setEditingMemId] = useState<string | null>(null);
  const [editingMemNamespace, setEditingMemNamespace] = useState<"user" | "ai">("user");
  const [isCreatingMem, setIsCreatingMem] = useState(false);
  const [memName, setMemName] = useState("");
  const [memKeywords, setMemKeywords] = useState("");
  const [memContent, setMemContent] = useState("");
  const [expandedMemIds, setExpandedMemIds] = useState<Set<string>>(new Set());
  const [importingMem, setImportingMem] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importCandidates, setImportCandidates] = useState<MemCandidate[] | null>(null);
  const [importText, setImportText] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importCopied, setImportCopied] = useState(false);
  const [selectedImportIdx, setSelectedImportIdx] = useState<Set<number>>(new Set());

  // Agent state inside modal
  const [agentSearch, setAgentSearch] = useState("");
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [agentForm, setAgentForm] = useState<AgentConfig>(() => newAgentConfig());
  const [expandedAgentIds, setExpandedAgentIds] = useState<Set<string>>(new Set());
  const [agentTesting, setAgentTesting] = useState(false);
  const [agentTestResult, setAgentTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [agentBusyId, setAgentBusyId] = useState<string | null>(null);
  const [agentActionMsg, setAgentActionMsg] = useState<string | null>(null);

  // Sync formData with config updates
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      ...config,
      userMemEntries: Array.isArray(config.userMemEntries) ? config.userMemEntries : prev.userMemEntries || [],
      aiMemEntries: Array.isArray(config.aiMemEntries) ? config.aiMemEntries : prev.aiMemEntries || [],
    }));
    setMaxTokensInput(String(config.maxTokens || ""));
  }, [config, isOpen]);

  // Safe skills list
  const safeSkills: Skill[] = Array.isArray(formData.skills) ? formData.skills : [];
  const visibleSkills: Skill[] = safeSkills.filter((s) => !s.isLocked);

  if (!isOpen) return null;

  const handleChange = (
    field: keyof ApiConfig,
    value: string | number | boolean | Skill[] | MemEntry[] | AgentConfig[]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalMaxTokens = parseInt(maxTokensInput) || 2000;
    onSave({
      ...formData,
      skills: safeSkills,
      maxTokens: finalMaxTokens,
    });
    onClose();
  };

  const handleResetChatTemplate = () => {
    setFormData((prev) => ({
      ...prev,
      thinkStartTag: "<think>",
      thinkEndTag: "</think>",
      stripOpenTags: "",
      stripCloseTags: "",
    }));
  };

  // Skill management handlers
  const handleStartCreateSkill = () => {
    setIsCreatingSkill(true);
    setEditingSkillId(null);
    setSkillTitle("");
    setSkillDescribe("");
    setSkillContent("");
  };

  const handleStartEditSkill = (skill: Skill) => {
    if (skill.isLocked) return;
    setIsCreatingSkill(false);
    setEditingSkillId(skill.id);
    setSkillTitle(skill.title);
    setSkillDescribe(skill.describe);
    setSkillContent(skill.content);
  };

  const handleCancelSkillEdit = () => {
    setIsCreatingSkill(false);
    setEditingSkillId(null);
    setSkillTitle("");
    setSkillDescribe("");
    setSkillContent("");
  };

  const handleSaveSkill = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!skillTitle.trim() || !skillContent.trim()) return;

    const currentSkills = safeSkills;
    if (editingSkillId) {
      // Update existing
      const updated = currentSkills.map((s) => {
        if (s.id === editingSkillId && !s.isLocked) {
          return {
            ...s,
            title: skillTitle.trim(),
            describe: skillDescribe.trim(),
            content: skillContent,
            updatedAt: Date.now(),
          };
        }
        return s;
      });
      handleChange("skills", updated);
    } else {
      // Create new
      const newSkill: Skill = {
        id: "skill_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        title: skillTitle.trim(),
        describe: skillDescribe.trim(),
        content: skillContent,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      handleChange("skills", [...currentSkills, newSkill]);
    }

    handleCancelSkillEdit();
  };

  const handleToggleSkill = (id: string) => {
    const currentSkills = safeSkills;
    const updated = currentSkills.map((s) => {
      if (s.id === id) {
        if (s.isLocked) return s; // Locked skills cannot be toggled
        const isCurrentlyEnabled = s.enabled !== false;
        return {
          ...s,
          enabled: !isCurrentlyEnabled,
          updatedAt: Date.now(),
        };
      }
      return s;
    });
    handleChange("skills", updated);
  };

  const handleDeleteSkill = (id: string) => {
    const currentSkills = safeSkills;
    handleChange("skills", currentSkills.filter((s) => s.id !== id || s.isLocked));
    if (editingSkillId === id) {
      handleCancelSkillEdit();
    }
  };

  const toggleSkillExpand = (id: string) => {
    setExpandedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredSkills = visibleSkills.filter((s) => {
    if (!s) return false;
    if (!skillSearch.trim()) return true;
    const q = skillSearch.toLowerCase();
    return (
      (s.title || "").toLowerCase().includes(q) ||
      (s.describe || "").toLowerCase().includes(q) ||
      (s.content || "").toLowerCase().includes(q)
    );
  });

  // -------------------------------------------------------------- mem -----
  const safeUserMem: MemEntry[] = Array.isArray(formData.userMemEntries) ? formData.userMemEntries : [];
  const safeAiMem: MemEntry[] = Array.isArray(formData.aiMemEntries) ? formData.aiMemEntries : [];

  const filteredUserMem = safeUserMem.filter((m) => {
    if (!m) return false;
    if (!memSearch.trim()) return true;
    const q = memSearch.toLowerCase();
    return (
      (m.name || "").toLowerCase().includes(q) ||
      (m.keywords || []).join(" ").toLowerCase().includes(q) ||
      (m.content || "").toLowerCase().includes(q)
    );
  });

  const filteredAiMem = safeAiMem.filter((m) => {
    if (!m) return false;
    if (!memSearch.trim()) return true;
    const q = memSearch.toLowerCase();
    return (
      (m.name || "").toLowerCase().includes(q) ||
      (m.keywords || []).join(" ").toLowerCase().includes(q) ||
      (m.content || "").toLowerCase().includes(q)
    );
  });

  const toggleMemExpand = (id: string) => {
    setExpandedMemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStartCreateMem = () => {
    setIsCreatingMem(true);
    setEditingMemId(null);
    setEditingMemNamespace("user");
    setMemName("");
    setMemKeywords("");
    setMemContent("");
  };
  const handleStartEditMem = (entry: MemEntry, namespace: "user" | "ai" = "user") => {
    setIsCreatingMem(false);
    setEditingMemId(entry.id);
    setEditingMemNamespace(namespace);
    setMemName(entry.name);
    setMemKeywords(entry.keywords ? entry.keywords.join(", ") : "");
    setMemContent(entry.content);
  };
  const handleCancelMemEdit = () => {
    setIsCreatingMem(false);
    setEditingMemId(null);
    setMemName("");
    setMemKeywords("");
    setMemContent("");
  };
  const handleSaveMem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memName.trim() || !memContent.trim()) return;
    const keywords = memKeywords.split(",").map((k) => k.trim()).filter(Boolean);
    
    if (editingMemId) {
      if (editingMemNamespace === "ai") {
        const updatedAiMem = safeAiMem.map((m) =>
          m.id === editingMemId
            ? { ...m, name: memName.trim(), keywords, content: memContent.trim(), updatedAt: Date.now() }
            : m
        );
        const updatedForm = { ...formData, aiMemEntries: updatedAiMem };
        setFormData(updatedForm);
        saveStoredAiMems(updatedAiMem);
        onSave(updatedForm);
      } else {
        const updatedUserMem = safeUserMem.map((m) =>
          m.id === editingMemId
            ? { ...m, name: memName.trim(), keywords, content: memContent.trim(), updatedAt: Date.now() }
            : m
        );
        const updatedForm = { ...formData, userMemEntries: updatedUserMem };
        setFormData(updatedForm);
        saveStoredUserMems(updatedUserMem);
        onSave(updatedForm);
      }
    } else {
      const updatedUserMem = [...safeUserMem, newMemEntry(memName, keywords, memContent)];
      const updatedForm = { ...formData, userMemEntries: updatedUserMem };
      setFormData(updatedForm);
      saveStoredUserMems(updatedUserMem);
      onSave(updatedForm);
    }
    handleCancelMemEdit();
  };
  const handleDeleteUserMem = (id: string) => {
    const updated = safeUserMem.filter((m) => m.id !== id);
    const updatedForm = { ...formData, userMemEntries: updated };
    setFormData(updatedForm);
    saveStoredUserMems(updated);
    onSave(updatedForm);
    if (editingMemId === id) handleCancelMemEdit();
  };
  const handleDeleteAiMem = (id: string) => {
    const updated = safeAiMem.filter((m) => m.id !== id);
    const updatedForm = { ...formData, aiMemEntries: updated };
    setFormData(updatedForm);
    saveStoredAiMems(updated);
    onSave(updatedForm);
    if (editingMemId === id) handleCancelMemEdit();
  };

  const handleGenerateMemories = async () => {
    setImportError(null);
    setImportCandidates(null);
    if (!importText.trim()) {
      setImportError("Paste the answer from the other AI first.");
      return;
    }
    setImportingMem(true);
    try {
      const candidates = await importMemoriesFromText(importText, formData);
      if (candidates.length === 0) {
        setImportError("Nothing in the pasted text looked durable/worth remembering.");
      } else {
        setImportCandidates(candidates);
        setSelectedImportIdx(new Set(candidates.map((_, i) => i)));
      }
    } catch (e: any) {
      setImportError(e?.message || String(e));
    } finally {
      setImportingMem(false);
    }
  };
  const handleConfirmImportMemories = () => {
    if (!importCandidates) return;
    const chosen = importCandidates.filter((_, i) => selectedImportIdx.has(i));
    const updated = [...safeUserMem, ...candidatesToMemEntries(chosen)];
    const updatedForm = { ...formData, userMemEntries: updated };
    setFormData(updatedForm);
    saveStoredUserMems(updated);
    onSave(updatedForm);
    setImportCandidates(null);
  };

  // ------------------------------------------------------------ agent -----
  const safeAgents: AgentConfig[] = Array.isArray(formData.agents) ? formData.agents : [];

  const filteredAgents = safeAgents.filter((a) => {
    if (!a) return false;
    if (!agentSearch.trim()) return true;
    const q = agentSearch.toLowerCase();
    return (
      (a.name || "").toLowerCase().includes(q) ||
      (a.description || "").toLowerCase().includes(q) ||
      (a.model || "").toLowerCase().includes(q) ||
      (a.apiUrl || "").toLowerCase().includes(q)
    );
  });

  const toggleAgentExpand = (id: string) => {
    setExpandedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStartCreateAgent = () => {
    setIsCreatingAgent(true);
    setEditingAgentId(null);
    setAgentForm(newAgentConfig());
    setAgentTestResult(null);
  };
  const handleStartEditAgent = (agent: AgentConfig) => {
    setIsCreatingAgent(false);
    setEditingAgentId(agent.id);
    setAgentForm({ ...agent });
    setAgentTestResult(null);
  };
  const handleCancelAgentEdit = () => {
    setIsCreatingAgent(false);
    setEditingAgentId(null);
    setAgentTestResult(null);
  };
  const handleSaveAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentForm.name.trim() || !agentForm.apiUrl.trim()) return;
    const toSave: AgentConfig = { ...agentForm, name: agentForm.name.trim(), updatedAt: Date.now() };
    let updatedAgents: AgentConfig[];
    if (editingAgentId) {
      updatedAgents = safeAgents.map((a) => (a.id === editingAgentId ? toSave : a));
    } else {
      updatedAgents = [...safeAgents, toSave];
    }
    const updatedForm = { ...formData, agents: updatedAgents };
    setFormData(updatedForm);
    onSave(updatedForm);
    handleCancelAgentEdit();
  };
  const handleDeleteAgent = (id: string) => {
    const updatedAgents = safeAgents.filter((a) => a.id !== id);
    const updatedForm = { ...formData, agents: updatedAgents };
    setFormData(updatedForm);
    onSave(updatedForm);
    if (editingAgentId === id) handleCancelAgentEdit();
  };
  const handleTestAgent = async () => {
    setAgentTesting(true);
    setAgentTestResult(null);
    const result = await testAgent(agentForm);
    setAgentTestResult(result);
    setAgentTesting(false);
  };
  const handleExportAgentWorkspace = async (agent: AgentConfig) => {
    setAgentActionMsg(null);
    setAgentBusyId(agent.id);
    try {
      const res = await fetch("/api/agent-workspace-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: agentWorkspaceFolder(agent) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAgentActionMsg(body.error || `Export failed (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agent-${agentWorkspaceFolder(agent)}-workspace.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setAgentActionMsg(e?.message || String(e));
    } finally {
      setAgentBusyId(null);
    }
  };
  const handleClearAgentWorkspace = async (agent: AgentConfig) => {
    setAgentActionMsg(null);
    setAgentBusyId(agent.id);
    try {
      const res = await fetch("/api/agent-workspace-clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: agentWorkspaceFolder(agent) }),
      });
      const body = await res.json().catch(() => ({}));
      setAgentActionMsg(res.ok ? `Cleared workspace for "${agent.name}".` : body.error || "Clear failed.");
    } catch (e: any) {
      setAgentActionMsg(e?.message || String(e));
    } finally {
      setAgentBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-none p-2 sm:p-4 font-mono">
      <div className="w-full max-w-4xl h-[640px] max-h-[92vh] border-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white p-3 sm:p-6 shadow-none flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-1.5 pb-3 border-b-2 border-black dark:border-white mb-3 shrink-0">
          <h2 className="text-xs sm:text-base font-bold uppercase tracking-wider truncate min-w-0">
            <RandomFontText text="[SETTINGS]" />
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase text-xs shrink-0 transition-colors"
          >
            <RandomFontText text="[CLOSE]" />
          </button>
        </div>

        {/* Modal Body: Left Tab Sidebar + Right Tab Content */}
        <div className="flex flex-col sm:flex-row gap-4 flex-1 overflow-hidden min-h-0">
          {/* Left Tabs Bar */}
          <div className="sm:w-44 shrink-0 flex sm:flex-col gap-1.5 border-b sm:border-b-0 sm:border-r border-black dark:border-white pb-2 sm:pb-0 sm:pr-3 overflow-x-auto sm:overflow-y-auto">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`text-left px-2.5 py-1.5 border text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                effectiveTab === "general"
                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
            >
              <RandomFontText text="[API_CONFIG]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("chat_template")}
              className={`text-left px-2.5 py-1.5 border text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                effectiveTab === "chat_template"
                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
            >
              <RandomFontText text="[CHAT_TEMPLATE]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("effort")}
              className={`text-left px-2.5 py-1.5 border text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                effectiveTab === "effort"
                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
            >
              <RandomFontText text="[EFFORT]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("skills")}
              className={`text-left px-2.5 py-1.5 border text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                effectiveTab === "skills"
                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
            >
              <RandomFontText text="[SKILLS]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mem")}
              className={`text-left px-2.5 py-1.5 border text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                effectiveTab === "mem"
                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
            >
              <RandomFontText text="[MEM]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("agent")}
              className={`text-left px-2.5 py-1.5 border text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                effectiveTab === "agent"
                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
            >
              <RandomFontText text="[AGENT]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mcp")}
              className={`text-left px-2.5 py-1.5 border text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                effectiveTab === "mcp"
                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
            >
              <RandomFontText text="[MCP]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("permission")}
              className={`text-left px-2.5 py-1.5 border text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                effectiveTab === "permission"
                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
            >
              <RandomFontText text="[PERMISSION]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("docs")}
              className={`text-left px-2.5 py-1.5 border text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                effectiveTab === "docs"
                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
                  : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
            >
              <RandomFontText text="[DOCS]" />
            </button>
            {hidden_tab.dev_mode && (
              <button
                type="button"
                onClick={() => setActiveTab("dev_mode")}
                className={`text-left px-2.5 py-1.5 border text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                  effectiveTab === "dev_mode"
                    ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
                    : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                }`}
              >
                <RandomFontText text="[DEV_MODE]" />
              </button>
            )}
          </div>

          {/* Right Form and Content Container */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Scrollable Tab Body */}
            <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 space-y-4 text-xs">
              {effectiveTab === "general" && (
                <div className="space-y-4">
                  {/* Tab Header */}
                  <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                    <div>
                      <RandomFontText text="API CONFIG" className="font-bold uppercase text-xs sm:text-sm" />
                    </div>
                  </div>

                  {/* API URL Textbox */}
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
                      <label className="block font-bold uppercase text-[11px]">
                        <RandomFontText text="1. API URL:" />
                      </label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {API_PROVIDER_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleChange("apiUrl", preset.url)}
                            className="px-2 py-0.5 border border-black dark:border-white font-mono uppercase text-[10px] font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                          >
                            <RandomFontText text={`[${preset.name}]`} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <RandomFontInput
                      type="text"
                      value={formData.apiUrl}
                      onChange={(e) => handleChange("apiUrl", e.target.value)}
                      placeholderText="https://...ngrok-free.dev/v1/chat/completions"
                      inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                      required
                    />
                    <p className="mt-1 text-[10px] opacity-60 normal-case">
                      <RandomFontText text="Any OpenAI-compatible /v1/chat/completions endpoint works, including both Ngrok and Ollama." />
                    </p>
                    {isOllamaUrl(formData.apiUrl) && (
                      <p className="mt-1 text-[10px] opacity-60 normal-case">
                        <RandomFontText text='Ollama: Model Name below must exactly match "ollama list" (e.g. llama3.1); API Key can stay blank. If this app and Ollama are on different machines/ports and the connection fails, run Ollama with OLLAMA_ORIGINS="*" so it accepts the request.' />
                      </p>
                    )}
                  </div>

                  {/* API Key Textbox */}
                  <div>
                    <label className="block font-bold uppercase mb-1 text-[11px]">
                      <RandomFontText text="2. API KEY:" />
                    </label>
                    <RandomFontInput
                      type="text"
                      value={formData.apiKey}
                      onChange={(e) => handleChange("apiKey", e.target.value)}
                      placeholderText="apikey-sk-..."
                      inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                    />
                  </div>
                  
                  {/* Model Name */}
                  <div>
                    <label className="block font-bold uppercase mb-1 text-[11px]">
                      <RandomFontText text="3. MODEL NAME:" />
                    </label>
                    <RandomFontInput
                      type="text"
                      value={formData.model || ""}
                      onChange={(e) => handleChange("model", e.target.value)}
                      placeholderText="MODEL NAME"
                      inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                    />
                  </div>

                  {/* System Prompt */}
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
                      <label className="block font-bold uppercase text-[11px]">
                        <RandomFontText text="4. SYSTEM PROMPT:" />
                      </label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {SYSTEM_PROMPT_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleChange("systemPrompt", preset.prompt)}
                            className="px-2 py-0.5 border border-black dark:border-white font-mono uppercase text-[10px] font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                          >
                            <RandomFontText text={`[${preset.name}]`} />
                          </button>
                        ))}
                        {formData.systemPrompt && (
                          <button
                            type="button"
                            onClick={() => handleChange("systemPrompt", "")}
                            className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white font-mono uppercase text-[10px] font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                          >
                            <RandomFontText text="[CLEAR]" />
                          </button>
                        )}
                      </div>
                    </div>
                    <RandomFontTextarea
                      value={formData.systemPrompt}
                      onChange={(e) => handleChange("systemPrompt", e.target.value)}
                      placeholderText="Enter system prompt instructions or select a preset..."
                      rows={3}
                      textareaClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                    />
                  </div>

                  {/* Generation Parameters: Temperature, Top P, Top K, Repeat Penalty, Reasoning Effort, Max Tokens */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-bold uppercase mb-1">
                        <RandomFontText text={`5. TEMPERATURE (${formData.temperature}):`} />
                      </label>
                      <input
                        type="range"
                        min="0.0"
                        max="2.0"
                        step="0.1"
                        value={formData.temperature}
                        onChange={(e) =>
                          handleChange("temperature", parseFloat(e.target.value))
                        }
                        className="w-full accent-black dark:accent-white"
                      />
                    </div>

                    <div>
                      <label className="block font-bold uppercase mb-1">
                        <RandomFontText text={`6. TOP P (${formData.topP !== undefined ? formData.topP : 0.95}):`} />
                      </label>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={formData.topP !== undefined ? formData.topP : 0.95}
                        onChange={(e) =>
                          handleChange("topP", parseFloat(e.target.value))
                        }
                        className="w-full accent-black dark:accent-white"
                      />
                    </div>

                    <div>
                      <label className="block font-bold uppercase mb-1">
                        <RandomFontText text={`7. TOP K (${formData.topK !== undefined ? formData.topK : 20}):`} />
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        step="1"
                        value={formData.topK !== undefined ? formData.topK : 20}
                        onChange={(e) =>
                          handleChange("topK", parseInt(e.target.value, 10))
                        }
                        className="w-full accent-black dark:accent-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-bold uppercase mb-1">
                        <RandomFontText text={`8. REPEAT PENALTY (${formData.repeatPenalty !== undefined ? formData.repeatPenalty : 1.05}):`} />
                      </label>
                      <input
                        type="range"
                        min="1.0"
                        max="2.0"
                        step="0.01"
                        value={formData.repeatPenalty !== undefined ? formData.repeatPenalty : 1.05}
                        onChange={(e) =>
                          handleChange("repeatPenalty", parseFloat(e.target.value))
                        }
                        className="w-full accent-black dark:accent-white"
                      />
                    </div>

                    <div>
                      <label className="block font-bold uppercase mb-1">
                        <RandomFontText text="9. THINKING:" />
                      </label>
                      <select
                        value={formData.reasoningEffort || "medium"}
                        onChange={(e) =>
                          handleChange("reasoningEffort", e.target.value as any)
                        }
                        className="w-full p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                      >
                        <option value="none" className="bg-white dark:bg-black text-black dark:text-white">none</option>
                        <option value="low" className="bg-white dark:bg-black text-black dark:text-white">low</option>
                        <option value="medium" className="bg-white dark:bg-black text-black dark:text-white">medium</option>
                        <option value="high" className="bg-white dark:bg-black text-black dark:text-white">high</option>
                        <option value="xhigh" className="bg-white dark:bg-black text-black dark:text-white">xhigh</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold uppercase mb-1">
                        <RandomFontText text="10. MAX TOKENS:" />
                      </label>
                      <RandomFontInput
                        type="text"
                        value={maxTokensInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^\d*$/.test(val)) {
                            setMaxTokensInput(val);
                          }
                        }}
                        inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Serif Lora Font Toggle */}
                  <div className="flex items-center space-x-2 pt-2 pb-1 border-t border-black/10 dark:border-white/10">
                    <input
                      type="checkbox"
                      id="useSerifLora"
                      checked={!!formData.useSerifLora}
                      onChange={(e) => handleChange("useSerifLora", e.target.checked)}
                      className="w-4 h-4 accent-black dark:accent-white cursor-pointer"
                    />
                    <label htmlFor="useSerifLora" className="font-bold uppercase cursor-pointer select-none">
                      <RandomFontText text="7. SWITCH ALL TEXT TO SERIF LORA FONT" />
                    </label>
                  </div>
                </div>
              )}

              {effectiveTab === "chat_template" && (
                <div className="space-y-4">
                  {/* Tab Header */}
                  <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                    <div>
                      <RandomFontText text="CHAT TEMPLATE" className="font-bold uppercase text-xs sm:text-sm" />
                    </div>
                    <button
                      type="button"
                      onClick={handleResetChatTemplate}
                      className="px-2.5 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white uppercase font-bold text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                    >
                      <RandomFontText text="[RESET TO DEFAULT]" />
                    </button>
                  </div>

                  {/* Think Start Tag */}
                  <div>
                    <label className="block font-bold uppercase mb-1 text-[11px]">
                      <RandomFontText text="1. THINK START TAG:" />
                    </label>
                    <RandomFontInput
                      type="text"
                      value={formData.thinkStartTag ?? "<think>"}
                      onChange={(e) => handleChange("thinkStartTag", e.target.value)}
                      placeholderText="<think>"
                      inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                    />
                  </div>

                  {/* Think End Tag */}
                  <div>
                    <label className="block font-bold uppercase mb-1 text-[11px]">
                      <RandomFontText text="2. THINK END TAG:" />
                    </label>
                    <RandomFontInput
                      type="text"
                      value={formData.thinkEndTag ?? "</think>"}
                      onChange={(e) => handleChange("thinkEndTag", e.target.value)}
                      placeholderText="</think>"
                      inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                    />
                  </div>

                  {/* Strip Open Tags */}
                  <div>
                    <label className="block font-bold uppercase mb-1 text-[11px]">
                      <RandomFontText text="3. OPEN TAGS TO STRIP:" />
                    </label>
                    <RandomFontInput
                      type="text"
                      value={formData.stripOpenTags ?? ""}
                      onChange={(e) => handleChange("stripOpenTags", e.target.value)}
                      placeholderText=""
                      inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                    />
                  </div>

                  {/* Strip Close Tags */}
                  <div>
                    <label className="block font-bold uppercase mb-1 text-[11px]">
                      <RandomFontText text="4. CLOSE TAGS TO STRIP:" />
                    </label>
                    <RandomFontInput
                      type="text"
                      value={formData.stripCloseTags ?? ""}
                      onChange={(e) => handleChange("stripCloseTags", e.target.value)}
                      placeholderText=""
                      inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {effectiveTab === "effort" && (
                <div className="space-y-4">
                  {/* Tab Header */}
                  <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                    <div>
                      <RandomFontText text="EFFORT" className="font-bold uppercase text-xs sm:text-sm" />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {EFFORT_OPTIONS.map((opt) => {
                      const isSelected = (formData.effort || "fast") === opt.id;
                      return (
                        <div
                          key={opt.id}
                          onClick={() => handleChange("effort", opt.id)}
                          className={`p-3.5 border transition-colors cursor-pointer space-y-2 ${
                            isSelected
                              ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black shadow-none"
                              : "border-black dark:border-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"
                          }`}
                        >
                          <div className={`flex items-center justify-between gap-2 pb-1.5 border-b ${
                            isSelected ? "border-white/20 dark:border-black/20" : "border-black/20 dark:border-white/20"
                          }`}>
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? "border-white dark:border-black bg-white dark:bg-black"
                                    : "border-black dark:border-white bg-transparent"
                                }`}
                              >
                                {isSelected && (
                                  <span className="w-1.5 h-1.5 bg-black dark:bg-white" />
                                )}
                              </span>
                              <span className="font-bold uppercase tracking-wide text-xs">
                                <RandomFontText text={`[${opt.title.toUpperCase()}]`} />
                              </span>
                            </div>

                            {opt.id === "fast" && (
                              <span
                                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 border ${
                                  isSelected
                                    ? "border-white/60 dark:border-black/60"
                                    : "border-black dark:border-white"
                                }`}
                              >
                                <RandomFontText text="DEFAULT" />
                              </span>
                            )}
                          </div>

                          <div
                            className={`text-[11px] font-sans leading-relaxed ${
                              isSelected
                                ? "opacity-90 font-medium"
                                : "opacity-80"
                            }`}
                          >
                            <RandomFontText text={opt.subtitle} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {effectiveTab === "skills" && (
                <div className="space-y-4">
                  {/* Skills Header & Action Bar */}
                  <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                    <div>
                      <RandomFontText text="SKILLS" className="font-bold uppercase text-xs sm:text-sm" />
                    </div>

                    {!isCreatingSkill && !editingSkillId && (
                      <button
                        type="button"
                        onClick={handleStartCreateSkill}
                        className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-black dark:hover:text-white transition-colors shrink-0"
                      >
                        <RandomFontText text="[+ CREATE SKILL]" />
                      </button>
                    )}
                  </div>

                  {/* Create / Edit Skill Form */}
                  {(isCreatingSkill || editingSkillId) ? (
                    <div className="p-3.5 border border-black dark:border-white space-y-3 bg-black/5 dark:bg-white/5">
                      <div className="border-b border-black/20 dark:border-white/20 pb-1.5 flex items-center justify-between">
                        <span className="font-bold uppercase text-xs tracking-wider">
                          <RandomFontText text={editingSkillId ? "[EDIT SKILL]" : "[CREATE NEW SKILL]"} />
                        </span>
                      </div>

                      {/* Skill Title */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="1. TITLE:" />
                        </label>
                        <RandomFontInput
                          type="text"
                          value={skillTitle}
                          onChange={(e) => setSkillTitle(e.target.value)}
                          placeholderText="Enter skill title..."
                          inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                          required
                        />
                      </div>

                      {/* Skill Description */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="2. DESCRIBE:" />
                        </label>
                        <RandomFontInput
                          type="text"
                          value={skillDescribe}
                          onChange={(e) => setSkillDescribe(e.target.value)}
                          placeholderText="Short summary describing what this skill covers..."
                          inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                          required
                        />
                      </div>

                      {/* Skill Content */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="3. CONTENT:" />
                        </label>
                        <RandomFontTextarea
                          value={skillContent}
                          onChange={(e) => setSkillContent(e.target.value)}
                          placeholderText="Write full guidelines, rules, examples, or step-by-step processes..."
                          rows={6}
                          textareaClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                          required
                        />
                      </div>

                      {/* Tags Preview */}
                      {skillTitle.trim() && (
                        <div className="text-[10px] opacity-75 font-mono">
                          <span className="font-bold uppercase">Auto-detected tags: </span>
                          <span>
                            {extractTopTags({
                              id: "preview",
                              title: skillTitle,
                              describe: skillDescribe,
                              content: skillContent,
                            }).join(", ") || "none"}
                          </span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleSaveSkill}
                          disabled={!skillTitle.trim() || !skillContent.trim()}
                          className="px-3 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white disabled:opacity-40 transition-colors"
                        >
                          <RandomFontText text={editingSkillId ? "[UPDATE SKILL]" : "[SAVE SKILL]"} />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelSkillEdit}
                          className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                        >
                          <RandomFontText text="[CANCEL]" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Search Bar */}
                      {visibleSkills.length > 0 && (
                        <div>
                          <RandomFontInput
                            type="text"
                            value={skillSearch}
                            onChange={(e) => setSkillSearch(e.target.value)}
                            placeholderText="Search skills by title, description, or content..."
                            inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                          />
                        </div>
                      )}

                      {/* Skills List */}
                      {filteredSkills.length === 0 ? (
                        <div className="p-6 border border-dashed border-black dark:border-white bg-black/5 dark:bg-white/5 text-center space-y-3">
                          <div className="font-bold uppercase text-xs opacity-75">
                            <RandomFontText text="None Yet" />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {filteredSkills.map((skill, index) => {
                            const numericId = index + 1;
                            const isExpanded = expandedSkillIds.has(skill.id);
                            const topTags = extractTopTags(skill, 8);
                            const isDefault =
                              skill.isDefault === true ||
                              skill.id.startsWith("skill-map-card") ||
                              skill.id.startsWith("skill-step-guide");
                            const isEnabled = skill.enabled !== false;

                            return (
                              <div
                                key={skill.id}
                                className={`p-3.5 border border-black dark:border-white space-y-2.5 bg-black/5 dark:bg-white/5 transition-colors ${
                                  !isEnabled ? "opacity-60" : ""
                                }`}
                              >
                                <div className="border-b border-black/20 dark:border-white/20 pb-1.5 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="px-1.5 py-0.5 border border-black dark:border-white font-mono text-[10px] font-bold shrink-0 bg-black text-white dark:bg-white dark:text-black">
                                      #{numericId}
                                    </span>
                                    <span className="font-bold uppercase text-xs truncate">
                                      <RandomFontText text={skill.title} />
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => toggleSkillExpand(skill.id)}
                                      className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                    >
                                      <RandomFontText text={isExpanded ? "[HIDE]" : "[SHOW]"} />
                                    </button>
                                    {!isDefault && (
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditSkill(skill)}
                                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                      >
                                        <RandomFontText text="[EDIT]" />
                                      </button>
                                    )}
                                    {isDefault ? (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSkill(skill.id)}
                                        className={`px-2 py-0.5 border border-black dark:border-white text-[10px] uppercase font-bold transition-colors ${
                                          isEnabled
                                            ? "bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white"
                                            : "bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                                        }`}
                                      >
                                        <RandomFontText text={isEnabled ? "[ON]" : "[OFF]"} />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSkill(skill.id)}
                                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                      >
                                        <RandomFontText text="[DELETE]" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Description */}
                                <div className="text-[11px] opacity-80 leading-relaxed font-sans">
                                  {skill.describe}
                                </div>

                                {/* Tags snippet */}
                                {topTags.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                    <span className="text-[10px] font-bold uppercase opacity-60">TAGS:</span>
                                    {topTags.map((tag, tIdx) => (
                                      <span
                                        key={tIdx}
                                        className="text-[9px] px-1 py-0.2 border border-black/20 dark:border-white/20 font-mono opacity-80"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Expanded Content View */}
                                {isExpanded && (
                                  <div className="pt-2 border-t border-black/20 dark:border-white/20">
                                    <div className="text-[10px] font-bold uppercase opacity-70 mb-1">
                                      <RandomFontText text="SKILL CONTENT:" />
                                    </div>
                                    <pre className="p-2.5 border border-black dark:border-white bg-white dark:bg-black font-mono text-[11px] whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                                      {skill.content}
                                    </pre>
                                    <div className="text-[10px] opacity-60 mt-1 font-mono">
                                      AI call: load_skills({numericId})
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {effectiveTab === "mem" && (
                <div className="space-y-4">
                  {/* Mem Header & Action Bar */}
                  <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                    <div>
                      <RandomFontText text="MEMORY" className="font-bold uppercase text-xs sm:text-sm" />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleChange("memEnabled", !formData.memEnabled)}
                        className={`px-3 py-1.5 border text-xs font-bold uppercase whitespace-nowrap transition-colors ${
                          formData.memEnabled
                            ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white"
                            : "border-black/30 dark:border-white/30 bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                        }`}
                      >
                        <RandomFontText text={formData.memEnabled ? "[MEM ON]" : "[MEM OFF]"} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setImportError(null);
                          setImportCandidates(null);
                          setImportModalOpen(true);
                        }}
                        className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-xs font-bold uppercase transition-colors"
                      >
                        <RandomFontText text="[IMPORT AI]" />
                      </button>

                      {!isCreatingMem && !editingMemId && (
                        <button
                          type="button"
                          onClick={handleStartCreateMem}
                          className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-black dark:hover:text-white transition-colors"
                        >
                          <RandomFontText text="[+ CREATE MEMORY]" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Create / Edit Memory Form */}
                  {(isCreatingMem || editingMemId) ? (
                    <div className="p-3.5 border border-black dark:border-white space-y-3 bg-black/5 dark:bg-white/5">
                      <div className="border-b border-black/20 dark:border-white/20 pb-1.5 flex items-center justify-between">
                        <span className="font-bold uppercase text-xs tracking-wider">
                          <RandomFontText
                            text={
                              editingMemId
                                ? editingMemNamespace === "ai"
                                  ? "[EDIT AI MEMORY]"
                                  : "[EDIT MEMORY]"
                                : "[CREATE NEW MEMORY]"
                            }
                          />
                        </span>
                      </div>

                      {/* Memory Name */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="1. NAME / IDENTIFIER:" />
                        </label>
                        <RandomFontInput
                          type="text"
                          value={memName}
                          onChange={(e) => setMemName(e.target.value)}
                          placeholderText="e.g. user_preferences, project_stack, coding_rules..."
                          inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                          required
                        />
                      </div>

                      {/* Memory Keywords */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="2. KEYWORDS / TRIGGERS (COMMA SEPARATED):" />
                        </label>
                        <RandomFontInput
                          type="text"
                          value={memKeywords}
                          onChange={(e) => setMemKeywords(e.target.value)}
                          placeholderText="e.g. typescript, tailwind, react, preferences..."
                          inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                        />
                      </div>

                      {/* Memory Content */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="3. CONTENT / STORED KNOWLEDGE:" />
                        </label>
                        <RandomFontTextarea
                          value={memContent}
                          onChange={(e) => setMemContent(e.target.value)}
                          placeholderText="Write detailed facts, preferences, constraints, or context the AI should remember..."
                          rows={6}
                          textareaClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                          required
                        />
                      </div>

                      {/* Trigger Hint Preview */}
                      {memName.trim() && (
                        <div className="text-[10px] opacity-75 font-mono">
                          <span className="font-bold uppercase">AI Trigger Command: </span>
                          <span>read_mem("{memName.trim()}")</span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleSaveMem}
                          disabled={!memName.trim() || !memContent.trim()}
                          className="px-3 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white disabled:opacity-40 transition-colors"
                        >
                          <RandomFontText text={editingMemId ? "[UPDATE MEMORY]" : "[SAVE MEMORY]"} />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelMemEdit}
                          className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                        >
                          <RandomFontText text="[CANCEL]" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Search Bar */}
                      {(safeUserMem.length > 0 || safeAiMem.length > 0) && (
                        <div>
                          <RandomFontInput
                            type="text"
                            value={memSearch}
                            onChange={(e) => setMemSearch(e.target.value)}
                            placeholderText="Search memories by name, keywords, or content..."
                            inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                          />
                        </div>
                      )}

                      {/* User Memories List */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-1">
                          <span className="font-bold text-xs uppercase tracking-wide opacity-80">
                            <RandomFontText text={`USER MEMORIES (${safeUserMem.length})`} />
                          </span>
                        </div>

                        {filteredUserMem.length === 0 ? (
                          <div className="p-6 border border-dashed border-black dark:border-white bg-black/5 dark:bg-white/5 text-center space-y-3">
                            <div className="font-bold uppercase text-xs opacity-75">
                              <RandomFontText text="None Yet" />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {filteredUserMem.map((m, index) => {
                              const numericId = index + 1;
                              const isExpanded = expandedMemIds.has(m.id);
                              return (
                                <div
                                  key={m.id}
                                  className="p-3.5 border border-black dark:border-white space-y-2.5 bg-black/5 dark:bg-white/5 transition-colors"
                                >
                                  <div className="border-b border-black/20 dark:border-white/20 pb-1.5 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="px-1.5 py-0.5 border border-black dark:border-white font-mono text-[10px] font-bold shrink-0 bg-black text-white dark:bg-white dark:text-black">
                                        #{numericId}
                                      </span>
                                      <span className="font-bold uppercase text-xs truncate">
                                        <RandomFontText text={m.name} />
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => toggleMemExpand(m.id)}
                                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                      >
                                        <RandomFontText text={isExpanded ? "[HIDE]" : "[SHOW]"} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditMem(m, "user")}
                                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                      >
                                        <RandomFontText text="[EDIT]" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteUserMem(m.id)}
                                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                      >
                                        <RandomFontText text="[DEL]" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Keywords chips */}
                                  {m.keywords && m.keywords.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                      <span className="text-[10px] font-bold uppercase opacity-60">KEYWORDS:</span>
                                      {m.keywords.map((kw, kIdx) => (
                                        <span
                                          key={kIdx}
                                          className="text-[9px] px-1 py-0.2 border border-black/20 dark:border-white/20 font-mono opacity-80"
                                        >
                                          {kw}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Compact content preview when collapsed */}
                                  {!isExpanded && (
                                    <div className="text-[11px] font-mono line-clamp-2 opacity-80 leading-relaxed">
                                      {m.content}
                                    </div>
                                  )}

                                  {/* Expanded Content View */}
                                  {isExpanded && (
                                    <div className="pt-2 border-t border-black/20 dark:border-white/20">
                                      <div className="text-[10px] font-bold uppercase opacity-70 mb-1">
                                        <RandomFontText text="MEMORY CONTENT:" />
                                      </div>
                                      <pre className="p-2.5 border border-black dark:border-white bg-white dark:bg-black font-mono text-[11px] whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                                        {m.content}
                                      </pre>
                                      <div className="text-[10px] opacity-60 mt-1 font-mono">
                                        AI Trigger: read_mem("{m.name}")
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* AI's Own Memories List */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-1">
                          <span className="font-bold text-xs uppercase tracking-wide opacity-80">
                            <RandomFontText text={`AI AUTONOMOUS MEMORIES (${safeAiMem.length})`} />
                          </span>
                        </div>

                        {filteredAiMem.length === 0 ? (
                          <div className="p-6 border border-dashed border-black dark:border-white bg-black/5 dark:bg-white/5 text-center space-y-3">
                            <div className="font-bold uppercase text-xs opacity-75">
                              <RandomFontText text="None Yet" />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {filteredAiMem.map((m, index) => {
                              const numericId = index + 1;
                              const isExpanded = expandedMemIds.has(m.id);
                              return (
                                <div
                                  key={m.id}
                                  className="p-3.5 border border-black dark:border-white space-y-2.5 bg-black/5 dark:bg-white/5 transition-colors"
                                >
                                  <div className="border-b border-black/20 dark:border-white/20 pb-1.5 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="px-1.5 py-0.5 border border-black dark:border-white font-mono text-[10px] font-bold shrink-0 bg-black text-white dark:bg-white dark:text-black">
                                        AI #{numericId}
                                      </span>
                                      <span className="font-bold uppercase text-xs truncate">
                                        <RandomFontText text={m.name} />
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => toggleMemExpand(m.id)}
                                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                      >
                                        <RandomFontText text={isExpanded ? "[HIDE]" : "[SHOW]"} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditMem(m, "ai")}
                                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                      >
                                        <RandomFontText text="[EDIT]" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteAiMem(m.id)}
                                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                      >
                                        <RandomFontText text="[DEL]" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Keywords chips */}
                                  {m.keywords && m.keywords.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                      <span className="text-[10px] font-bold uppercase opacity-60">KEYWORDS:</span>
                                      {m.keywords.map((kw, kIdx) => (
                                        <span
                                          key={kIdx}
                                          className="text-[9px] px-1 py-0.2 border border-black/20 dark:border-white/20 font-mono opacity-80"
                                        >
                                          {kw}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Compact content preview when collapsed */}
                                  {!isExpanded && (
                                    <div className="text-[11px] font-mono line-clamp-2 opacity-80 leading-relaxed">
                                      {m.content}
                                    </div>
                                  )}

                                  {/* Expanded Content View */}
                                  {isExpanded && (
                                    <div className="pt-2 border-t border-black/20 dark:border-white/20">
                                      <div className="text-[10px] font-bold uppercase opacity-70 mb-1">
                                        <RandomFontText text="AI MEMORY CONTENT:" />
                                      </div>
                                      <pre className="p-2.5 border border-black dark:border-white bg-white dark:bg-black font-mono text-[11px] whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                                        {m.content}
                                      </pre>
                                      <div className="text-[10px] opacity-60 mt-1 font-mono">
                                        AI Trigger: read_mem("{m.name}")
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Import Modal */}
                  {importModalOpen && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4">
                      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white text-black dark:bg-black dark:text-white border-2 border-black dark:border-white p-5 space-y-4 shadow-2xl font-mono">
                        <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-3">
                          <RandomFontText text="Import memory from other AI" className="font-bold text-sm uppercase tracking-wide" />
                          <button
                            type="button"
                            onClick={() => {
                              setImportModalOpen(false);
                              setImportCandidates(null);
                            }}
                            className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-xs font-bold uppercase hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                          >
                            <RandomFontText text="[X]" />
                          </button>
                        </div>

                        {!importCandidates && (
                          <div className="space-y-4">
                            {/* Step 1 */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 border border-black dark:border-white flex items-center justify-center text-[11px] font-bold bg-black text-white dark:bg-white dark:text-black flex-shrink-0">
                                  1
                                </span>
                                <RandomFontText
                                  text="Copy this prompt into a chat with your other AI provider"
                                  className="text-xs font-bold"
                                />
                              </div>
                              <div className="border border-black dark:border-white bg-black/5 dark:bg-white/5 p-3 space-y-3">
                                <pre className="text-xs opacity-90 leading-relaxed font-mono whitespace-pre-wrap select-all font-sans">
                                  {OTHER_AI_EXPORT_PROMPT}
                                </pre>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard?.writeText(OTHER_AI_EXPORT_PROMPT);
                                      setImportCopied(true);
                                      setTimeout(() => setImportCopied(false), 1500);
                                    }}
                                    className="px-2.5 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[11px] font-bold uppercase transition-colors"
                                  >
                                    <RandomFontText text={importCopied ? "[COPIED]" : "[COPY PROMPT]"} />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Step 2 */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 border border-black dark:border-white flex items-center justify-center text-[11px] font-bold bg-black text-white dark:bg-white dark:text-black flex-shrink-0">
                                  2
                                </span>
                                <RandomFontText
                                  text="Paste results below to add to memory"
                                  className="text-xs font-bold"
                                />
                              </div>
                              <RandomFontTextarea
                                placeholderText="Paste your memory details here..."
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                rows={5}
                                textareaClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none"
                              />
                            </div>

                            {importError && (
                              <p className="text-[11px] text-black dark:text-white font-mono border border-black/30 dark:border-white/30 p-2 bg-black/5 dark:bg-white/5">
                                {importError}
                              </p>
                            )}

                            {/* Footer Buttons */}
                            <div className="flex justify-end gap-2 pt-2 border-t border-black/10 dark:border-white/10">
                              <button
                                type="button"
                                onClick={() => {
                                  setImportModalOpen(false);
                                  setImportText("");
                                  setImportError(null);
                                }}
                                className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-xs font-bold uppercase transition-colors"
                              >
                                <RandomFontText text="[CANCEL]" />
                              </button>
                              <button
                                type="button"
                                onClick={handleGenerateMemories}
                                disabled={importingMem || !importText.trim()}
                                className="px-3 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white text-xs font-bold uppercase disabled:opacity-40 transition-colors"
                              >
                                <RandomFontText text={importingMem ? "[IMPORTING...]" : "[ADD TO MEMORY]"} />
                              </button>
                            </div>
                          </div>
                        )}

                        {importCandidates && importCandidates.length > 0 && (
                          <div className="space-y-3">
                            <div>
                              <RandomFontText text={`REVIEW EXTRACTED MEMORIES (${importCandidates.length})`} className="font-bold text-xs uppercase" />
                              <p className="text-[11px] opacity-60 mt-0.5">
                                <RandomFontText text="Select which memories you would like to save to your memory list:" />
                              </p>
                            </div>

                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                              {importCandidates.map((c, i) => {
                                const isChecked = selectedImportIdx.has(i);
                                return (
                                  <div
                                    key={i}
                                    onClick={() =>
                                      setSelectedImportIdx((prev) => {
                                        const next = new Set(prev);
                                        next.has(i) ? next.delete(i) : next.add(i);
                                        return next;
                                      })
                                    }
                                    className={`p-3 border border-black dark:border-white transition-colors cursor-pointer select-none space-y-1.5 ${
                                      isChecked
                                        ? "bg-black/10 dark:bg-white/10"
                                        : "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`w-3.5 h-3.5 border border-black dark:border-white flex items-center justify-center flex-shrink-0 transition-colors ${
                                          isChecked
                                            ? "bg-black text-white dark:bg-white dark:text-black"
                                            : "bg-white dark:bg-black"
                                        }`}
                                      >
                                        {isChecked && (
                                          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M2 6l3 3 5-5" />
                                          </svg>
                                        )}
                                      </div>
                                      <span className="font-bold text-xs uppercase tracking-wide">
                                        {c.name}{c.keywords.length > 0 ? ` (${c.keywords.join(", ")})` : ""}
                                      </span>
                                    </div>
                                    <div className="text-[11px] opacity-80 whitespace-pre-wrap leading-relaxed pl-5 font-sans">
                                      {c.content}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-black/10 dark:border-white/10">
                              <button
                                type="button"
                                onClick={() => setImportCandidates(null)}
                                className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-xs font-bold uppercase transition-colors"
                              >
                                <RandomFontText text="[BACK]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleConfirmImportMemories();
                                  setImportText("");
                                  setImportModalOpen(false);
                                }}
                                className="px-3 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white text-xs font-bold uppercase transition-colors"
                              >
                                <RandomFontText text="[SAVE SELECTED]" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {effectiveTab === "agent" && (
                <div className="space-y-4">
                  {/* Agent Header & Action Bar */}
                  <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                    <div>
                      <RandomFontText text="SUB-AGENTS" className="font-bold uppercase text-xs sm:text-sm" />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleChange("agentEnabled", !formData.agentEnabled)}
                        className={`px-3 py-1.5 border text-xs font-bold uppercase whitespace-nowrap transition-colors ${
                          formData.agentEnabled
                            ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white"
                            : "border-black/30 dark:border-white/30 bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                        }`}
                      >
                        <RandomFontText text={formData.agentEnabled ? "[AGENT ON]" : "[AGENT OFF]"} />
                      </button>

                      {!isCreatingAgent && !editingAgentId && (
                        <button
                          type="button"
                          onClick={handleStartCreateAgent}
                          className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-black dark:hover:text-white transition-colors"
                        >
                          <RandomFontText text="[+ CREATE AGENT]" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Create / Edit Agent Form */}
                  {(isCreatingAgent || editingAgentId) ? (
                    <div className="p-3.5 border border-black dark:border-white space-y-3 bg-black/5 dark:bg-white/5">
                      <div className="border-b border-black/20 dark:border-white/20 pb-1.5 flex items-center justify-between">
                        <span className="font-bold uppercase text-xs tracking-wider">
                          <RandomFontText text={editingAgentId ? "[EDIT AGENT]" : "[CREATE NEW AGENT]"} />
                        </span>
                      </div>

                      {/* 1. Agent Name */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="1. AGENT NAME / IDENTIFIER:" />
                        </label>
                        <RandomFontInput
                          type="text"
                          value={agentForm.name}
                          onChange={(e) => setAgentForm((p) => ({ ...p, name: e.target.value }))}
                          placeholderText="e.g. code_reviewer, math_solver, image_analyst..."
                          inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                          required
                        />
                      </div>

                      {/* 2. Description / Role */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="2. DESCRIPTION / ROLE & INSTRUCTIONS:" />
                        </label>
                        <RandomFontTextarea
                          value={agentForm.description}
                          onChange={(e) => setAgentForm((p) => ({ ...p, description: e.target.value }))}
                          placeholderText='e.g. "Expert at Python algorithms and debugging. Provide step-by-step verified solutions and unit tests."'
                          rows={4}
                          textareaClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                        />
                      </div>

                      {/* 3. API Endpoint URL */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="3. API ENDPOINT URL:" />
                        </label>
                        <RandomFontInput
                          type="text"
                          value={agentForm.apiUrl}
                          onChange={(e) => setAgentForm((p) => ({ ...p, apiUrl: e.target.value }))}
                          placeholderText="https://api.openai.com/v1/chat/completions"
                          inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                          required
                        />
                      </div>

                      {/* 4. API Key (Optional) */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="4. API KEY (OPTIONAL):" />
                        </label>
                        <RandomFontInput
                          type="password"
                          value={agentForm.apiKey}
                          onChange={(e) => setAgentForm((p) => ({ ...p, apiKey: e.target.value }))}
                          placeholderText="Enter API Key if required..."
                          inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                        />
                      </div>

                      {/* 5. Model Name */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="5. MODEL NAME:" />
                        </label>
                        <RandomFontInput
                          type="text"
                          value={agentForm.model || ""}
                          onChange={(e) => setAgentForm((p) => ({ ...p, model: e.target.value }))}
                          placeholderText="e.g. gpt-4o, claude-3-5-sonnet, gemini-2.5-flash..."
                          inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                        />
                      </div>

                      {/* 6. Model Parameters Grid */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="6. MODEL PARAMETERS:" />
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <span className="text-[10px] opacity-60 uppercase block mb-0.5">TEMPERATURE:</span>
                            <RandomFontInput
                              type="number"
                              step="0.1"
                              value={String(agentForm.temperature)}
                              onChange={(e) => setAgentForm((p) => ({ ...p, temperature: parseFloat(e.target.value) || 0 }))}
                              inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] opacity-60 uppercase block mb-0.5">MAX TOKENS:</span>
                            <RandomFontInput
                              type="number"
                              value={String(agentForm.maxTokens)}
                              onChange={(e) => setAgentForm((p) => ({ ...p, maxTokens: parseInt(e.target.value, 10) || 0 }))}
                              inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] opacity-60 uppercase block mb-0.5">TOP P:</span>
                            <RandomFontInput
                              type="number"
                              step="0.05"
                              value={agentForm.topP !== undefined ? String(agentForm.topP) : ""}
                              onChange={(e) => setAgentForm((p) => ({ ...p, topP: parseFloat(e.target.value) }))}
                              inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] opacity-60 uppercase block mb-0.5">TOP K:</span>
                            <RandomFontInput
                              type="number"
                              value={agentForm.topK !== undefined ? String(agentForm.topK) : ""}
                              onChange={(e) => setAgentForm((p) => ({ ...p, topK: parseInt(e.target.value, 10) }))}
                              inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 7. Reasoning Effort */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="7. REASONING EFFORT:" />
                        </label>
                        <div className="flex gap-1 flex-wrap">
                          {EFFORT_OPTIONS.filter((o) => o.id !== "omni").map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setAgentForm((p) => ({ ...p, effort: opt.id }))}
                              className={`px-2.5 py-1 border text-[10px] font-bold uppercase transition-colors ${
                                agentForm.effort === opt.id
                                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white"
                                  : "border-black/30 dark:border-white/30 bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                              }`}
                            >
                              {opt.title}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 8. Tag / Mode */}
                      <div>
                        <label className="block font-bold uppercase mb-1 text-[11px]">
                          <RandomFontText text="8. AGENT TAG / MODE:" />
                        </label>
                        <div className="flex gap-1.5">
                          {(["text", "image"] as const).map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setAgentForm((p) => ({ ...p, tag }))}
                              className={`px-3 py-1 border text-[10px] font-bold uppercase transition-colors ${
                                agentForm.tag === tag
                                  ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white"
                                  : "border-black/30 dark:border-white/30 bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                              }`}
                            >
                              {tag === "image" ? "[TAG: IMAGE (VISION)]" : "[TAG: TEXT (GENERAL)]"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Live AI Tool Call Trigger Hint */}
                      {agentForm.name.trim() && (
                        <div className="text-[10px] opacity-75 font-mono">
                          <span className="font-bold uppercase">AI Tool Trigger: </span>
                          <span>delegate_agent("{agentForm.name.trim()}")</span>
                        </div>
                      )}

                      {/* Test Result Message */}
                      {agentTestResult && (
                        <div className={`p-2.5 border font-mono text-[11px] ${
                          agentTestResult.ok
                            ? "border-black dark:border-white bg-black/5 dark:bg-white/5 opacity-80"
                            : "border-black/50 dark:border-white/50 bg-black/10 dark:bg-white/10 text-black dark:text-white"
                        }`}>
                          {agentTestResult.ok ? `TEST PASSED: ${agentTestResult.text}` : `TEST FAILED: ${agentTestResult.text}`}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={handleSaveAgent}
                          disabled={!agentForm.name.trim() || !agentForm.apiUrl.trim()}
                          className="px-3 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white disabled:opacity-40 transition-colors"
                        >
                          <RandomFontText text={editingAgentId ? "[UPDATE AGENT]" : "[SAVE AGENT]"} />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelAgentEdit}
                          className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                        >
                          <RandomFontText text="[CANCEL]" />
                        </button>
                        <button
                          type="button"
                          onClick={handleTestAgent}
                          disabled={agentTesting || !agentForm.apiUrl.trim()}
                          className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-xs font-bold uppercase disabled:opacity-50 transition-colors"
                        >
                          <RandomFontText text={agentTesting ? "[TESTING...]" : "[SEND TEST PROMPT]"} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Search Bar */}
                      {safeAgents.length > 0 && (
                        <div>
                          <RandomFontInput
                            type="text"
                            value={agentSearch}
                            onChange={(e) => setAgentSearch(e.target.value)}
                            placeholderText="Search agents by name, description, model, or API URL..."
                            inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs focus:outline-none"
                          />
                        </div>
                      )}

                      {agentActionMsg && (
                        <div className="p-2.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 text-[11px] font-mono">
                          {agentActionMsg}
                        </div>
                      )}

                      {/* Agents List */}
                      {filteredAgents.length === 0 ? (
                        <div className="p-6 border border-dashed border-black dark:border-white bg-black/5 dark:bg-white/5 text-center space-y-3">
                          <div className="font-bold uppercase text-xs opacity-75">
                            <RandomFontText text="None Yet" />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {filteredAgents.map((a, index) => {
                            const numericId = index + 1;
                            const isExpanded = expandedAgentIds.has(a.id);
                            return (
                              <div
                                key={a.id}
                                className="p-3.5 border border-black dark:border-white space-y-2.5 bg-black/5 dark:bg-white/5 transition-colors"
                              >
                                <div className="border-b border-black/20 dark:border-white/20 pb-1.5 flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="px-1.5 py-0.5 border border-black dark:border-white font-mono text-[10px] font-bold shrink-0 bg-black text-white dark:bg-white dark:text-black">
                                      #{numericId}
                                    </span>
                                    <div>
                                      <div className="font-bold uppercase text-xs truncate">
                                        <RandomFontText text={a.name} />
                                        {a.tag === "image" && (
                                          <span className="ml-1.5 text-[10px] px-1 py-0.2 border border-black/30 dark:border-white/30 opacity-75">
                                            [IMAGE]
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                    <button
                                      type="button"
                                      onClick={() => toggleAgentExpand(a.id)}
                                      className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                    >
                                      <RandomFontText text={isExpanded ? "[HIDE]" : "[SHOW]"} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditAgent(a)}
                                      className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                    >
                                      <RandomFontText text="[EDIT]" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAgent(a.id)}
                                      className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white text-[10px] uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                    >
                                      <RandomFontText text="[DEL]" />
                                    </button>
                                  </div>
                                </div>

                                {a.description && (
                                  <div className="text-[11px] opacity-80 leading-relaxed font-sans">
                                    {a.description}
                                  </div>
                                )}

                                <div className="text-[10px] opacity-60 font-mono">
                                  {a.model || "Default Model"} @ {a.apiUrl}
                                </div>

                                {isExpanded && (
                                  <div className="pt-2 border-t border-black/20 dark:border-white/20 space-y-2">
                                    <div className="text-[10px] font-bold uppercase opacity-70">
                                      <RandomFontText text="AGENT CONFIGURATION & PARAMETERS:" />
                                    </div>
                                    <div className="p-2.5 border border-black dark:border-white bg-white dark:bg-black font-mono text-[11px] space-y-1">
                                      <div><span className="opacity-60">ENDPOINT:</span> {a.apiUrl}</div>
                                      <div><span className="opacity-60">MODEL:</span> {a.model || "Default"}</div>
                                      <div>
                                        <span className="opacity-60">TEMP:</span> {a.temperature} |{" "}
                                        <span className="opacity-60">MAX TOKENS:</span> {a.maxTokens} |{" "}
                                        <span className="opacity-60">EFFORT:</span> {a.effort} |{" "}
                                        <span className="opacity-60">MODE:</span> {a.tag.toUpperCase()}
                                      </div>
                                    </div>
                                    <div className="text-[10px] opacity-60 font-mono">
                                      AI Trigger: delegate_agent("{a.name}")
                                    </div>
                                  </div>
                                )}

                                <div className="flex gap-1.5 flex-wrap pt-0.5 border-t border-black/10 dark:border-white/10">
                                  <button
                                    type="button"
                                    disabled={agentBusyId === a.id}
                                    onClick={() => handleExportAgentWorkspace(a)}
                                    className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] uppercase font-bold disabled:opacity-50 transition-colors"
                                  >
                                    <RandomFontText text="[EXPORT WORKSPACE]" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={agentBusyId === a.id}
                                    onClick={() => handleClearAgentWorkspace(a)}
                                    className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] uppercase font-bold disabled:opacity-50 transition-colors"
                                  >
                                    <RandomFontText text="[CLEAR WORKSPACE]" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {effectiveTab === "mcp" && (
                <div className="space-y-4 font-mono text-black dark:text-white">
                  <McpPanel />
                </div>
              )}

              {effectiveTab === "permission" && (
                <div className="space-y-4 font-mono text-black dark:text-white">
                  <PermissionPanel />
                </div>
              )}

              {effectiveTab === "docs" && (
                <div className="space-y-4 font-mono text-black dark:text-white text-xs">
                  {/* Tab Header */}
                  <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                    <div>
                      <RandomFontText text="DOCS" className="font-bold uppercase text-xs sm:text-sm" />
                    </div>
                  </div>

                  {/* Intro Block */}
                  <div className="p-3.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-2">
                    <div>
                      <span>by mondk (</span>
                      <a
                        href="https://huggingface.co/mondk"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-bold hover:opacity-80 transition-opacity"
                      >
                        https://huggingface.co/mondk
                      </a>
                      <span>)</span>
                    </div>
                    <div className="font-bold text-sm tracking-wide">
                      <RandomFontText text="ty for using!!!" />
                    </div>
                  </div>

                  <div className="border-t border-black/20 dark:border-white/20 my-2" />

                  {/* Feature Comparison Table */}
                  <div className="overflow-x-auto border border-black dark:border-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-black dark:border-white bg-black/10 dark:bg-white/10 font-bold uppercase">
                          <th className="p-2.5 border-r border-black dark:border-white"></th>
                          <th className="p-2.5 border-r border-black dark:border-white">
                            <RandomFontText text="Web" />
                          </th>
                          <th className="p-2.5 border-r border-black dark:border-white">
                            <RandomFontText text="LocalHost" />
                          </th>
                          <th className="p-2.5">
                            <RandomFontText text="Terminal" />
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/20 dark:divide-white/20">
                        <tr className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                          <td className="p-2.5 font-bold border-r border-black dark:border-white bg-black/5 dark:bg-white/5 whitespace-nowrap">
                            <RandomFontText text="Files" />
                          </td>
                          <td className="p-2.5 border-r border-black dark:border-white">Limited to a few MB</td>
                          <td className="p-2.5 border-r border-black dark:border-white font-bold">Unlimited storage on your machine</td>
                          <td className="p-2.5 font-bold">Unlimited storage on your machine</td>
                        </tr>
                        <tr className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                          <td className="p-2.5 font-bold border-r border-black dark:border-white bg-black/5 dark:bg-white/5 whitespace-nowrap">
                            <RandomFontText text="External access" />
                          </td>
                          <td className="p-2.5 border-r border-black dark:border-white">Limited</td>
                          <td className="p-2.5 border-r border-black dark:border-white font-bold">Yes</td>
                          <td className="p-2.5 font-bold">Yes</td>
                        </tr>
                        <tr className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                          <td className="p-2.5 font-bold border-r border-black dark:border-white bg-black/5 dark:bg-white/5 whitespace-nowrap">
                            <RandomFontText text="Working with local files" />
                          </td>
                          <td className="p-2.5 border-r border-black dark:border-white">Upload only</td>
                          <td className="p-2.5 border-r border-black dark:border-white font-bold">Yes</td>
                          <td className="p-2.5 font-bold">Yes</td>
                        </tr>
                        <tr className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                          <td className="p-2.5 font-bold border-r border-black dark:border-white bg-black/5 dark:bg-white/5 whitespace-nowrap">
                            <RandomFontText text="Angel management" />
                          </td>
                          <td className="p-2.5 border-r border-black dark:border-white">No</td>
                          <td className="p-2.5 border-r border-black dark:border-white font-bold">Yes</td>
                          <td className="p-2.5 font-bold">Yes</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="border-t border-black/20 dark:border-white/20 my-2" />

                  {/* Resource Links */}
                  <div className="p-3.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">Download LocalHost here:</span>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); alert("LocalHost link: link_here"); }}
                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors underline"
                      >
                        link_here
                      </a>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">Contribute source code to Fanluc here:</span>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); alert("Fanluc contribution link: link_here"); }}
                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors underline"
                      >
                        link_here
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: DEV_MODE */}
              {hidden_tab.dev_mode && effectiveTab === "dev_mode" && (
                <div className="space-y-4 font-mono text-black dark:text-white">
                  {/* DEV SWITCHES */}
                  <div className="space-y-3">
                    {/* 1. Performance Monitor Switch */}
                    <div className="p-3.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-black/20 dark:border-white/20 gap-2">
                        <span className="font-bold uppercase text-xs tracking-wider">
                          <RandomFontText text="[PERFORMANCE MONITOR]" />
                        </span>
                        {onTogglePerfMonitor && (
                          <button
                            type="button"
                            onClick={onTogglePerfMonitor}
                            className={`px-3 py-1 border border-black dark:border-white font-bold text-xs uppercase shrink-0 transition-colors ${
                              isPerfMonitorEnabled
                                ? "bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white"
                                : "bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                            }`}
                          >
                            <RandomFontText text={isPerfMonitorEnabled ? "[HUD: ON]" : "[HUD: OFF]"} />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] opacity-75 leading-relaxed">
                        <RandomFontText text="Enable the floating HUD bar to track tokens, token/s throughput, and tool calls live while chatting." />
                      </p>
                    </div>

                    {/* 2. View Raw Switch */}
                    <div className="p-3.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-2.5">
                      <div className="flex items-center justify-between pb-1.5 border-b border-black/20 dark:border-white/20 gap-2">
                        <span className="font-bold uppercase text-xs tracking-wider">
                          <RandomFontText text="[VIEW RAW PAYLOAD]" />
                        </span>
                        {onToggleRawView && (
                          <button
                            type="button"
                            onClick={onToggleRawView}
                            className={`px-3 py-1 border border-black dark:border-white font-bold text-xs uppercase shrink-0 transition-colors ${
                              isRawViewEnabled
                                ? "bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white"
                                : "bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                            }`}
                          >
                            <RandomFontText text={isRawViewEnabled ? "[RAW: ON]" : "[RAW: OFF]"} />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] opacity-75 leading-relaxed">
                        <RandomFontText text="Do not hide system tags (<think>, toolcall, JSON). See exactly what the system sends and what the AI responds." />
                      </p>

                      {/* Quick Inspector of Last Raw Request / Response */}
                      {(lastRawRequest || lastRawResponse) && (
                        <div className="pt-2 border-t border-black/10 dark:border-white/10 space-y-2">
                          {lastRawRequest && (
                            <div className="p-2 border border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5 text-[11px]">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold opacity-70">[LATEST_SENT_PAYLOAD]:</span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(JSON.stringify(lastRawRequest, null, 2));
                                    setCopiedReq(true);
                                    setTimeout(() => setCopiedReq(false), 2000);
                                  }}
                                  className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] uppercase font-bold transition-colors"
                                >
                                  {copiedReq ? "[COPIED!]" : "[COPY REQUEST]"}
                                </button>
                              </div>
                              <pre className="max-h-24 overflow-y-auto text-[10px] whitespace-pre-wrap break-all opacity-80">
                                {JSON.stringify(lastRawRequest, null, 2)}
                              </pre>
                            </div>
                          )}

                          {lastRawResponse && (
                            <div className="p-2 border border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5 text-[11px]">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold opacity-70">[LATEST_RECEIVED_PAYLOAD]:</span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(lastRawResponse);
                                    setCopiedRes(true);
                                    setTimeout(() => setCopiedRes(false), 2000);
                                  }}
                                  className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] uppercase font-bold transition-colors"
                                >
                                  {copiedRes ? "[COPIED!]" : "[COPY RESPONSE]"}
                                </button>
                              </div>
                              <pre className="max-h-24 overflow-y-auto text-[10px] whitespace-pre-wrap break-all opacity-80">
                                {lastRawResponse}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3. AI Role Simulator Switch */}
                    <div className="p-3.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-black/20 dark:border-white/20 gap-2">
                        <span className="font-bold uppercase text-xs tracking-wider">
                          <RandomFontText text="[AI ROLE SIMULATOR (roleUser)]" />
                        </span>
                        {onToggleAiRoleSim && (
                          <button
                            type="button"
                            onClick={onToggleAiRoleSim}
                            className={`px-3 py-1 border border-black dark:border-white font-bold text-xs uppercase shrink-0 transition-colors ${
                              isAiRoleSimEnabled
                                ? "bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white"
                                : "bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                            }`}
                          >
                            <RandomFontText text={isAiRoleSimEnabled ? "[ROLE_SIM: ON]" : "[ROLE_SIM: OFF]"} />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] opacity-75 leading-relaxed">
                        <RandomFontText text="Activates the roleUser prompt. The AI takes on the role of the user, giving you problems/code, while you play the Assistant with access to AI tool commands (/help)." />
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Fixed Submit Button at Bottom */}
            <div className="pt-3 border-t-2 border-black dark:border-white shrink-0 mt-2">
              <button
                type="button"
                onClick={handleSubmit}
                className="w-full py-2.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black uppercase font-bold text-xs tracking-wider hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-colors"
              >
                <RandomFontText text="[SAVE_SETTINGS]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
