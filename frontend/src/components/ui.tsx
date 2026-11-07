import { useEffect, type CSSProperties, type ReactNode } from "react";

/* ---------------------------------------------------------------- pastilles */

export const chipStyle = (bg: string, fg: string, bd: string): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 7, fontSize: 12, fontWeight: 600,
  background: bg, color: fg, border: `1px solid ${bd}`, whiteSpace: "nowrap",
});

export function Chip({ bg, fg, bd, icon, children, title }: { bg: string; fg: string; bd: string; icon?: string; children: ReactNode; title?: string }) {
  return (
    <span data-badge="1" title={title} style={chipStyle(bg, fg, bd)}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

const TONS = {
  ok: ["var(--c-ok-bg)", "var(--c-ok-text)", "var(--c-ok-border)"],
  warn: ["var(--c-warn-bg)", "var(--c-warn-text)", "var(--c-warn-border)"],
  danger: ["var(--c-danger-bg)", "var(--c-danger-text)", "var(--c-danger-border)"],
  neutral: ["var(--c-neutral-bg)", "var(--c-neutral-text)", "var(--c-neutral-border)"],
  primary: ["var(--c-primary-soft)", "var(--c-primary-text)", "var(--c-primary-border)"],
  ia: ["var(--c-ia-bg)", "var(--c-ia-text)", "var(--c-ia-border)"],
} as const;
export type Ton = keyof typeof TONS;

export function Pastille({ ton, icon, children, title }: { ton: Ton; icon?: string; children: ReactNode; title?: string }) {
  const [bg, fg, bd] = TONS[ton];
  return <Chip bg={bg} fg={fg} bd={bd} icon={icon} title={title}>{children}</Chip>;
}

/** Codes couleur imposés du stock : En stock ● vert, Seuil bas ▲ orange, Rupture ■ rouge. */
export function StockChip({ statut }: { statut: string }) {
  if (statut === "Rupture") return <Pastille ton="danger" icon="■">Rupture</Pastille>;
  if (statut === "Seuil bas") return <Pastille ton="warn" icon="▲">Seuil bas</Pastille>;
  return <Pastille ton="ok" icon="●">En stock</Pastille>;
}

/** Confiance IA : ≥ 80 % haute (vert), 50 à 79 % moyenne (orange), < 50 % indéterminée (neutre) — jamais de rouge. */
export function niveauConfiance(score: number): "haute" | "moyenne" | "indéterminée" {
  return score >= 0.8 ? "haute" : score >= 0.5 ? "moyenne" : "indéterminée";
}
export function ConfianceChip({ score }: { score: number }) {
  const n = niveauConfiance(score);
  const p = `${Math.round(score * 100)} %`;
  if (n === "haute") return <Pastille ton="ok" icon="●">Confiance haute · {p}</Pastille>;
  if (n === "moyenne") return <Pastille ton="warn" icon="◐">Confiance moyenne · {p}</Pastille>;
  return <Pastille ton="neutral" icon="○">Confiance indéterminée · {p}</Pastille>;
}

export const STATUTS = [
  { key: "recu", label: "Reçu", icon: "●", ton: "primary" as Ton },
  { key: "en_diagnostic", label: "En diagnostic", icon: "◎", ton: "ia" as Ton },
  { key: "en_reparation", label: "En réparation", icon: "⚙", ton: "warn" as Ton },
  { key: "pret", label: "Prêt", icon: "✓", ton: "ok" as Ton },
  { key: "livre", label: "Livré", icon: "⤴", ton: "neutral" as Ton },
];
export const statutInfo = (key: string) => STATUTS.find((s) => s.key === key) ?? STATUTS[0];
export function StatutChip({ statut }: { statut: string }) {
  const s = statutInfo(statut);
  return <Pastille ton={s.ton} icon={s.icon}>{s.label}</Pastille>;
}

export function PrioriteChip({ priorite }: { priorite: string }) {
  const ton: Ton = priorite === "haute" ? "danger" : priorite === "basse" ? "neutral" : "primary";
  const [bg, fg, bd] = TONS[ton];
  return (
    <span data-badge="1" className="mono" style={{ ...chipStyle(bg, fg, bd), padding: "2px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: ".06em" }}>
      {priorite.toUpperCase()}
    </span>
  );
}

/* ---------------------------------------------------------------- blocs */

export function Section({ title, subtitle, actions, children, style, padding = 18 }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; style?: CSSProperties; padding?: number;
}) {
  return (
    <section className="card" style={{ padding, display: "flex", flexDirection: "column", gap: 14, minWidth: 0, ...style }}>
      {(title || actions) && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            {title && <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</h2>}
            {subtitle && <span data-muted="1" style={{ fontSize: 12, color: "var(--c-muted)" }}>{subtitle}</span>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ icon, label, value, hint, ton = "neutral", dark = false }: {
  icon: string; label: string; value: ReactNode; hint?: ReactNode; ton?: "up" | "down" | "neutral" | "alert"; dark?: boolean;
}) {
  const hintColor = ton === "up" ? "var(--c-ok-text)" : ton === "down" || ton === "alert" ? "var(--c-danger-text)" : "var(--c-muted)";
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, minHeight: 112, ...(dark ? { background: "var(--c-chrome)", color: "#fff", borderColor: "var(--c-chrome)" } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ fontSize: 14 }}>{icon}</span>
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".1em", color: dark ? "var(--c-chrome-muted)" : "var(--c-muted)" }}>{label}</span>
      </div>
      <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</span>
      {hint && <span data-tiny="1" style={{ fontSize: 12, fontWeight: 600, color: dark ? "var(--c-ok-on-dark)" : hintColor }}>{hint}</span>}
    </div>
  );
}

/** Contrôle segmenté (filtres de période, filtres Kanban…). */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "inline-flex", gap: 4, padding: 4, background: "var(--c-surface-5)", borderRadius: 11 }}>
      {options.map((o) => {
        const actif = o.value === value;
        return (
          <button key={o.value} role="radio" aria-checked={actif} onClick={() => onChange(o.value)}
            style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: actif ? 700 : 500, background: actif ? "#fff" : "transparent", color: actif ? "var(--c-text-2)" : "var(--c-text-8)", boxShadow: actif ? "var(--sh-seg)" : "none" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ titre, onClose, children, largeur = 520 }: { titre: string; onClose: () => void; children: ReactNode; largeur?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "oklch(0.22 0.02 255 / 0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
      <div role="dialog" aria-modal="true" aria-label={titre} className="card" style={{ width: largeur, maxHeight: "86vh", overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 16, boxShadow: "var(--sh-modal)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{titre}</h2>
          <button aria-label="Fermer" onClick={onClose} style={{ padding: "4px 8px", borderRadius: 8, fontSize: 16, color: "var(--c-muted)" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string | null; required?: boolean; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
      <span style={{ fontWeight: 600, color: "var(--c-text-4)" }}>
        {label}
        {required && <span style={{ color: "oklch(0.50 0.16 25)" }}> *</span>}
      </span>
      {children}
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--c-danger-strong)", fontWeight: 600 }}>{error}</span>
      ) : (
        hint && <span data-tiny="1" data-muted="1" style={{ fontSize: 11.5, color: "var(--c-muted)" }}>{hint}</span>
      )}
    </label>
  );
}

/** Message d'erreur métier renvoyé par l'API (422, 409…), affiché près de l'action. */
export function Alerte({ children, ton = "danger" }: { children: ReactNode; ton?: "danger" | "warn" | "ok" | "info" }) {
  const c = { danger: TONS.danger, warn: TONS.warn, ok: TONS.ok, info: TONS.primary }[ton];
  return (
    <div role={ton === "danger" ? "alert" : "status"} style={{ padding: "10px 13px", borderRadius: 10, background: c[0], color: c[1], border: `1px solid ${c[2]}`, fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

/** Jauge de stock : stock / (seuil × 1,6), couleur selon le statut. */
export function Jauge({ niveau, statut }: { niveau: number; statut: string }) {
  const couleur = statut === "Rupture" ? "var(--c-danger-solid)" : statut === "Seuil bas" ? "var(--c-warn-solid)" : "var(--c-ok-solid)";
  return (
    <div aria-hidden="true" style={{ height: 6, width: "100%", borderRadius: 99, background: "var(--c-surface-5)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(niveau * 100, statut === "Rupture" ? 0 : 4)}%`, background: couleur, borderRadius: 99 }} />
    </div>
  );
}

export const thStyle: CSSProperties = {
  textAlign: "left", padding: "11px 14px", fontFamily: "var(--f-mono)", fontSize: 10.5, fontWeight: 500, letterSpacing: ".08em",
  color: "var(--c-muted)", background: "var(--c-surface-3)", borderBottom: "1px solid var(--c-border-5)", whiteSpace: "nowrap",
};
export const tdStyle: CSSProperties = { padding: "12px 14px", borderBottom: "1px solid oklch(0.95 0.006 258)", fontSize: 13, verticalAlign: "middle" };
