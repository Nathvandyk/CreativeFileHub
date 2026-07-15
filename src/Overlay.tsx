import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { DriveInfo, ActivityEntry } from "./types";
import { formatBytes, formatRelativeTime, openInExplorer } from "./utils";

const APP_ICON: Record<string, string> = {
  "Blender": "🟠", "Unreal Engine": "🎮", "VS Code": "💙", "Visual Studio": "🔵",
  "Python": "🐍", "Photoshop": "🖼️", "Illustrator": "✏️", "Premiere Pro": "🎬",
  "After Effects": "🎞️", "Godot": "🎯", "Unity": "⬛", "Houdini": "🟧",
  "Substance 3D Painter": "🖌️", "Maya": "🅼", "Cinema 4D": "🟪", "Nuke": "◼️",
};

export default function Overlay() {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [log, setLog]       = useState<ActivityEntry[]>([]);

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

  const recent = log.slice(0, 6);

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
          {/* Recent projects */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Recent Projects</p>
            <div className="flex flex-col gap-1.5">
              {recent.length === 0 && <p className="text-xs text-zinc-600">No activity yet</p>}
              {recent.map((e, i) => (
                <div
                  key={i}
                  onClick={() => e.project_path && openInExplorer(e.project_path)}
                  className="flex items-center gap-2 bg-zinc-800/60 hover:bg-zinc-800 rounded-lg px-3 py-2 cursor-pointer transition-colors"
                  title={e.project_path ?? ""}
                >
                  <span className="text-sm shrink-0">{APP_ICON[e.app] ?? "📦"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate">{e.project ?? e.app}</p>
                    {e.project && <p className="text-xs text-zinc-500 truncate">{e.app}</p>}
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0">{formatRelativeTime(e.last_seen)}</span>
                </div>
              ))}
            </div>
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
