export interface DriveInfo {
  letter: string;
  name: string;
  total_bytes: number;
  free_bytes: number;
}

export interface FileEntry {
  path: string;
  name: string;
  size: number;
  is_dir: boolean;
  ext: string;
  last_modified: number;
  project_root?: string | null;
  project_name?: string | null;
}

export interface AppSettings {
  tracked_apps: string[];
  watched_paths: string[];
}

export interface DuplicateFile {
  path: string;
  name: string;
  size: number;
  last_modified: number;
}

export interface DuplicateGroup {
  size: number;
  count: number;
  wasted: number;
  files: DuplicateFile[];
}

export interface ScanProgress {
  phase: string; // "indexing" | "hashing" | "done"
  processed: number;
  total: number;
  current: string;
}

export interface AppProfile {
  name: string;
  icon: string;
  color: string;
  category: string;
  extensions: string[];
  structure: string;
  self_contained: boolean;
  root_marker_exts: string[];
  root_marker_files: string[];
  notes: string;
}

export interface RunningApp {
  app: string;
  project: string | null;
  project_path: string | null;
}

export interface ActivityEntry {
  app: string;
  project: string | null;
  project_path: string | null;
  first_seen: number;
  last_seen: number;
  sessions: number;
  active_seconds: number;
}
