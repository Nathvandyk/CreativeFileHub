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
