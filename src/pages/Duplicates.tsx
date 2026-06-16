import { useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useAppContext } from "../context/AppContext";
import { useContextMenu, ContextMenu } from "../components/ContextMenu";
import type { DuplicateGroup, ScanProgress } from "../types";
import { formatBytes, formatRelativeTime, openInExplorer } from "../utils";

export default function Duplicates() {
  const { watchedPaths } = useAppContext();
  const { menu, open, close } = useContextMenu();
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [groups, setGroups]     = useState<DuplicateGroup[] | null>(null);

  async function deepScan() {
    if (watchedPaths.length === 0 || scanning) return;
    setScanning(true);
    setGroups(null);
    setProgress({ phase: "indexing", processed: 0, total: 0, current: "" });

    const onProgress = new Channel<ScanProgress>();
    onProgress.onmessage = (p) => setProgress(p);

    try {
      const result = await invoke<DuplicateGroup[]>("find_duplicates", { paths: watchedPaths, onProgress });
      setGroups(result);
    } catch (e) {
      console.error("Duplicate scan failed:", e);
      setGroups([]);
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }

  const totalWasted = groups?.reduce((s, g) => s + g.wasted, 0) ?? 0;
  const totalDupes  = groups?.reduce((s, g) => s + (g.count - 1), 0) ?? 0;
  const pct = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-white">Duplicates</h2>
          <p className="text-zinc-400 mt-1 text-sm">
            Deep scan compares full file contents to find exact duplicates
          </p>
        </div>
        <button
          onClick={deepScan}
          disabled={scanning || watchedPaths.length === 0}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {scanning ? "Scanning…" : "Deep Scan"}
        </button>
      </div>

      {watchedPaths.length === 0 && (
        <div className="text-center py-16 text-zinc-600 text-sm">
          Add watched paths in Applications before scanning for duplicates
        </div>
      )}

      {/* Progress */}
      {scanning && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-zinc-200">
              {progress?.phase === "hashing" ? "Hashing file contents…" : "Indexing files…"}
            </p>
            <p className="text-xs text-zinc-500">
              {progress?.phase === "hashing"
                ? `${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()}`
                : `${progress?.processed.toLocaleString() ?? 0} files found`}
            </p>
          </div>

          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            {progress?.phase === "hashing" ? (
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
            ) : (
              <div className="bg-blue-500 h-1.5 rounded-full animate-pulse w-1/3" />
            )}
          </div>

          {progress?.current && (
            <p className="text-xs text-zinc-600 font-mono truncate mt-3">{progress.current}</p>
          )}
        </div>
      )}

      {/* Results summary */}
      {!scanning && groups !== null && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Duplicate Sets</p>
              <p className="text-3xl font-bold text-white">{groups.length.toLocaleString()}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Redundant Files</p>
              <p className="text-3xl font-bold text-white">{totalDupes.toLocaleString()}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Reclaimable</p>
              <p className="text-3xl font-bold text-white">{formatBytes(totalWasted)}</p>
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="text-center py-16 text-zinc-600 text-sm">No duplicate files found 🎉</div>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((g, gi) => (
                <div key={gi} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
                    <p className="text-sm font-medium text-white">
                      {g.count} identical copies · {formatBytes(g.size)} each
                    </p>
                    <p className="text-xs text-yellow-500">{formatBytes(g.wasted)} reclaimable</p>
                  </div>
                  <div className="flex flex-col">
                    {g.files.map((f, fi) => (
                      <div
                        key={fi}
                        onContextMenu={(e) => open(e, [
                          { label: "Open file location", icon: "📂", onClick: () => openInExplorer(f.path) },
                        ])}
                        className="flex items-center justify-between px-5 py-2.5 hover:bg-zinc-800/50 transition-colors cursor-pointer border-b border-zinc-800/30 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{f.name}</p>
                          <p className="text-xs text-zinc-500 font-mono truncate mt-0.5">{f.path}</p>
                        </div>
                        <p className="text-xs text-zinc-500 shrink-0 ml-4">{formatRelativeTime(f.last_modified)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {groups.length >= 1000 && (
                <p className="text-center text-xs text-zinc-600 py-2">
                  Showing the 1000 largest duplicate sets.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}
