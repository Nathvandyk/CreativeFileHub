import { useState } from "react";

type DupeGroup = {
  id: number;
  name: string;
  size: string;
  copies: { path: string; keep: boolean }[];
};

const initial: DupeGroup[] = [
  {
    id: 1, name: "holiday_photo.jpg", size: "4.2 MB",
    copies: [
      { path: "C:\\Users\\Photos\\holiday_photo.jpg",       keep: true  },
      { path: "D:\\Backup\\2024\\holiday_photo.jpg",        keep: false },
      { path: "F:\\Documents\\Misc\\holiday_photo.jpg",     keep: false },
    ],
  },
  {
    id: 2, name: "project_report.pdf", size: "1.8 MB",
    copies: [
      { path: "C:\\Users\\Documents\\project_report.pdf",   keep: true  },
      { path: "D:\\Work\\project_report.pdf",               keep: false },
    ],
  },
  {
    id: 3, name: "setup.exe", size: "88 MB",
    copies: [
      { path: "C:\\Downloads\\setup.exe",                   keep: true  },
      { path: "F:\\Installers\\setup.exe",                  keep: false },
    ],
  },
];

export default function Duplicates() {
  const [groups, setGroups] = useState(initial);

  function toggleKeep(groupId: number, copyIndex: number) {
    setGroups(groups.map((g) =>
      g.id !== groupId ? g : {
        ...g,
        copies: g.copies.map((c, i) => ({ ...c, keep: i === copyIndex })),
      }
    ));
  }

  const toDelete = groups.reduce((acc, g) => acc + g.copies.filter((c) => !c.keep).length, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-white">Duplicates</h2>
          <p className="text-zinc-400 mt-1 text-sm">{groups.length} groups found — select which copy to keep</p>
        </div>
        <button className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors">
          Remove {toDelete} files
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{g.name}</span>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{g.copies.length} copies</span>
              </div>
              <span className="text-xs text-zinc-400">{g.size} each</span>
            </div>

            {g.copies.map((c, i) => (
              <div
                key={i}
                onClick={() => toggleKeep(g.id, i)}
                className={`flex items-center justify-between px-5 py-3 cursor-pointer transition-colors
                  ${c.keep ? "bg-zinc-800/60" : "hover:bg-zinc-800/30"}`}
              >
                <span className="text-xs text-zinc-400 font-mono">{c.path}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  c.keep
                    ? "bg-green-900/50 text-green-400"
                    : "bg-red-900/30 text-red-400"
                }`}>
                  {c.keep ? "Keep" : "Delete"}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
