import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, RunningApp, ActivityEntry, AppProfile, FileEntry } from "../types";

// Data that changes rarely (settings, profiles, scanned recent files). Consumers
// of this context do NOT re-render on the 5s live poll.
interface DataContextValue {
  trackedApps: string[];
  watchedPaths: string[];
  refreshTick: number;
  appProfiles: AppProfile[];
  recentFiles: FileEntry[];
  recentLoading: boolean;
  setTrackedApps: (apps: string[]) => void;
  setWatchedPaths: (paths: string[]) => void;
  triggerRefresh: () => void;
}

// Data that updates every few seconds (running apps + activity log). Only the
// pages that show live state subscribe to this.
interface LiveContextValue {
  runningApps: RunningApp[];
  activityLog: ActivityEntry[];
  clearActivityLog: () => void;
}

const DataContext = createContext<DataContextValue>({
  trackedApps: [],
  watchedPaths: [],
  refreshTick: 0,
  appProfiles: [],
  recentFiles: [],
  recentLoading: false,
  setTrackedApps: () => {},
  setWatchedPaths: () => {},
  triggerRefresh: () => {},
});

const LiveContext = createContext<LiveContextValue>({
  runningApps: [],
  activityLog: [],
  clearActivityLog: () => {},
});

function sameRunning(a: RunningApp[], b: RunningApp[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].app !== b[i].app || a[i].project_path !== b[i].project_path) return false;
  }
  return true;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [trackedApps, setTrackedAppsState] = useState<string[]>([
    "Blender", "Unreal Engine", "VS Code", "Visual Studio",
  ]);
  const [watchedPaths, setWatchedPathsState] = useState<string[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [appProfiles, setAppProfiles] = useState<AppProfile[]>([]);
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [runningApps, setRunningApps] = useState<RunningApp[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);

  // One-time: settings + the app knowledge base.
  useEffect(() => {
    invoke<AppSettings>("load_settings")
      .then((s) => { setTrackedAppsState(s.tracked_apps); setWatchedPathsState(s.watched_paths); })
      .catch(() => {});
    invoke<AppProfile[]>("get_app_profiles").then(setAppProfiles).catch(() => {});
  }, []);

  // Recent files are scanned once here and shared by every page (so switching
  // tabs doesn't trigger a fresh whole-drive scan each time).
  useEffect(() => {
    if (watchedPaths.length === 0) { setRecentFiles([]); return; }
    setRecentLoading(true);
    invoke<FileEntry[]>("get_recent_files", { paths: watchedPaths, limit: 200 })
      .then(setRecentFiles)
      .catch(() => {})
      .finally(() => setRecentLoading(false));
  }, [watchedPaths, refreshTick]);

  // Single 5s poller for running apps + activity log.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const running = await invoke<RunningApp[]>("poll_activity");
        if (cancelled) return;
        running.sort((a, b) => a.app.localeCompare(b.app));
        setRunningApps((prev) => (sameRunning(prev, running) ? prev : running));
        const log = await invoke<ActivityEntry[]>("get_activity_log");
        if (!cancelled) setActivityLog(log);
      } catch { /* ignore */ }
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  function persist(apps: string[], paths: string[]) {
    invoke("save_settings", { settings: { tracked_apps: apps, watched_paths: paths } }).catch(() => {});
  }
  function setTrackedApps(apps: string[]) { setTrackedAppsState(apps); persist(apps, watchedPaths); }
  function setWatchedPaths(paths: string[]) { setWatchedPathsState(paths); persist(trackedApps, paths); }
  function triggerRefresh() { setRefreshTick((t) => t + 1); }
  function clearActivityLog() { invoke("clear_activity_log").then(() => setActivityLog([])).catch(() => {}); }

  // Memoised so the live poll (runningApps/activityLog) doesn't churn data consumers.
  const dataValue = useMemo<DataContextValue>(() => ({
    trackedApps, watchedPaths, refreshTick, appProfiles, recentFiles, recentLoading,
    setTrackedApps, setWatchedPaths, triggerRefresh,
  }), [trackedApps, watchedPaths, refreshTick, appProfiles, recentFiles, recentLoading]);

  const liveValue = useMemo<LiveContextValue>(() => ({
    runningApps, activityLog, clearActivityLog,
  }), [runningApps, activityLog]);

  return (
    <DataContext.Provider value={dataValue}>
      <LiveContext.Provider value={liveValue}>
        {children}
      </LiveContext.Provider>
    </DataContext.Provider>
  );
}

export const useAppContext = () => useContext(DataContext);
export const useLive = () => useContext(LiveContext);
