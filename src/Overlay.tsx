import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { DriveInfo, ActivityEntry } from "./types";
import { formatBytes, openInExplorer, copyToClipboard, parentDir } from "./utils";

const APP_ICON: Record<string, string> = {
  "Blender": "🟠", "Unreal Engine": "🎮", "VS Code": "💙", "Visual Studio": "🔵",
  "Python": "🐍", "Photoshop": "🖼️", "Illustrator": "✏️", "Premiere Pro": "🎬",
  "After Effects": "🎞️", "Godot": "🎯", "Unity": "⬛", "Houdini": "🟧",
  "Substance 3D Painter": "🖌️", "Maya": "🅼", "Cinema 4D": "🟪", "Nuke": "◼️",
};

export default function Overlay() {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [log, setLog]       = useState<ActivityEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await invoke<DriveInfo[]>("list_drives");
        if (!cancelled) setDrives(d);
        const l = await invoke<ActivityEntry[]>("get_activity_log");
        if (!cancelled) setLog(l);
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Recent project directories (deduped), used as copy-to-clipboard shortcuts.
  const shortcuts = (() => {
    const seen = new Set<string>();
    const out: { icon: string; name: string; dir: string }[] = [];
    for (const e of log) {
      if (!e.project_path) continue;
      const dir = parentDir(e.project_path);
      const key = dir.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ icon: APP_ICON[e.app] ?? "📦", name: e.project ?? e.app, dir });
      if (out.length >= 9) break;
    }
    return out;
  })();

  async function copyDir(dir: string) {
    if (await copyToClipboard(dir)) {
      setCopied(dir);
      setTimeout(() => setCopied((c) => (c === dir ? null : c)), 1500);
    }
  }

  return (
    <div className="h-screen w-screen p-2 text-zinc-100 font-sans select-none">
      <div className="h-full flex flex-col bg-zinc-900/95 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header — draggable */}
        <div
          data-tauri-drag-region
          className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 cursor-move"
        >
          <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none">
            <span className="text-sm">🗂️</span>
            <span className="text-sm font-semibold text-white">CreativeHub</span>
          </div>
          <button
            onClick={() => getCurrentWindow().hide()}
            className="text-zinc-500 hover:text-zinc-200 text-sm leading-none"
            title="Hide overlay"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
          {/* Shortcuts — click to copy the folder path */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Shortcuts</p>
            {shortcuts.length === 0 ? (
              <p className="text-xs text-zinc-600">No recent projects yet</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {shortcuts.map((s) => (
                  <button
                    key={s.dir}
                    onClick={() => copyDir(s.dir)}
                    onContextMenu={(e) => { e.preventDefault(); openInExplorer(s.dir); }}
                    title={`${s.dir}\n(click to copy · right-click to open)`}
                    className="relative flex flex-col items-center gap-1 bg-zinc-800/60 hover:bg-zinc-800 rounded-lg p-2 transition-colors"
                  >
                    <span className="text-xl">{s.icon}</span>
                    <span className="text-[10px] text-zinc-300 truncate w-full text-center">{s.name}</span>
                    {copied === s.dir && (
                      <span className="absolute inset-0 flex items-center justify-center bg-zinc-900/90 rounded-lg text-[10px] text-green-400 font-medium">
                        Copied ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-zinc-600 mt-1.5">Click to copy the folder path · right-click to open</p>
          </div>

          {/* Storage */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Storage</p>
            <div className="flex flex-col gap-2.5">
              {drives.length === 0 && <p className="text-xs text-zinc-600">No drives detected</p>}
              {drives.map((d) => {
                const used = d.total_bytes - d.free_bytes;
                const pct = d.total_bytes > 0 ? Math.round((used / d.total_bytes) * 100) : 0;
                return (
                  <div key={d.letter}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-zinc-300">{d.letter}</span>
                      <span className="text-xs text-zinc-500">{formatBytes(d.free_bytes)} free</span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${pct > 90 ? "bg-red-500" : "bg-blue-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
