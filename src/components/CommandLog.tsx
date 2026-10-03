import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Search, Globe, FileEdit, FileCode, SearchCode, Folder, Trash2, ArrowRightLeft, GitCompare, RotateCcw, Terminal, History, BookOpen, Map, Cloud, Languages } from 'lucide-react';
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
} from '../utils/fileCommands';
import { extractAllSearchCommands, extractAllFetchCommands } from '../utils/yahooSearch';
import { extractAllImageSearchCommands } from '../utils/imageSearch';
import { extractAllMcpCalls } from '../utils/mcpHelper';
import { extractShowMapCommands } from './MapEmbedCard';
import { extractWeatherCommands } from '../utils/weatherHelper';
import { extractTranslateCommands } from '../utils/translateHelper';
import { 
  extractAllListHistoryCommands, 
  extractAllSeeHistoryCommands, 
  extractAllListKeywordsCommands 
} from '../utils/historyHelper';
import { parseRunCmdCommands } from '../utils/codeRunner';
import { hasListSkillsCommand, parseLoadSkillsCommands } from '../utils/skillHelper';
import { parseReadDocsCommands } from '../utils/docsHelper';
import { RandomFontText } from '../utils/randomFont';
import { parseThinkContent } from '../utils/parseThink';

interface Props {
  text: string;
  thinkStartTag?: string;
  thinkEndTag?: string;
  stripOpenTags?: string;
  stripCloseTags?: string;
}

export function extractToolStepsFromText(
  blockStr: string,
  thinkStartTag?: string,
  thinkEndTag?: string
): { type: string; text: string }[] {
  if (!blockStr) return [];
  const steps: { type: string; text: string }[] = [];

  const intermediateMatches = [...blockStr.matchAll(/\[INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?([\s\S]*?)(?:\[\/INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?|$)/gi)];
  const blocksToProcess = intermediateMatches.length > 0 
    ? intermediateMatches.map(m => m[1]) 
    : [blockStr];

  for (const rawBlock of blocksToProcess) {
    const thinkParsed = parseThinkContent(rawBlock, thinkStartTag, thinkEndTag);
    const block = thinkParsed.mainText;
    if (!block) continue;

    const writes = parseWriteCommands(block).map(w => w.filePath);
    const edits = parseEditCommands(block).map(e => e.filePath);
    const reads = parseReadCommands(block).map(r => r.filePath);
    const globs = parseGlobCommands(block).map(g => g.path);
    const greps = parseGrepCommands(block).map(g => g.path);
    const deletes = parseDeleteCommands(block).map(d => d.filePath);
    const moves = parseMoveCommands(block).map(m => `${m.sourcePath} -> ${m.destinationPath}`);
    const diffs = parseGitDiffCommands(block).map(df => df.filePath);
    const checkouts = parseGitCheckoutCommands(block).map(co => co.filePath);
    const runCmdCmds = parseRunCmdCommands(block);
    const searches = extractAllSearchCommands(block).map(s => s.query);
    const fetches = extractAllFetchCommands(block).map(f => f.url);
    const imageSearches = extractAllImageSearchCommands(block).map(s => s.query);
    const mcpCalls = extractAllMcpCalls(block).map(m => `${m.server}.${m.tool}`);
    const weathers = extractWeatherCommands(block);
    const translates = extractTranslateCommands(block);
    const listHistories = extractAllListHistoryCommands(block).map(lh => `part ${lh.part}`);
    const seeHistories = extractAllSeeHistoryCommands(block).map(sh => `turns: ${sh.turnNumbers.join(', ')}`);
    const listKeywords = extractAllListKeywordsCommands(block).map(lk => `keywords: ${lk.keywords.join(', ')}`);
    const hasSkillsList = hasListSkillsCommand(block);
    const loadSkills = parseLoadSkillsCommands(block);
    const readDocsCmds = parseReadDocsCommands(block);
    const maps = extractShowMapCommands(block);

    writes.forEach(w => steps.push({ type: 'write', text: `Created file ${w}` }));
    edits.forEach(e => steps.push({ type: 'edit', text: `Edited file ${e}` }));
    reads.forEach(r => steps.push({ type: 'read', text: `Read file ${r}` }));
    readDocsCmds.forEach(rd => steps.push({ type: 'read', text: `Read doc ${rd.docName}` }));
    globs.forEach(g => steps.push({ type: 'glob', text: `Listed directory ${g}` }));
    greps.forEach(g => steps.push({ type: 'grep', text: `Searched inside files ${g}` }));
    deletes.forEach(d => steps.push({ type: 'delete', text: `Deleted file ${d}` }));
    moves.forEach(m => steps.push({ type: 'move', text: `Moved file ${m}` }));
    diffs.forEach(df => steps.push({ type: 'diff', text: `Checked git diff ${df}` }));
    checkouts.forEach(co => steps.push({ type: 'checkout', text: `Reverted file (git checkout) ${co}` }));
    runCmdCmds.forEach(c => steps.push({ type: 'run_cmd', text: `Executed: ${c.code.trim().slice(0, 45).replace(/\n/g, ' ')}${c.code.trim().length > 45 ? '...' : ''}` }));
    searches.forEach(s => steps.push({ type: 'search', text: `Searched the web: "${s}"` }));
    fetches.forEach(f => steps.push({ type: 'fetch', text: `Fetched URL ${f}` }));
    imageSearches.forEach(q => steps.push({ type: 'image_search', text: `Searched images: "${q}"` }));
    mcpCalls.forEach(m => steps.push({ type: 'mcp', text: `Called MCP ${m}` }));
    weathers.forEach(w => steps.push({ type: 'weather', text: `Fetched weather for ${w.location}` }));
    translates.forEach(t => steps.push({ type: 'translate', text: `Translated text: "${t.text.slice(0, 30)}..."` }));
    maps.forEach(m => steps.push({ type: 'map', text: `Rendered map: ${m.title || m.places.map(p => p.name).join(', ')}` }));
    listHistories.forEach(lh => steps.push({ type: 'history', text: `Read chat history (${lh})` }));
    seeHistories.forEach(sh => steps.push({ type: 'history', text: `Viewed chat turns (${sh})` }));
    listKeywords.forEach(lk => steps.push({ type: 'history', text: `Searched chat history (${lk})` }));
    if (hasSkillsList) {
      steps.push({ type: 'skill', text: 'Listed available skills' });
    }
    loadSkills.forEach(ls => {
      steps.push({ type: 'skill', text: `Loaded skill(s): ${ls.skillIds.join(', ')}` });
    });
  }

  return steps;
}

export const CommandLog: React.FC<Props> = ({
  text,
  thinkStartTag,
  thinkEndTag,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const steps = extractToolStepsFromText(text, thinkStartTag, thinkEndTag);

  if (steps.length === 0) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case 'write': return <FileCode size={14} className="mt-0.5 shrink-0" />;
      case 'edit': return <FileEdit size={14} className="mt-0.5 shrink-0" />;
      case 'read': return <SearchCode size={14} className="mt-0.5 shrink-0" />;
      case 'glob': return <Folder size={14} className="mt-0.5 shrink-0" />;
      case 'grep': return <SearchCode size={14} className="mt-0.5 shrink-0" />;
      case 'delete': return <Trash2 size={14} className="mt-0.5 shrink-0" />;
      case 'move': return <ArrowRightLeft size={14} className="mt-0.5 shrink-0" />;
      case 'diff': return <GitCompare size={14} className="mt-0.5 shrink-0" />;
      case 'checkout': return <RotateCcw size={14} className="mt-0.5 shrink-0" />;
      case 'run_cmd': return <Terminal size={14} className="mt-0.5 shrink-0" />;
      case 'search': return <Search size={14} className="mt-0.5 shrink-0" />;
      case 'fetch': return <Globe size={14} className="mt-0.5 shrink-0" />;
      case 'image_search': return <Search size={14} className="mt-0.5 shrink-0" />;
      case 'mcp': return <Terminal size={14} className="mt-0.5 shrink-0" />;
      case 'weather': return <Cloud size={14} className="mt-0.5 shrink-0" />;
      case 'translate': return <Languages size={14} className="mt-0.5 shrink-0" />;
      case 'map': return <Map size={14} className="mt-0.5 shrink-0" />;
      case 'history': return <History size={14} className="mt-0.5 shrink-0" />;
      case 'skill': return <BookOpen size={14} className="mt-0.5 shrink-0" />;
      default: return null;
    }
  };

  return (
    <div className="mb-4 flex flex-col gap-2 text-xs font-mono">
      <div className="border border-black dark:border-white">
        <div 
          className="flex items-center justify-between p-2 cursor-pointer hover:bg-white dark:hover:bg-black transition-colors select-none"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="font-bold flex items-center gap-2 uppercase tracking-wider">
            <RandomFontText text="TOOL LOGS" />
          </span>
          <span className="p-1">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </div>
        {expanded && (
          <div className="p-3 border-t border-black dark:border-white space-y-2 bg-white dark:bg-black overflow-hidden">
            {steps.map((step, i) => (
              <div key={`step-${i}`} className="flex items-start gap-2 font-bold">
                {getIcon(step.type)}
                <span className="truncate break-all">{step.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
