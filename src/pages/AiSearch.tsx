import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppContext } from "../context/AppContext";
import { useContextMenu, ContextMenu } from "../components/ContextMenu";
import type { AiSearchResponse } from "../types";
import { EXT_COLOR, formatBytes, formatRelativeTime, openInExplorer, openPath } from "../utils";

const examples = [
  "the blender scene with moth in the name",
  "an unreal project I worked on recently",
  "files related to furniture references",
];

export default function AiSearch() {
  const { watchedPaths } = useAppContext();
  const { menu, open, close } = useContextMenu();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<AiSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(nextQuery = query) {
    const trimmed = nextQuery.trim();
    if (!trimmed || watchedPaths.length === 0 || searching) return;

    setQuery(trimmed);
    setSearching(true);
    setError(null);
    try {
      const result = await invoke<AiSearchResponse>("ai_search_files", {
        paths: watchedPaths,
        query: trimmed,
        limit: 40,
      });
      setResponse(result);
    } catch (e) {
      setError(String(e));
      setResponse(null);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-white">AI Search</h2>
        <p className="text-zinc-400 mt-1 text-sm">
          Ask for files across your watched paths. Local Ollama improves the search terms when it is running.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-5">
        <div className="flex items-start gap-3">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runSearch();
            }}
            placeholder="Example: I am looking for a Blender file with moth in the name"
            className="flex-1 min-h-28 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-blue-600 transition-colors resize-y"
          />
          <button
            onClick={() => runSearch()}
            disabled={searching || watchedPaths.length === 0 || query.trim().length === 0}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {examples.map((example) => (
            <button
              key={example}
              onClick={() => runSearch(example)}
              disabled={searching || watchedPaths.length === 0}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {example}
            </button>
          ))}
        </div>

        {watchedPaths.length === 0 && (
          <p className="text-xs text-yellow-500 mt-4">
            Add watched paths in Applications before using AI Search.
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-900 rounded-xl p-4 mb-5">
          <p className="text-sm text-red-300">Search failed: {error}</p>
        </div>
      )}

      {response && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-300">
              {response.results.length} result{response.results.length !== 1 ? "s" : ""} from {response.searched_files.toLocaleString()} files
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">
              {response.ollama_used ? "Ollama helped expand the search." : "Ollama was not available, so filename search was used."}
            </p>
          </div>
          {response.terms.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5 max-w-lg">
              {response.terms.slice(0, 10).map((term) => (
                <span key={term} className="px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
                  {term}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {searching && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-sm text-zinc-400 mb-3">Searching watched folders...</p>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-blue-500 h-1.5 rounded-full animate-pulse w-1/2" />
          </div>
        </div>
      )}

      {!searching && response && (
        <div className="flex flex-col gap-2">
          {response.results.map((result) => (
            <button
              key={result.path}
              onClick={() => openPath(result.path)}
              onContextMenu={(e) => open(e, [
                { label: "Open file location", icon: "folder", onClick: () => openInExplorer(result.path) },
              ])}
              className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl px-5 py-3.5 cursor-pointer transition-colors text-left"
            >
              <span className={`text-xs font-mono font-bold px-2 py-1 rounded-md w-16 text-center shrink-0 ${EXT_COLOR[result.ext] ?? "bg-zinc-800 text-zinc-400"}`}>
                .{result.ext || "file"}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-white truncate">{result.name}</p>
                  {result.app && (
                    <span className="text-xs text-blue-400 shrink-0">{result.app}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 font-mono truncate">{result.path}</p>
                <p className="text-xs text-zinc-600 mt-1">{result.reason}</p>
              </div>

              <div className="text-right shrink-0">
                <p className="text-xs text-zinc-400">{formatRelativeTime(result.last_modified)}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{formatBytes(result.size)}</p>
                <p className="text-xs text-zinc-700 mt-0.5">score {result.score}</p>
              </div>
            </button>
          ))}

          {response.results.length === 0 && (
            <div className="text-center py-16 text-zinc-600 text-sm">
              No related files found in your watched paths.
            </div>
          )}
        </div>
      )}

      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}
