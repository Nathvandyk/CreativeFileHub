import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DriveInfo, FileEntry } from "../types";
import { formatBytes } from "../utils";

export default function Scanner() {
  const [drives, setDrives]       = useState<DriveInfo[]>([]);
  const [scanning, setScanning]   = useState(false);
  const [results, setResults]     = useState<FileEntry[] | null>(null);
  const [selectedDrive, setSelectedDrive] = useState<string | null>(null);

  useEffect(() => {
    invoke<DriveInfo[]>("list_drives")
      .then((ds) => {
        setDrives(ds);
        if (ds.length > 0) setSelectedDrive(ds[0].letter);
      })
      .catch(() => {});
  }, []);

  async function startScan() {
    if (!selectedDrive) return;
    setScanning(true);
    setResults(null);
    try {
      const entries = await invoke<FileEntry[]>("scan_directory", {
        path: selectedDrive,
        maxDepth: 4,
      });
      setResults(entries);
    } finally {
      setScanning(false);
    }
  }

  const fileCount = results?.filter((e) => !e.is_dir).length ?? 0;
  const dirCount  = results?.filter((e) => e.is_dir).length ?? 0;
  const totalSize = results?.reduce((s, e) => s + e.size, 0) ?? 0;

  return (
    <div className="w-full">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-white">Scan Drives</h2>
        <p className="text-zinc-400 mt-1 text-sm">Select a drive to analyse and find files</p>
      </div>

      {/* Drive list */}
      <div className="flex flex-col gap-3 mb-6">
        {drives.length === 0 && (
          <p className="text-sm text-zinc-500">Loading drives...</p>
        )}
        {drives.map((d) => {
          const used = d.total_bytes - d.free_bytes;
          const pct  = d.total_bytes > 0 ? Math.round((used / d.total_bytes) * 100) : 0;
          const selected = selectedDrive === d.letter;
          return (
            <div
              key={d.letter}
              onClick={() => setSelectedDrive(d.letter)}
              className={`bg-zinc-900 border rounded-xl p-5 cursor-pointer transition-colors ${
                selected ? "border-blue-600" : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-zinc-800 rounded-lg flex items-center justify-center text-lg">💾</div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {d.letter}
                      {d.name ? ` — ${d.name}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatBytes(used)} used of {formatBytes(d.total_bytes)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{pct}%</span>
                  {selected && <span className="text-xs text-blue-400 font-medium">Selected</span>}
                </div>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Scan button */}
      <button
        onClick={startScan}
        disabled={scanning || !selectedDrive}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-xl transition-colors mb-6"
      >
        {scanning
          ? `Scanning ${selectedDrive ?? ""}...`
          : results !== null
          ? "Scan Again"
          : `Scan ${selectedDrive ?? "drive"}`}
      </button>

      {scanning && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
          <p className="text-sm text-zinc-400 mb-2">Scanning files...</p>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-blue-500 h-1.5 rounded-full animate-pulse w-2/3" />
          </div>
        </div>
      )}

      {results !== null && !scanning && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-sm font-medium text-green-400 mb-3">Scan complete</p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Files</p>
              <p className="text-xl font-bold text-white">{fileCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Folders</p>
              <p className="text-xl font-bold text-white">{dirCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Total Size</p>
              <p className="text-xl font-bold text-white">{formatBytes(totalSize)}</p>
            </div>
          </div>
          <p className="text-xs text-zinc-500">Navigate to Duplicates or Organise to review results</p>
        </div>
      )}
    </div>
  );
}
