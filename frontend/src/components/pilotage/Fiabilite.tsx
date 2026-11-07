import { useState, type CSSProperties } from "react";
import { api, toApiError, type ApiError, type S } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { useToast } from "../../hooks/useToast";
import { dateHeureLongue, nombre } from "../../utils/format";
import { Alerte, Pastille, tdStyle, thStyle } from "../ui";

/** F-11 — Fiabilité des modèles (pas d'écran dans la maquette : reprend le style des cartes de 5.11). */

type Modele = S["ModeleFiabiliteOut"];

const BORD = "oklch(0.91 0.008 258)";
const carte: CSSProperties = { padding: 17, borderRadius: 14, background: "#fff", border: `1px solid ${BORD}` };
const kicker: CSSProperties = { fontSize: 10.5, letterSpacing: ".09em", textTransform: "uppercase", color: "oklch(0.50 0.02 255)" };

const ALGOS: Record<string, string> = {
  logistic_regression: "Régression logistique",
  random_forest: "Forêt aléatoire",
  gradient_boosting: "Gradient boosting",
  ridge: "Régression Ridge",
  ridge_lags: "Ridge sur retards",
  gradient_boosting_lags: "Gradient boosting sur retards",
  moyenne_mobile_30j: "Moyenne mobile 30 j",
  isolation_forest: "Isolation Forest",
  local_outlier_factor: "Local Outlier Factor",
};
const nomAlgo = (k: string) => {
  if (ALGOS[k]) return ALGOS[k];
  const s = k.replace(/^baseline_/, "").replace(/_/g, " ");
  return k.startsWith("baseline_") ? `Baseline naïve : ${s}` : s.charAt(0).toUpperCase() + s.slice(1);
};

const METRIQUES: Record<string, string> = {
  accuracy: "Exactitude", f1_macro: "F1 macro", top3_accuracy: "Top-3", f1: "F1", rappel: "Rappel", precision: "Précision",
  taux_fausses_alertes: "Fausses alertes", r2: "R²", mae_min: "MAE (min)", mae: "MAE (pièces/j)", wape_pct: "WAPE", biais_pct: "Biais",
  duree_entrainement_s: "Durée",
};
const RATIOS = new Set(["accuracy", "f1_macro", "top3_accuracy", "f1", "rappel", "precision", "taux_fausses_alertes"]);

function fmt(m: string, v: unknown): string {
  if (typeof v !== "number") return v === null || v === undefined ? "—" : String(v);
  if (RATIOS.has(m)) return `${nombre(v * 100, 1)} %`;
  if (m.endsWith("_pct")) return `${nombre(v, 1)} %`;
  if (m === "mae_min") return `${nombre(v, 2)} min`;
  if (m === "duree_entrainement_s") return `${nombre(v, 2)} s`;
  return nombre(v, 3);
}
function fmtGain(m: Modele): string {
  const g = m.gain_vs_baseline;
  const signe = g > 0 ? "+" : g < 0 ? "−" : "";
  if (RATIOS.has(m.metrique)) return `${signe}${nombre(Math.abs(g) * 100, 1)} pts`;
  return `${signe}${fmt(m.metrique, Math.abs(g))}`;
}

export default function Fiabilite() {
  const { data, setData, etat, error, reload } = useApi<S["FiabiliteOut"]>("/ia/fiabilite");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [errAction, setErrAction] = useState<ApiError | null>(null);

  const reentrainer = async () => {
    setBusy(true);
    setErrAction(null);
    try {
      const r = await api.post<S["FiabiliteOut"]>("/ia/entrainer", undefined, { timeout: 300_000 });
      setData(r.data);
      toast("Modèles réentraînés : les meilleures versions sont actives.", "ok");
    } catch (e) {
      setErrAction(toApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (etat === "locked") return null; // permission « ia.fiabilite » identique à celle de l'écran

  return (
    <section aria-labelledby="titre-fiabilite" style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="mono" style={kicker}>F-11 · Intelligence artificielle</span>
          <h2 id="titre-fiabilite" style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>Fiabilité des modèles</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {data?.donnees_synthetiques && <Pastille ton="warn" icon="◐" title="Aucun historique réel : jeu généré par ml/data/generate.py (seed fixe).">Évaluation sur données synthétiques</Pastille>}
          <button className="btn btn-ia" onClick={reentrainer} disabled={busy || !data} aria-busy={busy} style={{ opacity: busy ? 0.7 : 1 }}>
            {busy ? (
              <span aria-hidden="true" style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "2px solid oklch(1 0 0 / 0.4)", borderTopColor: "#fff", animation: "spin .8s linear infinite" }} />
            ) : <span aria-hidden="true">↻</span>}
            <span>{busy ? "Réentraînement en cours…" : "Réentraîner les modèles"}</span>
          </button>
        </div>
      </div>
      {errAction && <Alerte>{errAction.message}</Alerte>}

      {etat === "loading" && <div className="skeleton" style={{ height: 220, borderRadius: 14, border: `1px solid ${BORD}` }} />}
      {etat === "error" && (
        <div style={{ ...carte, display: "flex", alignItems: "center", gap: 12, borderColor: "var(--c-danger-border-2)" }}>
          <span style={{ flex: 1, fontSize: 13, color: "var(--c-danger-text-2)", fontWeight: 600 }}>Impossible de charger la fiabilité des modèles. {error?.message}</span>
          <button className="btn btn-secondary" onClick={reload}><span aria-hidden="true">↺</span> Réessayer</button>
        </div>
      )}

      {data && (
        <>
          <div style={{ ...carte, display: "flex", flexWrap: "wrap", gap: 22, alignItems: "center", background: "oklch(0.975 0.004 258)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Suivi en production — diagnostic</span>
              <span data-muted="1" data-tiny="1" style={{ fontSize: 11.5, color: "var(--c-muted)" }}>Suggestions de l'IA comparées à la panne finalement retenue par le technicien.</span>
            </div>
            {[
              ["Suggestions évaluées", nombre(data.suivi_diagnostic.suggestions_evaluees)],
              ["Top-1", data.suivi_diagnostic.top1_pct === null ? "—" : `${nombre(data.suivi_diagnostic.top1_pct, 1)} %`],
              ["Top-3", data.suivi_diagnostic.top3_pct === null ? "—" : `${nombre(data.suivi_diagnostic.top3_pct, 1)} %`],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 110 }}>
                <span className="mono" style={kicker}>{l}</span>
                <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(480px,1fr))", gap: 14, alignItems: "start" }}>
            {data.modeles.map((m) => <CarteModele key={m.nom} m={m} />)}
          </div>
          <span data-tiny="1" data-muted="1" style={{ fontSize: 11.5, color: "var(--c-muted)", lineHeight: 1.5 }}>
            Chaque modèle est comparé à au moins deux algorithmes et à une baseline naïve ; le meilleur selon la métrique de sélection est retenu automatiquement.
            Les scores sont mesurés sur un jeu de test issu de données synthétiques reproductibles, et non sur un historique réel.
          </span>
        </>
      )}
    </section>
  );
}

function CarteModele({ m }: { m: Modele }) {
  const noms = Object.keys(m.candidats);
  const cols = Array.from(new Set(noms.flatMap((n) => Object.keys(m.candidats[n] ?? {}))));
  const gainPositif = m.gain_vs_baseline > 0;
  return (
    <article style={{ ...carte, display: "flex", flexDirection: "column", gap: 13, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
          <span className="mono" style={kicker}>{m.nom}</span>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{m.libelle}</h3>
        </div>
        <Pastille ton="ia" icon="◆">{m.version}</Pastille>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 10 }}>
        <Mesure label="Algorithme retenu" valeur={nomAlgo(m.algorithme_retenu)} petit />
        <Mesure label={`${METRIQUES[m.metrique] ?? m.metrique} ${m.plus_grand_est_meilleur ? "↑" : "↓"}`} valeur={fmt(m.metrique, m.valeur)}
          sous={`baseline ${fmt(m.metrique, m.baseline)}`} />
        <Mesure label="Gain vs baseline" valeur={fmtGain(m)} couleur={gainPositif ? "oklch(0.38 0.10 152)" : "oklch(0.44 0.02 255)"} />
      </div>

      <div data-table="1" style={{ borderRadius: 10, overflow: "auto", border: `1px solid ${BORD}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <caption className="sr-only">Comparaison des algorithmes candidats — {m.libelle}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ ...thStyle, padding: "8px 10px", fontSize: 9.5 }}>CANDIDAT</th>
              {cols.map((c) => (
                <th key={c} scope="col" style={{ ...thStyle, padding: "8px 10px", fontSize: 9.5, textAlign: "right", color: c === m.metrique ? "var(--c-text-3)" : thStyle.color }}>
                  {(METRIQUES[c] ?? c).toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {noms.map((n) => {
              const retenu = n === m.algorithme_retenu;
              const baseline = n.startsWith("baseline");
              return (
                <tr key={n} style={{ background: retenu ? "oklch(0.965 0.03 152)" : "transparent" }}>
                  <th scope="row" style={{ ...tdStyle, padding: "8px 10px", fontSize: 12, fontWeight: retenu ? 700 : 500, textAlign: "left", color: baseline ? "var(--c-muted)" : "var(--c-text-3)", fontStyle: baseline ? "italic" : "normal" }}>
                    {retenu && <span aria-hidden="true" style={{ color: "oklch(0.38 0.11 152)", marginRight: 5 }}>✓</span>}
                    {nomAlgo(n)}
                    {retenu && <span className="sr-only"> (retenu)</span>}
                  </th>
                  {cols.map((c) => (
                    <td key={c} className="mono" style={{ ...tdStyle, padding: "8px 10px", fontSize: 11.5, textAlign: "right", fontWeight: c === m.metrique ? 700 : 400, color: c === m.metrique ? "var(--c-text-2)" : "oklch(0.44 0.02 255)" }}>
                      {fmt(c, (m.candidats[n] as Record<string, unknown>)[c])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div data-tiny="1" data-muted="1" style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 11.5, color: "oklch(0.50 0.02 255)" }}>
        <span><span className="mono">{nombre(m.nb_lignes)}</span> lignes d'entraînement</span>
        <span>Entraîné le {dateHeureLongue(m.entraine_le)}</span>
        <span>Versions : <span className="mono">{m.versions.join(" · ")}</span></span>
      </div>
    </article>
  );
}

function Mesure({ label, valeur, sous, couleur, petit }: { label: string; valeur: string; sous?: string; couleur?: string; petit?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 11px", borderRadius: 10, border: "1px solid oklch(0.95 0.006 258)", background: "oklch(0.985 0.003 258)", minWidth: 0 }}>
      <span className="mono" style={{ ...kicker, fontSize: 9.5 }}>{label}</span>
      <span style={{ fontSize: petit ? 13 : 18, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: couleur ?? "oklch(0.24 0.02 255)", lineHeight: 1.25 }}>{valeur}</span>
      {sous && <span data-tiny="1" className="mono" style={{ fontSize: 10.5, color: "oklch(0.50 0.02 255)" }}>{sous}</span>}
    </div>
  );
}
