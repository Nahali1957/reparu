import type { CSSProperties, ReactNode } from "react";

/** Palettes de la maquette (Repar-Stocks) : vert, orange, rouge, neutre, teal (IA / capteur). */
export interface Palette { bg: string; fg: string; bd: string }
export const GREEN: Palette = { bg: "oklch(0.965 0.03 152)", fg: "oklch(0.36 0.10 152)", bd: "oklch(0.84 0.06 152)" };
export const ORANGE: Palette = { bg: "oklch(0.965 0.05 70)", fg: "oklch(0.42 0.11 62)", bd: "oklch(0.86 0.09 70)" };
export const RED: Palette = { bg: "oklch(0.96 0.04 25)", fg: "oklch(0.42 0.15 25)", bd: "oklch(0.86 0.08 25)" };
export const NEUTRAL: Palette = { bg: "oklch(0.96 0.005 258)", fg: "oklch(0.42 0.02 255)", bd: "oklch(0.90 0.008 258)" };
export const TEAL: Palette = { bg: "oklch(0.965 0.025 195)", fg: "oklch(0.36 0.08 195)", bd: "oklch(0.88 0.04 195)" };

export const badgeStyle = (m: Palette, size: "s" | "m" = "s"): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 5, padding: size === "s" ? "2px 7px" : "4px 9px", borderRadius: 7,
  fontSize: size === "s" ? 10.5 : 11.5, fontWeight: 700, whiteSpace: "nowrap", background: m.bg, color: m.fg, border: `1px solid ${m.bd}`,
});

export function Badge({ m, icon, children, size = "s" }: { m: Palette; icon?: string; children: ReactNode; size?: "s" | "m" }) {
  return (
    <span data-badge="1" style={badgeStyle(m, size)}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

/** Palette d'un statut de stock (codes couleur imposés). */
export const paletteStock = (statut: string): Palette & { icon: string } =>
  statut === "Rupture" ? { ...RED, icon: "■" } : statut === "Seuil bas" ? { ...ORANGE, icon: "▲" } : { ...GREEN, icon: "●" };

/** Pastille de provenance d'un mouvement : ◉ capteur (teal) / ✎ manuel (neutre). */
export function SourceChip({ source, long = false }: { source: string; long?: boolean }) {
  const capteur = source === "capteur";
  const m = capteur ? TEAL : NEUTRAL;
  return (
    <span data-badge="1" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 6, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", background: m.bg, color: m.fg, border: `1px solid ${m.bd}`, alignSelf: "flex-start" }}>
      <span aria-hidden="true">{capteur ? "◉" : "✎"}</span>
      {long ? (capteur ? "Capteur IoT" : "Saisie manuelle") : capteur ? "Capteur" : "Manuel"}
    </span>
  );
}

/** Style d'en-tête de colonne de la maquette Stocks. */
export const th = (align: "left" | "right"): CSSProperties => ({
  padding: "11px 14px", textAlign: align, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "oklch(0.46 0.02 255)", whiteSpace: "nowrap",
});

export const carte: CSSProperties = { display: "flex", flexDirection: "column", padding: 17, borderRadius: 14, background: "#fff", border: "1px solid var(--c-border)" };

export const tableWrap: CSSProperties = { borderRadius: 14, overflow: "hidden", background: "#fff", border: "1px solid var(--c-border)" };

/** Bouton d'action principal (bleu) ou désactivé (grisé) de la maquette. */
export const btnAction = (actif: boolean, extra: CSSProperties = {}): CSSProperties => ({
  display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700,
  ...(actif ? { background: "var(--c-primary)", color: "#fff" } : { border: "1px solid oklch(0.92 0.008 258)", background: "oklch(0.97 0.004 258)", color: "oklch(0.68 0.01 258)" }),
  ...extra,
});

export const btnSecondaire: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 14px", borderRadius: 10, border: "1px solid oklch(0.89 0.008 258)", background: "#fff", fontSize: 13, fontWeight: 600, color: "oklch(0.36 0.02 255)",
};

export const entier = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
