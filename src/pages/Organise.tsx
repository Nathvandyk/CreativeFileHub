import { useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status   = "active" | "wip" | "archived";
type Category = "creative" | "code" | "university" | "family" | "work" | "games" | "misc";

type Folder = {
  id: string;
  name: string;
  app: string;
  appIcon: string;
  path: string;
  size: string;
  files: number;
  status: Status;
  category: Category;
  modified: string;
};

type Drive = {
  letter: string;
  name: string;
  total: string;
  used: string;
  pct: number;
  folders: Folder[];
};

type Move = {
  id: string;
  folder: Folder;
  fromDrive: string;
  toDrive: string;
};

// ─── Mock Data ────────────────────────────────────────────────────────────────

const initialDrives: Drive[] = [
  {
    letter: "C:\\", name: "System Drive", total: "512 GB", used: "310 GB", pct: 60,
    folders: [
      { id:"c1", name:"character_projects", app:"Blender",       appIcon:"🟠", path:"C:\\Users\\nathv\\Blender",        size:"2.4 GB",  files:12, status:"active",   category:"creative",    modified:"2 days ago"   },
      { id:"c2", name:"shooter_game",       app:"Unreal Engine", appIcon:"🎮", path:"C:\\UnrealProjects\\ShooterGame",  size:"18 GB",   files:340,status:"wip",      category:"creative",    modified:"3 hrs ago"    },
      { id:"c3", name:"sem1_assignments",   app:"VS Code",       appIcon:"💙", path:"C:\\Users\\nathv\\Uni\\sem1",      size:"120 MB",  files:34, status:"archived",  category:"university",  modified:"8 months ago" },
      { id:"c4", name:"sem2_assignments",   app:"VS Code",       appIcon:"💙", path:"C:\\Users\\nathv\\Uni\\sem2",      size:"340 MB",  files:67, status:"archived",  category:"university",  modified:"4 months ago" },
      { id:"c5", name:"family_photos_2022", app:"Explorer",      appIcon:"📁", path:"C:\\Users\\nathv\\Pictures\\2022", size:"8.2 GB",  files:920,status:"archived",  category:"family",      modified:"1 year ago"   },
    ],
  },
  {
    letter: "D:\\", name: "Data Drive", total: "1 TB", used: "420 GB", pct: 42,
    folders: [
      { id:"d1", name:"blender_old_scenes", app:"Blender",       appIcon:"🟠", path:"D:\\Creative\\Blender\\old",       size:"6.1 GB",  files:28, status:"archived",  category:"creative",    modified:"6 months ago" },
      { id:"d2", name:"premiere_edits",     app:"Premiere Pro",  appIcon:"🎬", path:"D:\\Videos\\Premiere",             size:"34 GB",   files:56, status:"wip",       category:"creative",    modified:"1 week ago"   },
      { id:"d3", name:"client_invoices",    app:"Explorer",      appIcon:"📁", path:"D:\\Work\\Invoices",               size:"24 MB",   files:88, status:"active",    category:"work",        modified:"Yesterday"    },
      { id:"d4", name:"steamapps",          app:"Steam",         appIcon:"🎮", path:"D:\\Steam\\steamapps",             size:"210 GB",  files:12400,status:"active",  category:"games",       modified:"Today"        },
      { id:"d5", name:"sem3_project",       app:"VS Code",       appIcon:"💙", path:"D:\\Uni\\sem3",                    size:"560 MB",  files:120,status:"wip",       category:"university",  modified:"2 days ago"   },
    ],
  },
  {
    letter: "F:\\", name: "Documents", total: "2 TB", used: "800 GB", pct: 40,
    folders: [
      { id:"f1", name:"blender_wip",        app:"Blender",       appIcon:"🟠", path:"F:\\Creative\\Blender\\wip",       size:"4.8 GB",  files:19, status:"wip",       category:"creative",    modified:"5 hrs ago"    },
      { id:"f2", name:"api_server",         app:"VS Code",       appIcon:"💙", path:"F:\\Projects\\api-server",         size:"44 MB",   files:210,status:"active",    category:"code",        modified:"8 mins ago"   },
      { id:"f3", name:"file_management",    app:"VS Code",       appIcon:"💙", path:"F:\\documents\\Visual Studio\\file_management", size:"12 MB", files:48, status:"active", category:"code", modified:"Just now" },
      { id:"f4", name:"holiday_2023",       app:"Explorer",      appIcon:"📁", path:"F:\\Family\\Holidays\\2023",       size:"14 GB",   files:1240,status:"archived", category:"family",      modified:"10 months ago"},
      { id:"f5", name:"after_effects_proj", app:"After Effects", appIcon:"🎞️", path:"F:\\Creative\\AE",                 size:"22 GB",   files:34, status:"wip",       category:"creative",    modified:"3 days ago"   },
    ],
  },
];

// ─── Style maps ───────────────────────────────────────────────────────────────

const statusStyle: Record<Status, string> = {
  active:   "bg-green-900/40  text-green-400",
  wip:      "bg-yellow-900/40 text-yellow-400",
  archived: "bg-zinc-800      text-zinc-500",
};

const categoryStyle: Record<Category, string> = {
  creative:   "bg-orange-900/30 text-orange-400",
  code:       "bg-blue-900/30   text-blue-400",
  university: "bg-purple-900/30 text-purple-400",
  family:     "bg-pink-900/30   text-pink-400",
  work:       "bg-cyan-900/30   text-cyan-400",
  games:      "bg-green-900/30  text-green-400",
  misc:       "bg-zinc-800      text-zinc-500",
};

const driveBarColor = ["bg-blue-500", "bg-purple-500", "bg-orange-500"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Organise() {
  const [drives]              = useState<Drive[]>(initialDrives);
  const [moves, setMoves]     = useState<Move[]>([]);
  const [dragging, setDragging] = useState<{ folder: Folder; fromDrive: string } | null>(null);
  const [overDrive, setOverDrive] = useState<string | null>(null);
  const [filter, setFilter]   = useState<Category | "all">("all");
  const dragFolder = useRef<{ folder: Folder; fromDrive: string } | null>(null);

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function onDragStart(folder: Folder, driveLetter: string) {
    dragFolder.current = { folder, fromDrive: driveLetter };
    setDragging({ folder, fromDrive: driveLetter });
  }

  function onDragOver(e: React.DragEvent, driveLetter: string) {
    e.preventDefault();
    setOverDrive(driveLetter);
  }

  function onDrop(e: React.DragEvent, targetDrive: string) {
    e.preventDefault();
    const drag = dragFolder.current;
    if (!drag || drag.fromDrive === targetDrive) {
      setDragging(null);
      setOverDrive(null);
      return;
    }

    // Add to move plan if not already queued
    const alreadyQueued = moves.some((m) => m.folder.id === drag.folder.id);
    if (!alreadyQueued) {
      setMoves((prev) => [...prev, {
        id: `${drag.folder.id}->${targetDrive}`,
        folder: drag.folder,
        fromDrive: drag.fromDrive,
        toDrive: targetDrive,
      }]);
    }

    setDragging(null);
    setOverDrive(null);
    dragFolder.current = null;
  }

  function onDragEnd() {
    setDragging(null);
    setOverDrive(null);
  }

  function removeMove(moveId: string) {
    setMoves((prev) => prev.filter((m) => m.id !== moveId));
  }

  function executeAll() {
    // Will call Rust backend later — for now just clear the queue
    setMoves([]);
  }

  // ── Filter ─────────────────────────────────────────────────────────────────

  const categories: (Category | "all")[] = ["all", "creative", "code", "university", "family", "work", "games"];

  function visibleFolders(folders: Folder[]) {
    return filter === "all" ? folders : folders.filter((f) => f.category === filter);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Organise</h2>
          <p className="text-zinc-400 mt-1 text-sm">Drag folders between drives to build your move plan</p>
        </div>
        {moves.length > 0 && (
          <button
            onClick={executeAll}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Execute {moves.length} move{moves.length > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              filter === c ? "bg-blue-600 text-white" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Drive columns + move plan */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Drive columns */}
        {drives.map((drive, di) => (
          <div
            key={drive.letter}
            onDragOver={(e) => onDragOver(e, drive.letter)}
            onDrop={(e) => onDrop(e, drive.letter)}
            onDragLeave={() => setOverDrive(null)}
            className={`flex flex-col flex-1 bg-zinc-900 border rounded-xl overflow-hidden transition-colors ${
              overDrive === drive.letter && dragging?.fromDrive !== drive.letter
                ? "border-blue-500 bg-blue-950/20"
                : "border-zinc-800"
            }`}
          >
            {/* Drive header */}
            <div className="px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-white">{drive.letter}</p>
                  <p className="text-xs text-zinc-500">{drive.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-400">{drive.used}</p>
                  <p className="text-xs text-zinc-600">of {drive.total}</p>
                </div>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1">
                <div className={`${driveBarColor[di]} h-1 rounded-full`} style={{ width: `${drive.pct}%` }} />
              </div>
            </div>

            {/* Drop hint */}
            {overDrive === drive.letter && dragging?.fromDrive !== drive.letter && (
              <div className="mx-3 mt-3 border-2 border-dashed border-blue-500/50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-400">Drop to move here</p>
              </div>
            )}

            {/* Folder cards */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {visibleFolders(drive.folders).map((folder) => {
                const isQueued  = moves.some((m) => m.folder.id === folder.id);
                const isDragged = dragging?.folder.id === folder.id;

                return (
                  <div
                    key={folder.id}
                    draggable
                    onDragStart={() => onDragStart(folder, drive.letter)}
                    onDragEnd={onDragEnd}
                    className={`bg-zinc-800 border rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all select-none ${
                      isDragged  ? "opacity-40 border-zinc-600" :
                      isQueued   ? "border-blue-700 opacity-60" :
                                   "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    {/* App + status row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{folder.appIcon}</span>
                        <span className="text-xs text-zinc-400">{folder.app}</span>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusStyle[folder.status]}`}>
                        {folder.status}
                      </span>
                    </div>

                    {/* Folder name */}
                    <p className="text-xs font-semibold text-white mb-1 truncate">{folder.name}</p>

                    {/* Category + size */}
                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${categoryStyle[folder.category]}`}>
                        {folder.category}
                      </span>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">{folder.size}</p>
                        <p className="text-xs text-zinc-600">{folder.files} files</p>
                      </div>
                    </div>

                    {isQueued && (
                      <p className="text-xs text-blue-400 mt-2">↗ Queued for move</p>
                    )}
                  </div>
                );
              })}

              {visibleFolders(drive.folders).length === 0 && (
                <div className="text-center py-8 text-zinc-700 text-xs">No folders in this category</div>
              )}
            </div>
          </div>
        ))}

        {/* Move plan panel */}
        <div className="w-64 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-semibold text-white">Move Plan</p>
            <p className="text-xs text-zinc-500 mt-0.5">{moves.length} move{moves.length !== 1 ? "s" : ""} queued</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {moves.length === 0 && (
              <div className="text-center py-12 text-zinc-700 text-xs px-4 leading-relaxed">
                Drag a folder card from one drive column and drop it onto another to queue a move
              </div>
            )}

            {moves.map((move) => (
              <div key={move.id} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold text-white truncate">{move.folder.name}</p>
                  <button
                    onClick={() => removeMove(move.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors text-xs shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-zinc-500 truncate">{move.fromDrive}</span>
                  <span className="text-blue-500 shrink-0">→</span>
                  <span className="text-zinc-300 shrink-0">{move.toDrive}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${categoryStyle[move.folder.category]}`}>
                    {move.folder.category}
                  </span>
                  <span className="text-xs text-zinc-500">{move.folder.size}</span>
                </div>
              </div>
            ))}
          </div>

          {moves.length > 0 && (
            <div className="p-3 border-t border-zinc-800 flex flex-col gap-2">
              <button
                onClick={executeAll}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Execute All Moves
              </button>
              <button
                onClick={() => setMoves([])}
                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors"
              >
                Clear Plan
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
