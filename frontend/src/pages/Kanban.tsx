import { useEffect, useState, type CSSProperties, type DragEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, toApiError, type S } from "../api/client";
import NouveauDossier, { type DossierCree } from "../components/coeur/NouveauDossier";
import Etat from "../components/Etat";
import { PrioriteChip, STATUTS } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { dateCourte, heure } from "../utils/format";

/** 5.3 Kanban des réparations : 5 colonnes, glisser-déposer + boutons ◀ ▶ (clavier), création de dossier. */

type Carte = S["CarteOut"];
type Filtre = "tous" | "mes" | "haute";
const FILTRES: { k: Filtre; l: string }[] = [{ k: "tous", l: "Tous les dossiers" }, { k: "mes", l: "Mes dossiers" }, { k: "haute", l: "Priorité haute" }];

/** Teinte de colonne (hue) et fond au survol (soft), sur la base des tons de statut de la maquette. */
const TEINTES: Record<string, { hue: string; soft: string }> = {
  recu: { hue: "oklch(0.52 0.15 258)", soft: "oklch(0.96 0.025 258)" },
  en_diagnostic: { hue: "oklch(0.50 0.10 195)", soft: "oklch(0.965 0.025 195)" },
  en_reparation: { hue: "oklch(0.58 0.14 62)", soft: "oklch(0.965 0.05 70)" },
  pret: { hue: "oklch(0.48 0.12 152)", soft: "oklch(0.965 0.03 152)" },
  livre: { hue: "oklch(0.45 0.02 258)", soft: "oklch(0.96 0.005 258)" },
};

const alerteStyle = (bg: string, fg: string, bd: string): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 7, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap",
  background: bg, color: fg, border: `1px solid ${bd}`,
});

export default function Kanban() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [formOuvert, setFormOuvert] = useState(params.get("nouveau") === "1" || !!params.get("client"));
  const [cree, setCree] = useState<DossierCree | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [focusApres, setFocusApres] = useState<{ numero: string; sens: "prev" | "next" } | null>(null);
  const clientInitial = params.get("client") ? Number(params.get("client")) : null;

  const { data, etat, error, reload } = useApi<Carte[]>(filtre === "tous" ? "/reparations" : `/reparations?filtre=${filtre}`,
    (d) => d.length === 0 && filtre === "tous");

  // après un déplacement au clavier, on rend le focus au même bouton de la carte dans sa nouvelle colonne
  useEffect(() => {
    if (!focusApres || !data) return;
    const el = document.querySelector<HTMLButtonElement>(`[data-carte="${focusApres.numero}"] [data-sens="${focusApres.sens}"]`);
    const repli = document.querySelector<HTMLButtonElement>(`[data-carte="${focusApres.numero}"] [data-ouvrir]`);
    (el && !el.disabled ? el : repli)?.focus();
    setFocusApres(null);
  }, [data, focusApres]);

  const ouverts = (data ?? []).filter((c) => c.statut !== "livre").length;

  const deplacer = async (carte: Carte, cible: string, sens?: "prev" | "next") => {
    if (carte.statut === cible || enCours) return;
    const i = STATUTS.findIndex((s) => s.key === carte.statut);
    const j = STATUTS.findIndex((s) => s.key === cible);
    if (Math.abs(i - j) !== 1) {
      toast("Un dossier avance ou recule d'une colonne à la fois.", "erreur");
      return;
    }
    setEnCours(carte.numero);
    try {
      await api.post(`/reparations/${carte.numero}/statut`, { statut: cible as S["Statut"] } satisfies S["StatutIn"]);
      toast(`${carte.numero} déplacé vers « ${STATUTS[j].label} ».`, "ok");
      await reload();
      if (sens) setFocusApres({ numero: carte.numero, sens });
    } catch (e) {
      toast(toApiError(e).message, "erreur");
    } finally {
      setEnCours(null);
    }
  };

  const ouvrirForm = () => {
    setCree(null);
    setFormOuvert(true);
  };
  const fermerForm = () => {
    setFormOuvert(false);
    if (params.has("nouveau") || params.has("client")) setParams({}, { replace: true });
  };

  const surCree = (d: DossierCree) => {
    setCree(d);
    fermerForm();
    void reload();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div role="group" aria-label="Filtrer les dossiers" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {FILTRES.map((f) => {
            const on = filtre === f.k;
            return (
              <button key={f.k} onClick={() => setFiltre(f.k)} aria-pressed={on}
                style={{ padding: "8px 13px", borderRadius: 9, fontSize: 12.5, fontWeight: on ? 700 : 500, border: `1px solid ${on ? "oklch(0.82 0.06 258)" : "oklch(0.90 0.008 258)"}`, background: on ? "oklch(0.96 0.025 258)" : "#fff", color: on ? "oklch(0.36 0.12 258)" : "oklch(0.40 0.02 255)" }}>
                {f.l}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <span data-muted="1" aria-live="polite" style={{ fontSize: 12, color: "oklch(0.48 0.02 255)" }}>
            {ouverts} {ouverts > 1 ? "dossiers ouverts" : "dossier ouvert"}
          </span>
          <button onClick={formOuvert ? fermerForm : ouvrirForm} aria-expanded={formOuvert}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, ...(formOuvert ? { border: "1px solid oklch(0.89 0.008 258)", background: "#fff", color: "oklch(0.34 0.02 255)" } : { background: "oklch(0.52 0.15 258)", color: "#fff" }) }}>
            <span aria-hidden="true">{formOuvert ? "×" : "+"}</span>
            <span>{formOuvert ? "Fermer le formulaire" : "Nouveau dossier"}</span>
          </button>
        </div>
      </div>

      {cree && (
        <div role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 11, padding: "12px 14px", borderRadius: 11, background: "oklch(0.965 0.03 152)", border: "1px solid oklch(0.86 0.06 152)" }}>
          <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7, background: "oklch(0.46 0.11 152)", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
          <span style={{ flex: 1, minWidth: 180, fontSize: 13, color: "oklch(0.30 0.08 152)" }}>
            <strong>{cree.numero}</strong> créé dans la colonne « Reçu »
            {cree.ia ? <> — le diagnostic assisté a déjà proposé « {cree.ia.label} » à {Math.round(cree.ia.confiance * 100)} %.</> : "."}
          </span>
          <button onClick={() => navigate(`/reparations/${cree.numero}`)} style={{ padding: "8px 13px", borderRadius: 9, background: "oklch(0.44 0.11 152)", color: "#fff", fontSize: 12.5, fontWeight: 700 }}>
            Ouvrir le dossier →
          </button>
        </div>
      )}

      {formOuvert && <NouveauDossier clientInitial={clientInitial} onClose={fermerForm} onCree={surCree} />}

      <Etat etat={etat} meta={SCREENS.kanban} error={error} onRetry={reload} onEmptyCta={formOuvert ? undefined : ouvrirForm}>
        {data && (
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start", overflowX: "auto", paddingBottom: 6 }}>
            {STATUTS.map((s, idx) => {
              const cartes = data.filter((c) => c.statut === s.key);
              const t = TEINTES[s.key];
              const over = survol === s.key;
              return (
                <section key={s.key} aria-label={`Colonne ${s.label} (${cartes.length})`}
                  onDragOver={(e: DragEvent) => { e.preventDefault(); if (survol !== s.key) setSurvol(s.key); }}
                  onDragLeave={(e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSurvol(null); }}
                  onDrop={(e: DragEvent) => {
                    e.preventDefault();
                    const numero = dragId ?? e.dataTransfer.getData("text/plain");
                    const carte = data.find((c) => c.numero === numero);
                    setDragId(null);
                    setSurvol(null);
                    if (carte) void deplacer(carte, s.key);
                  }}
                  style={{ flex: "1 0 208px", minWidth: 208, display: "flex", flexDirection: "column", gap: 9, padding: 11, borderRadius: 13, background: over ? t.soft : "oklch(0.965 0.005 258)", border: `1.5px solid ${over ? t.hue : "oklch(0.92 0.008 258)"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 2px" }}>
                    <span aria-hidden="true" style={{ color: t.hue, fontSize: 12 }}>{s.icon}</span>
                    <h2 style={{ flex: 1, margin: 0, fontSize: 12.5, fontWeight: 700, color: t.hue }}>{s.label}</h2>
                    <span style={{ minWidth: 22, padding: "2px 7px", borderRadius: 7, background: t.hue, color: "#fff", fontSize: 11, fontWeight: 700, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{cartes.length}</span>
                  </div>
                  <span aria-hidden="true" style={{ display: "block", height: 3, borderRadius: 99, background: t.hue, opacity: 0.9, marginBottom: 4 }} />
                  {cartes.map((c) => (
                    <CarteKanban key={c.numero} c={c} prev={STATUTS[idx - 1]} next={STATUTS[idx + 1]}
                      drag={dragId === c.numero} busy={enCours === c.numero} bloque={!!enCours}
                      onOpen={() => navigate(`/reparations/${c.numero}`)}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.numero); e.dataTransfer.effectAllowed = "move"; setDragId(c.numero); }}
                      onDragEnd={() => { setDragId(null); setSurvol(null); }}
                      onMove={(cible, sens) => void deplacer(c, cible, sens)} />
                  ))}
                  {cartes.length === 0 && (
                    <span data-tiny="1" style={{ display: "block", padding: "16px 10px", textAlign: "center", fontSize: 11.5, color: "oklch(0.58 0.02 255)", border: "1px dashed oklch(0.88 0.008 258)", borderRadius: 10 }}>Aucun dossier</span>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Etat>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "11px 14px", borderRadius: 11, background: "oklch(0.96 0.02 258)", border: "1px solid oklch(0.90 0.03 258)" }}>
        <span aria-hidden="true" style={{ color: "oklch(0.42 0.12 258)" }}>⌨</span>
        <span style={{ fontSize: 12.5, color: "oklch(0.34 0.06 258)" }}>
          Glisser-déposer pour changer de statut — ou les boutons <strong>◀ ▶</strong> de chaque carte, accessibles au clavier (Tab puis Entrée). Chaque changement est journalisé dans l'historique du dossier.
        </span>
      </div>
    </div>
  );
}

function CarteKanban({ c, prev, next, drag, busy, bloque, onOpen, onDragStart, onDragEnd, onMove }: {
  c: Carte; prev?: (typeof STATUTS)[number]; next?: (typeof STATUTS)[number]; drag: boolean; busy: boolean; bloque: boolean;
  onOpen: () => void; onDragStart: (e: DragEvent) => void; onDragEnd: () => void; onMove: (cible: string, sens: "prev" | "next") => void;
}) {
  const resume = c.symptomes.length > 78 ? c.symptomes.slice(0, 78) + "…" : c.symptomes;
  const pasBtn = (actif: boolean, accent: boolean): CSSProperties => ({
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 7, borderRadius: 8, fontSize: 11,
    border: `1px solid ${actif ? (accent ? "oklch(0.84 0.05 258)" : "oklch(0.89 0.008 258)") : "oklch(0.94 0.006 258)"}`,
    color: actif ? (accent ? "oklch(0.38 0.12 258)" : "oklch(0.36 0.02 255)") : "oklch(0.78 0.008 258)",
    background: actif ? (accent ? "oklch(0.97 0.02 258)" : "#fff") : "oklch(0.98 0.003 258)",
  });
  const alertes = c.sla_depasse || c.attente_piece || c.retour;
  return (
    <div data-carte={c.numero} draggable={!bloque} onDragStart={onDragStart} onDragEnd={onDragEnd} aria-busy={busy}
      style={{ display: "flex", flexDirection: "column", padding: 11, borderRadius: 11, background: "#fff", border: `1px solid ${drag ? "oklch(0.60 0.13 258)" : c.sla_depasse ? "oklch(0.88 0.06 25)" : "oklch(0.91 0.008 258)"}`, boxShadow: "0 1px 2px oklch(0.22 0.02 255 / 0.06)", cursor: bloque ? "progress" : "grab", opacity: drag || busy ? 0.55 : 1 }}>
      <button data-ouvrir="1" onClick={onOpen} aria-label={`Ouvrir le dossier ${c.numero} — ${c.appareil}, ${c.client_nom}`}
        style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%", textAlign: "left" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, width: "100%" }}>
          <span className="mono" data-underline="1" style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.42 0.13 258)" }}>{c.numero}</span>
          <PrioriteChip priorite={c.priorite} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.24 0.02 255)" }}>{c.appareil}</span>
          <span style={{ fontSize: 11.5, color: "oklch(0.40 0.02 255)" }}>{c.client_nom}</span>
        </span>
        <span data-muted="1" style={{ fontSize: 11.5, lineHeight: 1.45, color: "oklch(0.46 0.02 255)", display: "block" }}>{resume}</span>
        {alertes && (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {c.sla_depasse && <span data-badge="1" style={alerteStyle("oklch(0.96 0.04 25)", "oklch(0.42 0.15 25)", "oklch(0.86 0.08 25)")}><span aria-hidden="true">◷</span>SLA 48 h dépassé</span>}
            {c.attente_piece && <span data-badge="1" style={alerteStyle("oklch(0.965 0.05 70)", "oklch(0.42 0.11 62)", "oklch(0.86 0.09 70)")}><span aria-hidden="true">■</span>Attente pièce</span>}
            {c.retour && <span data-badge="1" style={alerteStyle("oklch(0.965 0.025 195)", "oklch(0.36 0.08 195)", "oklch(0.86 0.04 195)")}><span aria-hidden="true">↺</span>Retour garantie</span>}
          </span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", paddingTop: 3 }}>
          <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", background: "oklch(0.94 0.02 258)", color: "oklch(0.40 0.10 258)", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {c.technicien?.initiales ?? "?"}
          </span>
          <span data-tiny="1" style={{ flex: 1, fontSize: 11, color: "oklch(0.48 0.02 255)" }}>{c.technicien?.nom ?? "Non affecté"}</span>
        </span>
      </button>
      <div style={{ display: "flex", gap: 5, paddingTop: 8, marginTop: 6, borderTop: "1px solid oklch(0.94 0.006 258)" }}>
        <button data-sens="prev" onClick={() => prev && onMove(prev.key, "prev")} disabled={!prev || bloque}
          aria-label={prev ? `Déplacer ${c.numero} vers ${prev.label}` : "Première colonne"} style={pasBtn(!!prev, false)}>
          <span aria-hidden="true">◀</span>
        </button>
        <button data-sens="next" onClick={() => next && onMove(next.key, "next")} disabled={!next || bloque}
          aria-label={next ? `Déplacer ${c.numero} vers ${next.label}` : "Dernière colonne"} style={pasBtn(!!next, true)}>
          <span aria-hidden="true">▶</span>
        </button>
        <span data-tiny="1" title={`Reçu le ${dateCourte(c.recu_le)} à ${heure(c.recu_le)}`} style={{ flex: 1, textAlign: "right", fontSize: 10.5, color: "oklch(0.56 0.02 255)", alignSelf: "center" }}>
          {dateCourte(c.recu_le)}
        </span>
      </div>
    </div>
  );
}
