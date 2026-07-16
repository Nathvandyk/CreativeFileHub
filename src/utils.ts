import { invoke } from "@tauri-apps/api/core";
import type { AppProfile } from "./types";

// Reveal a file (selected) or open a folder in the system file manager.
export function openInExplorer(path: string) {
  invoke("open_in_explorer", { path }).catch(() => {});
}

// Open a file or folder with its default Windows application.
export function openPath(path: string) {
  invoke("open_path", { path }).catch(() => {});
}

// Copy text to the clipboard (navigator API, with an execCommand fallback).
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i > 0 ? path.slice(0, i) : path;
}

// ── Theme ─────────────────────────────────────────────────────────────────────
export type Theme = "dark" | "light";

export function getStoredTheme(): Theme {
  try { return localStorage.getItem("theme") === "light" ? "light" : "dark"; } catch { return "dark"; }
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light");
}

export function setStoredTheme(theme: Theme) {
  try { localStorage.setItem("theme", theme); } catch { /* quota */ }
  applyTheme(theme);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

// Total active seconds per app, summed across all of that app's projects.
export function activeSecondsByApp(
  log: { app: string; active_seconds: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of log) out[e.app] = (out[e.app] ?? 0) + (e.active_seconds ?? 0);
  return out;
}

export function formatRelativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60)         return "Just now";
  if (diff < 3600)       return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 86400 * 2)  return "Yesterday";
  if (diff < 86400 * 7)  return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / (86400 * 7))} weeks ago`;
  return `${Math.floor(diff / (86400 * 30))} months ago`;
}

export const EXT_TO_APP: Record<string, string> = {
  blend: "Blender",
  uproject: "Unreal Engine", uasset: "Unreal Engine", umap: "Unreal Engine",
  sln: "Visual Studio", csproj: "Visual Studio", vcxproj: "Visual Studio",
  py: "Python",
  js: "VS Code", ts: "VS Code", tsx: "VS Code", jsx: "VS Code", mjs: "VS Code", cjs: "VS Code",
  rs: "VS Code", cpp: "VS Code", c: "VS Code", h: "VS Code", hpp: "VS Code", cs: "VS Code",
  java: "VS Code", go: "VS Code",
  psd: "Photoshop", psb: "Photoshop",
  ai: "Illustrator",
  xd: "Adobe XD",
  prproj: "Premiere Pro",
  aep: "After Effects",
  godot: "Godot", tscn: "Godot", tres: "Godot",
  unity: "Unity", prefab: "Unity",
};

export function extToApp(ext: string): string {
  return EXT_TO_APP[ext.toLowerCase()] ?? "";
}

const CODE_CATEGORIES = new Set(["Code Editor", "IDE", "Language"]);

// Derive ext -> app-name from the app profiles (the single source of truth), so
// every tracked app is attributed — not just the core few in EXT_TO_APP.
export function buildExtToApp(profiles: AppProfile[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of profiles) {
    for (const e of p.extensions) {
      const k = e.toLowerCase();
      if (!(k in map)) map[k] = p.name;
    }
  }
  return map;
}

// Derive ext -> "code" | "creative" from each app's profile category.
export function buildExtToType(profiles: AppProfile[]): Record<string, "code" | "creative"> {
  const map: Record<string, "code" | "creative"> = {};
  for (const p of profiles) {
    const type = CODE_CATEGORIES.has(p.category) ? "code" : "creative";
    for (const e of p.extensions) {
      const k = e.toLowerCase();
      if (!(k in map)) map[k] = type;
    }
  }
  return map;
}

export function extToType(ext: string): "code" | "creative" | "other" {
  const app = extToApp(ext);
  if (["Blender", "Unreal Engine", "Photoshop", "Illustrator", "Adobe XD",
       "Premiere Pro", "After Effects", "Godot", "Unity"].includes(app)) {
    return "creative";
  }
  if (["VS Code", "Visual Studio", "Python"].includes(app)) {
    return "code";
  }
  return "other";
}

export const EXT_COLOR: Record<string, string> = {
  py:      "bg-blue-900/40 text-blue-300",
  tsx:     "bg-cyan-900/40 text-cyan-300",
  ts:      "bg-cyan-900/40 text-cyan-300",
  js:      "bg-yellow-900/40 text-yellow-300",
  jsx:     "bg-cyan-900/40 text-cyan-300",
  rs:      "bg-orange-900/40 text-orange-300",
  cpp:     "bg-blue-900/40 text-blue-400",
  cs:      "bg-purple-900/40 text-purple-300",
  go:      "bg-teal-900/40 text-teal-300",
  sql:     "bg-orange-900/40 text-orange-300",
  blend:   "bg-orange-900/40 text-orange-400",
  umap:    "bg-purple-900/40 text-purple-300",
  uproject:"bg-purple-900/40 text-purple-300",
  uasset:  "bg-purple-900/40 text-purple-300",
  psd:     "bg-blue-900/40 text-blue-400",
  ai:      "bg-orange-900/40 text-orange-300",
  prproj:  "bg-pink-900/40 text-pink-300",
  aep:     "bg-pink-900/40 text-pink-400",
  godot:   "bg-teal-900/40 text-teal-300",
};
