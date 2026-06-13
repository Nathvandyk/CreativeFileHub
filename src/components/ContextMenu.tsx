import { useState, useEffect } from "react";

export type MenuItem = { label: string; icon?: string; onClick: () => void };
type MenuState = { x: number; y: number; items: MenuItem[] } | null;

// Small reusable right-click menu. Usage:
//   const { menu, open, close } = useContextMenu();
//   <div onContextMenu={(e) => open(e, [{ label, onClick }])} />
//   <ContextMenu menu={menu} onClose={close} />
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState>(null);
  function open(e: React.MouseEvent, items: MenuItem[]) {
    e.preventDefault();
    e.stopPropagation(); // don't let the global listener immediately close it
    setMenu({ x: e.clientX, y: e.clientY, items });
  }
  function close() { setMenu(null); }
  return { menu, open, close };
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  useEffect(() => {
    if (!menu) return;
    const dismiss = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("click", dismiss);
    window.addEventListener("contextmenu", dismiss);
    window.addEventListener("blur", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("contextmenu", dismiss);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const x = Math.min(menu.x, window.innerWidth - 230);
  const y = Math.min(menu.y, window.innerHeight - (menu.items.length * 38 + 12));

  return (
    <div
      className="fixed z-50 min-w-[210px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1"
      style={{ top: Math.max(8, y), left: Math.max(8, x) }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
        >
          {item.icon && <span className="text-sm">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}
