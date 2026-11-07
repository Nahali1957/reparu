import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Ton = "info" | "ok" | "erreur";
interface Toast { id: number; texte: string; ton: Ton }
const Ctx = createContext<(texte: string, ton?: Ton) => void>(() => {});

const COULEURS: Record<Ton, [string, string, string]> = {
  info: ["var(--c-chrome)", "#fff", "var(--c-chrome)"],
  ok: ["var(--c-ok-bg)", "var(--c-ok-text)", "var(--c-ok-border)"],
  erreur: ["var(--c-danger-bg)", "var(--c-danger-text)", "var(--c-danger-border)"],
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((texte: string, ton: Ton = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, texte, ton }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" style={{ position: "fixed", bottom: 20, right: 20, display: "flex", flexDirection: "column", gap: 8, zIndex: 100 }}>
        {toasts.map((t) => {
          const [bg, fg, bd] = COULEURS[t.ton];
          return (
            <div key={t.id} role="status" style={{ maxWidth: 420, padding: "11px 14px", borderRadius: 10, background: bg, color: fg, border: `1px solid ${bd}`, fontSize: 13, fontWeight: 600, boxShadow: "var(--sh-modal)" }}>
              {t.texte}
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
