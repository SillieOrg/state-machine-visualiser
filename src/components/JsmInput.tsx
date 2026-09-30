'use client';
import { useRef } from 'react';
import { useStore } from '@/lib/store';
import type { JsmIssue } from '@/lib/jsm/validate';
import { useLibraryStore } from '@/lib/libraryStore';
import { ShareButton } from '@/components/ShareButton';
import { exportJSM } from '@/lib/jsm/export';

interface JsmInputProps {
  onToggleSidebar: () => void;
  onToggleFullscreen: () => void;
  fullscreenMode: boolean;
}

export function JsmInput({ onToggleSidebar, onToggleFullscreen, fullscreenMode }: JsmInputProps) {
  const input = useStore(s => s.input);
  const error = useStore(s => s.error);
  const issues = useStore(s => s.issues);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const setInput = useStore(s => s.setInput);
  const resetLayout = useStore(s => s.resetLayout);

  const { activeId, entries, isHydrated, setDrawerOpen } = useLibraryStore();
  const activeEntry = entries.find(e => e.id === activeId);

  // Hydrate on mount
  if (!isHydrated && typeof window !== 'undefined') {
    useLibraryStore.persist.rehydrate();
  }

  function highlightIssue(issue: JsmIssue) {
    const textarea = textareaRef.current;
    if (!textarea || issue.start === undefined) return;
    textarea.focus();
    textarea.setSelectionRange(issue.start, issue.end ?? issue.start);
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 16;
    const line = issue.line ?? 1;
    textarea.scrollTop = Math.max(0, (line - 1) * lineHeight - textarea.clientHeight / 3);
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2">
        <img src="/state-machine-visualiser/smv-mark.svg" alt="JSMV" width={22} height={22} className="h-[22px] w-[22px] shrink-0 rounded-md" />
        <h2 className="text-sm font-semibold text-zinc-700 truncate">
          {activeEntry ? activeEntry.name : 'New JSM'}
        </h2>

        {/* Sidebar and library controls */}
        <div className="flex items-center gap-1 ml-auto">
          {!fullscreenMode && (
            <button
              onClick={onToggleSidebar}
              className="p-1 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded transition-colors"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <button
            onClick={onToggleFullscreen}
            className="p-1 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded transition-colors"
            title={fullscreenMode ? 'Exit fullscreen' : 'Fullscreen edit mode'}
            aria-label={fullscreenMode ? 'Exit fullscreen' : 'Fullscreen edit mode'}
          >
            {fullscreenMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4m-4 0l5 5m11-5v4m0-4h-4m4 0l-5 5M4 20v-4m0 4h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            )}
          </button>

          <button
            onClick={() => setDrawerOpen(true)}
            className="text-xs text-zinc-500 hover:text-zinc-800 px-2 py-1 rounded hover:bg-zinc-100 transition-colors"
          >
            ☰ Library
          </button>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        aria-invalid={!!error}
        className="flex-1 resize-none rounded-md border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs text-zinc-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 aria-[invalid=true]:border-red-300 aria-[invalid=true]:selection:bg-red-200"
        placeholder='{ "start": "Pending", "states": [...] }'
        value={input}
        onChange={e => setInput(e.target.value)}
        spellCheck={false}
      />

      {error && (
        <ErrorPanel error={error} issues={issues} onSelect={highlightIssue} />
      )}

      <div className="flex gap-2">
        {isHydrated && (
          <>
            <button
              onClick={resetLayout}
              disabled={!activeEntry}
              className="flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset Layout
            </button>
            <ShareButton />
            <button
              onClick={() => activeEntry && exportJSM(activeEntry.name, activeEntry.raw)}
              disabled={!activeEntry}
              className="flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export ↓
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const MAX_VISIBLE_ISSUES = 20;

function ErrorPanel({
  error,
  issues,
  onSelect,
}: {
  error: string;
  issues: JsmIssue[];
  onSelect: (issue: JsmIssue) => void;
}) {
  if (issues.length === 0) {
    return (
      <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600 whitespace-pre-wrap">
        {error}
      </p>
    );
  }

  const visible = issues.slice(0, MAX_VISIBLE_ISSUES);
  const hidden = issues.length - visible.length;

  return (
    <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-xs max-h-56 overflow-y-auto">
      <div className="sticky top-0 bg-red-50 px-3 py-1.5 font-semibold text-red-700 border-b border-red-100">
        {issues.length === 1 ? '1 problem' : `${issues.length} problems`} found
      </div>
      <ul className="divide-y divide-red-100">
        {visible.map((issue, i) => {
          const clickable = issue.start !== undefined;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onSelect(issue)}
                className="w-full text-left px-3 py-1.5 flex gap-2 items-start hover:bg-red-100/60 disabled:hover:bg-transparent disabled:cursor-default transition-colors"
                title={clickable ? 'Show in editor' : undefined}
              >
                <span className="mt-px text-red-400" aria-hidden>●</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-red-700">{issue.message}</span>
                  <span className="block text-red-400 truncate">{issue.location}</span>
                </span>
                {issue.line !== undefined && (
                  <span className="shrink-0 font-mono text-[10px] text-red-500 bg-white/70 border border-red-200 rounded px-1">
                    Ln {issue.line}:{issue.column}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <div className="px-3 py-1.5 text-red-500 border-t border-red-100">…and {hidden} more</div>
      )}
    </div>
  );
}
