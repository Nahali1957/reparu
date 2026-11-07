import { useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { telecharger, toApiError, type S } from "../api/client";
import Etat from "../components/Etat";
import { Segmented } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { delta, eur, eur0, nombre } from "../utils/format";

/** 5.2 Tableau de bord : KPI, SLA 48 h, évolution, alertes de rupture, répartition, clôtures, charge. */

type Periode = "7j" | "mois" | "trimestre" | "12m";
const PERIODES: { value: Periode; label: string }[] = [
  { value: "7j", label: "7 jours" },
  { value: "mois", label: "Ce mois" },
  { value: "trimestre", label: "Trimestre" },
  { value: "12m", label: "12 mois" },
];

const carte: CSSProperties = { display: "flex", flexDirection: "column", padding: 18, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.91 0.008 258)" };
const h3: CSSProperties = { margin: 0, fontSize: 14.5, fontWeight: 700 };
const lienBas: CSSProperties = { marginTop: 2, padding: 10, borderRadius: 9, border: "1px solid oklch(0.89 0.008 258)", fontSize: 12.5, fontWeight: 600, color: "oklch(0.34 0.02 255)" };
const badgeS = (bg: string, fg: string, bd: string): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 7px", borderRadius: 7, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap",
  background: bg, color: fg, border: `1px solid ${bd}`,
});
const TON = {
  ok: { bg: "oklch(0.965 0.03 152)", fg: "oklch(0.36 0.10 152)", bd: "oklch(0.84 0.06 152)" },
  warn: { bg: "oklch(0.965 0.05 70)", fg: "oklch(0.42 0.11 62)", bd: "oklch(0.86 0.09 70)" },
  danger: { bg: "oklch(0.96 0.04 25)", fg: "oklch(0.42 0.15 25)", bd: "oklch(0.86 0.08 25)" },
};

/** « vs octobre » quand la période est le mois courant, sinon « vs période précédente ». */
function libelleComparaison(p: S["PeriodeOut"]): string {
  if (p.code !== "mois") return "vs période précédente";
  const [a, m] = p.du.split("-").map(Number);
  return "vs " + new Date(a, m - 2, 1).toLocaleDateString("fr-FR", { month: "long" });
}

const heuresDepuis = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 36e5));

export default function TableauDeBord() {
  const [periode, setPeriode] = useState<Periode>("mois");
  const navigate = useNavigate();
  const toast = useToast();
  const [exportEnCours, setExportEnCours] = useState(false);
  const { data, etat, error, reload } = useApi<S["DashboardOut"]>(`/dashboard?periode=${periode}`,
    (d) => !d.reparations.valeur && d.serie.every((p) => p.reparations === 0));

  const exporter = async () => {
    setExportEnCours(true);
    try {
      await telecharger(`/rapports/export.csv?periode=${periode}`, `reparu-rapport-${periode}.csv`);
    } catch (e) {
      toast(toApiError(e).message, "erreur");
    } finally {
      setExportEnCours(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <Segmented label="Période" value={periode} options={PERIODES} onChange={setPeriode} />
        <div style={{ display: "flex", gap: 9 }}>
          <button onClick={exporter} disabled={exportEnCours} aria-busy={exportEnCours}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 9, border: "1px solid oklch(0.89 0.008 258)", background: "#fff", fontSize: 12.5, fontWeight: 600 }}>
            <span aria-hidden="true">⤓</span><span>{exportEnCours ? "Export…" : "Exporter"}</span>
          </button>
          <button onClick={() => navigate("/rapports")}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 9, background: "oklch(0.52 0.15 258)", color: "#fff", fontSize: 12.5, fontWeight: 700 }}>
            <span aria-hidden="true">📊</span><span>Rapport détaillé</span>
          </button>
        </div>
      </div>

      <Etat etat={etat} meta={SCREENS.dashboard} error={error} onRetry={reload} onEmptyCta={() => navigate("/reparations?nouveau=1")}>
        {data && <Contenu d={data} />}
      </Etat>
    </div>
  );
}

function Contenu({ d }: { d: S["DashboardOut"] }) {
  const navigate = useNavigate();
  const vs = libelleComparaison(d.periode);
  const sla = d.sla_depasses;

  return (
    <>
      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(178px,1fr))", gap: 13 }}>
        <KpiCarte sombre icon="🛠" label="Réparations / mois" valeur={nombre(d.reparations.valeur)} k={d.reparations} sub={vs} />
        <KpiCarte sombre icon="💶" label="Marge générée" valeur={eur0(d.marge.valeur)} k={d.marge} sub={vs} />
        <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: 16, borderRadius: 14, background: "oklch(0.98 0.02 25)", border: "1px solid oklch(0.86 0.07 25)" }}>
          <KpiLabel icon="⚠" label="Ruptures imminentes" color="oklch(0.46 0.12 25)" />
          <span style={{ fontSize: 31, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: "oklch(0.44 0.17 25)" }}>{d.ruptures}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "oklch(0.46 0.14 25)" }}>
            <span aria-hidden="true">■</span><span>{d.ruptures ? "action requise" : "aucune action requise"}</span>
          </span>
        </div>
        <KpiCarte icon="◷" label="Délai moyen" valeur={d.delai_moyen_j.valeur === null ? "—" : `${nombre(d.delai_moyen_j.valeur, 1)} j`} k={d.delai_moyen_j} sub="objectif 2 j" inverse />
      </div>

      {/* SLA 48 h */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 11, alignItems: "center", padding: "13px 15px", borderRadius: 13, background: sla.length ? "oklch(0.98 0.02 25)" : "oklch(0.985 0.012 152)", border: `1px solid ${sla.length ? "oklch(0.88 0.06 25)" : "oklch(0.88 0.05 152)"}` }}>
        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 9, background: sla.length ? "oklch(0.96 0.04 25)" : "oklch(0.965 0.03 152)", color: sla.length ? "oklch(0.46 0.16 25)" : "oklch(0.38 0.10 152)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>◷</span>
        <span style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", lineHeight: 1.4 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "oklch(0.34 0.02 255)" }}>
            {sla.length} {sla.length > 1 ? "dossiers dépassent" : "dossier dépasse"} l'engagement de 48 h
          </span>
          <span data-muted="1" style={{ fontSize: 12, color: "oklch(0.46 0.02 255)" }}>
            Le délai court depuis la réception ; les dossiers clôturés et ceux en attente d'une pièce en rupture sont exclus du calcul.
          </span>
        </span>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {sla.slice(0, 3).map((c) => (
            <SlaBouton key={c.numero} numero={c.numero} appareil={c.appareil} retard={`${heuresDepuis(c.recu_le)} h`} onClick={() => navigate(`/reparations/${c.numero}`)} />
          ))}
          {sla.length > 3 && (
            <SlaBouton numero={`+${sla.length - 3}`} appareil={sla.length - 3 > 1 ? "autres dossiers" : "autre dossier"} retard="voir le Kanban" onClick={() => navigate("/reparations")} />
          )}
        </span>
      </div>

      {/* Évolution + alertes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, alignItems: "start" }}>
        <section style={{ ...carte, gap: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h3 style={h3}>Évolution des réparations</h3>
            <span data-muted="1" style={{ fontSize: 11.5, color: "oklch(0.50 0.02 255)" }}>nombre de dossiers clôturés / mois</span>
          </div>
          <Evolution serie={d.serie} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, paddingTop: 12, borderTop: "1px solid oklch(0.94 0.006 258)" }}>
            {[{ l: "Mois en cours", c: "oklch(0.52 0.15 258)" }, { l: "Mois précédents", c: "oklch(0.86 0.05 258)" }].map((x) => (
              <span key={x.l} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "oklch(0.42 0.02 255)" }}>
                <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 3, background: x.c, display: "inline-block" }} />
                <span>{x.l}</span>
              </span>
            ))}
          </div>
        </section>

        <section style={{ ...carte, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <h3 style={h3}>Alertes de rupture</h3>
            <span data-badge="1" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, background: TON.danger.bg, color: TON.danger.fg, border: `1px solid ${TON.danger.bd}` }}>
              <span aria-hidden="true">■</span><span>{d.alertes_total} à traiter</span>
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {d.alertes.length === 0 && <span data-muted="1" style={{ fontSize: 12.5, color: "var(--c-muted)" }}>Aucune pièce sous le seuil d'alerte.</span>}
            {d.alertes.slice(0, 3).map((a) => <AlerteLigne key={a.piece_id} a={a} onClick={() => navigate(`/stocks?piece=${a.piece_id}`)} />)}
          </div>
          <button onClick={() => navigate("/stocks")} style={lienBas}>Voir tout l'inventaire →</button>
        </section>
      </div>

      {/* Répartition, clôtures, charge */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, alignItems: "start" }}>
        <section style={{ ...carte, gap: 13 }}>
          <h3 style={h3}>Répartition des interventions</h3>
          {d.repartition.length === 0 && <span data-muted="1" style={{ fontSize: 12.5, color: "var(--c-muted)" }}>Aucune intervention clôturée sur la période.</span>}
          {d.repartition.map((p, i) => (
            <div key={p.label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span style={{ color: "oklch(0.30 0.02 255)" }}>{p.label}</span>
                <span className="mono" style={{ fontWeight: 600, color: "oklch(0.40 0.02 255)" }}>{nombre(p.pct, 0)} %</span>
              </span>
              <span aria-hidden="true" style={{ height: 8, borderRadius: 99, background: "oklch(0.94 0.006 258)", overflow: "hidden", display: "block" }}>
                <span style={{ display: "block", height: "100%", borderRadius: 99, width: `${p.pct}%`, background: `oklch(${(0.46 + i * 0.06).toFixed(2)} 0.12 ${258 - i * 22})` }} />
              </span>
            </div>
          ))}
        </section>

        <section style={{ ...carte, gap: 11 }}>
          <h3 style={h3}>Derniers dossiers clôturés</h3>
          {d.derniers_clotures.length === 0 && <span data-muted="1" style={{ fontSize: 12.5, color: "var(--c-muted)" }}>Aucun dossier clôturé récemment.</span>}
          {d.derniers_clotures.map((r) => (
            <button key={r.numero} onClick={() => navigate(`/reparations/${r.numero}`)} title={`${r.client_nom} — ${r.appareil}`}
              style={{ display: "flex", alignItems: "center", gap: 11, padding: 10, borderRadius: 10, border: "1px solid oklch(0.94 0.006 258)", background: "oklch(0.985 0.003 258)", textAlign: "left" }}>
              <span className="mono" data-underline="1" style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.44 0.13 258)" }}>{r.numero}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "oklch(0.30 0.02 255)" }}>{r.appareil}</span>
              <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: r.prix_ttc === null ? "oklch(0.50 0.02 255)" : "oklch(0.36 0.10 152)" }}>
                {r.prix_ttc === null ? "sans facture" : eur(r.prix_ttc)}
              </span>
            </button>
          ))}
        </section>

        <section style={{ ...carte, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <h3 style={h3}>Charge par technicien</h3>
            <span data-muted="1" style={{ fontSize: 11.5, color: "oklch(0.50 0.02 255)" }}>dossiers ouverts</span>
          </div>
          {d.charge.map((c) => {
            const t = c.statut === "Surchargé" ? TON.danger : c.statut === "Chargé" ? TON.warn : TON.ok;
            return (
              <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", background: "oklch(0.95 0.02 258)", color: "oklch(0.40 0.10 258)", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.initiales}</span>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "oklch(0.28 0.02 255)" }}>{c.nom}</span>
                  <span data-badge="1" style={badgeS(t.bg, t.fg, t.bd)}>{c.statut}</span>
                </span>
                <span aria-hidden="true" style={{ height: 8, borderRadius: 99, background: "oklch(0.94 0.006 258)", overflow: "hidden", display: "block" }}>
                  <span style={{ display: "block", height: "100%", borderRadius: 99, width: `${Math.min(100, c.ouverts * 25)}%`, background: t.fg }} />
                </span>
                <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.50 0.02 255)" }}>
                  {c.ouverts} {c.ouverts > 1 ? "dossiers en cours" : "dossier en cours"}{c.specialite ? ` · ${c.specialite}` : ""}
                </span>
              </div>
            );
          })}
          <button onClick={() => navigate("/planning")} style={lienBas}>Rééquilibrer les affectations →</button>
        </section>
      </div>
    </>
  );
}

function KpiLabel({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <span className="mono" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color }}>
      <span aria-hidden="true">{icon}</span><span>{label}</span>
    </span>
  );
}

/** Carte KPI de la maquette : sombre (réparations, marge) ou claire (délai). `inverse` : une baisse est une bonne nouvelle. */
function KpiCarte({ icon, label, valeur, k, sub, sombre = false, inverse = false }: {
  icon: string; label: string; valeur: ReactNode; k: S["KpiOut"]; sub: string; sombre?: boolean; inverse?: boolean;
}) {
  const dv = k.delta_pct;
  const bon = dv === null ? null : inverse ? dv <= 0 : dv >= 0;
  const couleurDelta = bon === null ? (sombre ? "oklch(0.66 0.02 258)" : "oklch(0.52 0.02 255)")
    : bon ? (sombre ? "oklch(0.78 0.11 152)" : "oklch(0.38 0.10 152)")
      : sombre ? "oklch(0.78 0.12 40)" : "oklch(0.46 0.14 25)";
  const fleche = dv === null ? "→" : dv > 0 ? "↗" : dv < 0 ? "↘" : "→";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: 16, borderRadius: 14, background: sombre ? "oklch(0.21 0.025 258)" : "#fff", border: `1px solid ${sombre ? "oklch(0.28 0.03 258)" : "oklch(0.91 0.008 258)"}` }}>
      <KpiLabel icon={icon} label={label} color={sombre ? "oklch(0.74 0.03 258)" : "oklch(0.50 0.02 255)"} />
      <span style={{ fontSize: 31, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: sombre ? "#fff" : "oklch(0.24 0.02 255)" }}>{valeur}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: couleurDelta }}>
        <span aria-hidden="true">{fleche}</span>
        <span>{dv === null ? "" : delta(dv)}</span>
        <span data-muted="1" style={{ fontWeight: 400, color: sombre ? "oklch(0.66 0.02 258)" : "oklch(0.52 0.02 255)" }}>{sub}</span>
      </span>
    </div>
  );
}

function SlaBouton({ numero, appareil, retard, onClick }: { numero: string; appareil: string; retard: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 9, background: "#fff", border: "1px solid oklch(0.90 0.04 25)", fontSize: 12, fontWeight: 600, color: "oklch(0.30 0.02 255)" }}>
      <span className="mono" data-underline="1" style={{ fontWeight: 700, color: "oklch(0.44 0.14 25)" }}>{numero}</span>
      <span>{appareil}</span>
      <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.48 0.02 255)" }}>{retard}</span>
    </button>
  );
}

function AlerteLigne({ a, onClick }: { a: S["AlertePieceOut"]; onClick: () => void }) {
  const rupture = a.statut === "Rupture";
  const t = rupture ? TON.danger : a.statut === "Seuil bas" ? TON.warn : TON.ok;
  const icone = rupture ? "■" : a.statut === "Seuil bas" ? "▲" : "●";
  return (
    <button onClick={onClick}
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 11, border: `1px solid ${rupture ? "oklch(0.88 0.06 25)" : "oklch(0.90 0.06 70)"}`, background: rupture ? "oklch(0.985 0.012 25)" : "oklch(0.99 0.012 70)", textAlign: "left" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 9, width: "100%" }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "oklch(0.26 0.02 255)" }}>{a.designation}</span>
        <span data-badge="1" style={badgeS(t.bg, t.fg, t.bd)}><span aria-hidden="true">{icone}</span>{a.statut}</span>
      </span>
      <span data-muted="1" style={{ fontSize: 11.5, color: "oklch(0.46 0.02 255)" }}>
        seuil {a.seuil} · {a.stock === 0 ? "plus aucune unité en stock" : `${a.stock} unité${a.stock > 1 ? "s" : ""} restante${a.stock > 1 ? "s" : ""}`}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 9, width: "100%" }}>
        <span aria-hidden="true" style={{ flex: 1, height: 7, borderRadius: 99, background: "oklch(0.92 0.008 258)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", borderRadius: 99, width: `${Math.max(3, Math.round((a.stock / Math.max(a.seuil, 1)) * 100))}%`, background: t.fg }} />
        </span>
        <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: t.fg }}>{a.stock}/{a.seuil}</span>
      </span>
    </button>
  );
}

function Evolution({ serie }: { serie: S["PointMoisOut"][] }) {
  const donnees = serie.map((p) => ({ mois: p.libelle, n: p.reparations, courant: p.courant }));
  return (
    <div role="img" aria-label={`Dossiers clôturés par mois : ${serie.map((p) => `${p.libelle} ${p.reparations}`).join(", ")}`} style={{ height: 204 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={donnees} margin={{ top: 22, right: 0, bottom: 0, left: 0 }} barCategoryGap="18%">
          <defs>
            <linearGradient id="barreCourante" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.58 0.15 258)" />
              <stop offset="100%" stopColor="oklch(0.48 0.15 258)" />
            </linearGradient>
          </defs>
          <XAxis dataKey="mois" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "oklch(0.52 0.02 255)" }} interval={0} />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip cursor={{ fill: "oklch(0.96 0.01 258)" }} formatter={(v) => [`${v} dossiers`, "Clôturés"]}
            contentStyle={{ borderRadius: 9, border: "1px solid oklch(0.91 0.008 258)", fontSize: 12 }} />
          <Bar dataKey="n" maxBarSize={44} radius={[7, 7, 3, 3]} isAnimationActive={false}>
            {donnees.map((p) => <Cell key={p.mois} fill={p.courant ? "url(#barreCourante)" : "oklch(0.86 0.05 258)"} />)}
            <LabelList dataKey="n" position="top" style={{ fontSize: 11.5, fontWeight: 700, fill: "oklch(0.34 0.02 255)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
