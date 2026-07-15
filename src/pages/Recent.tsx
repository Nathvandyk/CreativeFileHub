import { useState } from "react";
import { useAppContext } from "../context/AppContext";
import { useContextMenu, ContextMenu } from "../components/ContextMenu";
import { formatBytes, formatRelativeTime, buildExtToApp, buildExtToType, EXT_COLOR, openInExplorer } from "../utils";

type Filter = "all" | "code" | "creative";

export default function Recent() {
  const { trackedApps, watchedPaths, appProfiles, recentFiles, recentLoading, triggerRefresh } = useAppContext();
  const { menu, open, close } = useContextMenu();
  const [filter, setFilter]     = useState<Filter>("all");
  const [search, setSearch]     = useState("");

  const files   = recentFiles;
  const loading = recentLoading;
  const extAppMap  = buildExtToApp(appProfiles);
  const extTypeMap = buildExtToType(appProfiles);

  const visible = files.filter((f) => {
    const app      = extAppMap[f.ext.toLowerCase()] ?? "";
    const type     = extTypeMap[f.ext.toLowerCase()] ?? "other";
    const inTracked = !app || trackedApps.includes(app);
    const inType   = filter === "all" || type === filter;
    const inSearch = !search ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.path.toLowerCase().includes(search.toLowerCase());
    return inTracked && inType && inSearch;
  });

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-white">Recent Files</h2>
          <p className="text-zinc-400 mt-1 text-sm">Files recently modified across your watched paths</p>
        </div>
        <button
          onClick={triggerRefresh}
          disabled={loading}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          {loading ? "Refreshing..." : "⟳ Refresh"}
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search files or paths..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-blue-600 transition-colors"
        />
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          {(["all", "code", "creative"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                filter === f ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && files.length === 0 && (
        <div className="text-center py-16 text-zinc-500 text-sm">Loading files...</div>
      )}

      {watchedPaths.length === 0 && files.length === 0 && (
        <div className="text-center py-16 text-zinc-600 text-sm">
          Add watched paths in Applications to see recent files
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          {visible.map((f, i) => (
            <div
              key={i}
              onContextMenu={(e) => open(e, [
                { label: "Open file location", icon: "📂", onClick: () => openInExplorer(f.path) },
              ])}
              className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl px-5 py-3.5 cursor-pointer transition-colors group"
            >
              <span className={`text-xs font-mono font-bold px-2 py-1 rounded-md w-16 text-center shrink-0 ${EXT_COLOR[f.ext] ?? "bg-zinc-800 text-zinc-400"}`}>
                .{f.ext || "—"}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{f.name}</p>
                <p className="text-xs text-zinc-500 font-mono truncate mt-0.5">{f.path}</p>
              </div>

              <span className="text-xs text-zinc-500 shrink-0 hidden group-hover:block">
                {extAppMap[f.ext.toLowerCase()] || "—"}
              </span>

              <div className="text-right shrink-0">
                <p className="text-xs text-zinc-400">{formatRelativeTime(f.last_modified)}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{formatBytes(f.size)}</p>
              </div>
            </div>
          ))}

          {visible.length === 0 && (
            <div className="text-center py-16 text-zinc-600 text-sm">No files match your search</div>
          )}
        </div>
      )}

      {!loading && watchedPaths.length > 0 && files.length === 0 && (
        <div className="text-center py-16 text-zinc-600 text-sm">No recent files found</div>
      )}

      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}
