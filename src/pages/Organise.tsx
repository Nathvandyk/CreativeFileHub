import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useContextMenu, ContextMenu } from "../components/ContextMenu";
import type { DirItem } from "../types";
import { formatBytes, formatRelativeTime, openInExplorer } from "../utils";

type Status = "in_progress" | "done";

type Panel = {
  id: string;
  path: string;
  status: Status;
};

const STORAGE_KEY = "organise.panels";

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return i >= 0 ? p.slice(i + 1) : p;
}

function loadPanels(): Panel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Panel[]) : [];
  } catch {
    return [];
  }
}

const STATUS_LABEL: Record<Status, string> = { in_progress: "In Progress", done: "Done" };
const STATUS_STYLE: Record<Status, string> = {
  in_progress: "bg-amber-900/30 text-amber-400 border-amber-800",
  done: "bg-green-900/30 text-green-400 border-green-800",
};

export default function Organise() {
  const { menu, open, close } = useContextMenu();
  const [panels, setPanels] = useState<Panel[]>(loadPanels);
  const [items, setItems]   = useState<Record<string, DirItem[]>>({});
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [overPanel, setOverPanel] = useState<string | null>(null);
  const [moving, setMoving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState<{ item: DirItem; from: Panel; to: Panel } | null>(null);
  const drag = useRef<{ item: DirItem; from: Panel } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(panels)); } catch { /* quota */ }
  }, [panels]);

  // Refresh every panel's active state + items on change, and poll for drives
  // being connected/disconnected.
  useEffect(() => {
    let cancelled = false;
    async function refreshAll() {
      for (const panel of panels) {
        try {
          const act = await invoke<boolean>("is_path_active", { path: panel.path });
          if (cancelled) return;
          setActive((prev) => ({ ...prev, [panel.id]: act }));
          const its = act ? await invoke<DirItem[]>("list_dir_items", { path: panel.path }) : [];
          if (!cancelled) setItems((prev) => ({ ...prev, [panel.id]: its }));
        } catch { /* ignore */ }
      }
    }
    refreshAll();
    const id = setInterval(refreshAll, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, [panels]);

  async function refreshPanel(panel: Panel) {
    try {
      const act = await invoke<boolean>("is_path_active", { path: panel.path });
      setActive((p) => ({ ...p, [panel.id]: act }));
      const its = act ? await invoke<DirItem[]>("list_dir_items", { path: panel.path }) : [];
      setItems((p) => ({ ...p, [panel.id]: its }));
    } catch { /* ignore */ }
  }

  async function addPanel() {
    const selected = await openDialog({ directory: true, multiple: false, title: "Choose a folder for this panel" });
    if (typeof selected !== "string") return;
    const id = (crypto.randomUUID?.() ?? String(Date.now()));
    if (panels.some((p) => p.path.toLowerCase() === selected.toLowerCase())) return;
    setPanels((prev) => [...prev, { id, path: selected, status: "in_progress" }]);
  }

  function removePanel(id: string) {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  }

  function setStatus(id: string, status: Status) {
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  function onDrop(to: Panel) {
    setOverPanel(null);
    const d = drag.current;
    drag.current = null;
    if (!d || d.from.id === to.id) return;
    if (!active[to.id]) {
      setError("That folder is not available (drive disconnected?).");
      return;
    }
    setConfirmMove({ item: d.item, from: d.from, to });
  }

  async function executeMove() {
    if (!confirmMove) return;
    const { item, from, to } = confirmMove;
    setMoving(true);
    setError(null);
    try {
      await invoke<string>("move_item", { src: item.path, destDir: to.path });
      await refreshPanel(from);
      await refreshPanel(to);
      setConfirmMove(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">Organise</h2>
          <p className="text-zinc-400 mt-1 text-sm">
            Add a panel per folder, then drag a project from one to another to move it on disk
          </p>
        </div>
        <button
          onClick={addPanel}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          + Add Panel
        </button>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-900 rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-xs">✕</button>
        </div>
      )}

      {panels.length === 0 ? (
        <div className="text-center py-20 text-zinc-600 text-sm">
          No panels yet. Click <span className="text-zinc-400">+ Add Panel</span> and choose a folder
          (e.g. your Blender projects folder) to get started.
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {panels.map((panel) => {
            const isActive  = active[panel.id] ?? false;
            const panelItems = items[panel.id] ?? [];
            const isOver = overPanel === panel.id && drag.current !== null && drag.current.from.id !== panel.id;
            return (
              <div
                key={panel.id}
                onDragOver={(e) => { e.preventDefault(); setOverPanel(panel.id); }}
                onDragLeave={() => setOverPanel((cur) => (cur === panel.id ? null : cur))}
                onDrop={() => onDrop(panel)}
                className={`flex flex-col bg-zinc-900 border rounded-xl overflow-hidden transition-colors ${
                  isOver ? "border-blue-500 bg-blue-950/10" : "border-zinc-800"
                }`}
              >
                {/* Header */}
                <div className="px-4 py-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? "bg-green-400" : "bg-red-500"}`} />
                    <span className="text-sm font-semibold text-white truncate flex-1" title={panel.path}>
                      {baseName(panel.path) || panel.path}
                    </span>
                    <button
                      onClick={() => refreshPanel(panel)}
                      className="text-zinc-500 hover:text-zinc-200 text-xs"
                      title="Refresh"
                    >
                      ⟳
                    </button>
                    <button
                      onClick={() => removePanel(panel.id)}
                      className="text-zinc-500 hover:text-red-400 text-xs"
                      title="Remove panel"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs text-zinc-600 font-mono truncate mb-2">{panel.path}</p>
                  <div className="flex gap-1">
                    {(["in_progress", "done"] as Status[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(panel.id, s)}
                        className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                          panel.status === s ? STATUS_STYLE[s] : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                    <span className="ml-auto text-xs text-zinc-600 self-center">
                      {isActive ? `${panelItems.length} items` : "not connected"}
                    </span>
                  </div>
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 max-h-[420px] min-h-[120px]">
                  {!isActive && (
                    <div className="text-center py-10 text-xs text-red-400/80">
                      Folder not available — connect the drive
                    </div>
                  )}
                  {isActive && panelItems.length === 0 && (
                    <div className="text-center py-10 text-xs text-zinc-600">Empty folder</div>
                  )}
                  {isActive && panelItems.map((item) => (
                    <div
                      key={item.path}
                      draggable
                      onDragStart={() => { drag.current = { item, from: panel }; }}
                      onDragEnd={() => { drag.current = null; setOverPanel(null); }}
                      onContextMenu={(e) => open(e, [
                        { label: "Open file location", icon: "📂", onClick: () => openInExplorer(item.path) },
                      ])}
                      className="flex items-center gap-2 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing"
                    >
                      <span className="text-sm shrink-0">{item.is_dir ? "📁" : "📄"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white truncate">{item.name}</p>
                        <p className="text-xs text-zinc-600">
                          {item.is_dir ? "folder" : formatBytes(item.size)} · {formatRelativeTime(item.last_modified)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Move confirmation */}
      {confirmMove && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !moving && setConfirmMove(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-2">Move this item?</h3>
            <p className="text-xs text-zinc-400 mb-1">
              <span className="text-white font-medium">{confirmMove.item.name}</span>
            </p>
            <p className="text-xs text-zinc-500 font-mono mb-1">from {confirmMove.from.path}</p>
            <p className="text-xs text-zinc-500 font-mono mb-4">to {confirmMove.to.path}</p>
            <p className="text-xs text-amber-500/80 mb-4">
              This moves it on disk — it will no longer be in the original folder.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmMove(null)}
                disabled={moving}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeMove}
                disabled={moving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {moving ? "Moving…" : "Move"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}
