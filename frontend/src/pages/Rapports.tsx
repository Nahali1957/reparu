import { useState, type CSSProperties } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { api, telecharger, toApiError, type ApiError, type S } from "../api/client";
import Etat from "../components/Etat";
import Fiabilite from "../components/pilotage/Fiabilite";
import { Alerte } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { dateHeureLongue, delta, eur0, nombre } from "../utils/format";

type Code = "7j" | "mois" | "trimestre" | "12m";
const PERIODES: { k: Code; l: string }[] = [
  { k: "7j", l: "7 jours" }, { k: "mois", l: "Mois en cours" }, { k: "trimestre", l: "Trimestre" }, { k: "12m", l: "12 mois" },
];

const BORD = "oklch(0.91 0.008 258)";
const carte: CSSProperties = { padding: 17, borderRadius: 14, background: "#fff", border: `1px solid ${BORD}` };
const libChamp: CSSProperties = { fontSize: 12, fontWeight: 600, color: "oklch(0.34 0.02 255)" };
const VERT_FONCE = "oklch(0.34 0.10 152)";

/** Couleur d'un écart : vert s'il va dans le bon sens, rouge sinon, neutre si inconnu. */
function couleurDelta(d: number | null | undefined, plusEstMieux = true): string {
  if (d === null || d === undefined || d === 0) return "oklch(0.46 0.02 255)";
  return (d > 0) === plusEstMieux ? "oklch(0.38 0.10 152)" : "var(--c-danger-text)";
}

export default function Rapports() {
  const [periode, setPeriode] = useState<Code>("mois");
  const [perso, setPerso] = useState<{ du: string; au: string } | null>(null);
  const qs = perso ? `du=${perso.du}&au=${perso.au}` : `periode=${periode}`;
  const { data, etat, error, reload } = useApi<S["RapportOut"]>(`/rapports?${qs}`);
  const toast = useToast();
  const [export_, setExport] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [errExport, setErrExport] = useState<ApiError | null>(null);

  const choisir = (k: Code) => {
    setPeriode(k);
    setPerso(null);
    setExport(null);
  };
  const changerDate = (champ: "du" | "au", v: string) => {
    if (!v || !data) return;
    const base = perso ?? { du: data.periode.du, au: data.periode.au };
    setPerso({ ...base, [champ]: v });
    setExport(null);
  };

  const exporter = async (cle: "PDF" | "CSV" | "envoi") => {
    if (!data) return;
    setEnCours(cle);
    setErrExport(null);
    setExport(null);
    const nom = `reparu-rapport-${data.periode.du}-${data.periode.au}`;
    try {
      if (cle === "envoi") {
        const r = await api.post<S["ProgrammationOut"]>(`/rapports/programmer?periode=${periode}`, { format: "pdf" });
        const msg = `Envoi programmé le ${dateHeureLongue(r.data.programme_pour)} à ${r.data.destinataire} (simulation)`;
        toast(msg, "ok");
        setExport(`${msg} — pièce jointe ${r.data.piece_jointe}.`);
      } else {
        const ext = cle.toLowerCase();
        await telecharger(`/rapports/export.${ext}?${qs}`, `${nom}.${ext}`);
        setExport(`Rapport ${cle} généré — ${nom}.${ext}`);
      }
    } catch (e) {
      setErrExport(toApiError(e));
    } finally {
      setEnCours(null);
    }
  };

  const valeurs = data ? indicateurs(data) : [];
  const chart = (data?.marge_par_mois ?? []).map((m) => ({ ...m, v: Number(m.marge) }));
  const rent = data?.rentabilite ?? [];
  const maxRent = Math.max(1, ...rent.map((r) => Number(r.marge)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Période */}
      <div style={{ ...carte, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1, minWidth: 230 }}>
          <span id="lib-periode" style={libChamp}>Période du rapport</span>
          <div role="radiogroup" aria-labelledby="lib-periode" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PERIODES.map((p) => {
              const actif = !perso && periode === p.k;
              return (
                <button key={p.k} role="radio" aria-checked={actif} onClick={() => choisir(p.k)}
                  style={{ padding: "9px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: actif ? 700 : 500, border: `1.5px solid ${actif ? "oklch(0.82 0.06 258)" : BORD}`, background: actif ? "oklch(0.96 0.025 258)" : "#fff", color: actif ? "oklch(0.36 0.12 258)" : "oklch(0.40 0.02 255)" }}>
                  {p.l}
                </button>
              );
            })}
          </div>
        </div>
        {(["du", "au"] as const).map((c) => (
          <label key={c} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={libChamp}>{c === "du" ? "Du" : "Au"}</span>
            <input type="date" value={perso?.[c] ?? data?.periode[c] ?? ""} onChange={(e) => changerDate(c, e.target.value)}
              max={c === "du" ? perso?.au ?? data?.periode.au : undefined} min={c === "au" ? perso?.du ?? data?.periode.du : undefined}
              style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid oklch(0.88 0.008 258)", fontSize: 13, background: "#fff" }} />
          </label>
        ))}
      </div>

      {error && data && error.status !== 403 && <Alerte>{error.message}</Alerte>}

      <Etat etat={etat}meta={SCREENS.rapports} error={error} onRetry={reload}>
        {data && (
          <>
            {/* 6 indicateurs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
              {valeurs.map((i) => (
                <div key={i.label} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 15, borderRadius: 13, background: "#fff", border: `1px solid ${BORD}` }}>
                  <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".09em", textTransform: "uppercase", color: "oklch(0.50 0.02 255)" }}>{i.label}</span>
                  <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: i.color }}>{i.value}</span>
                  <span data-tiny="1" style={{ fontSize: 11.5, fontWeight: 600, color: i.deltaColor }}>{i.delta}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, alignItems: "start" }}>
              <div style={{ ...carte, display: "flex", flexDirection: "column", gap: 13 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Aperçu — marge par mois</h3>
                <div style={{ height: 190 }} role="img" aria-label={`Marge brute par mois : ${chart.map((c) => `${c.libelle} ${eur0(c.v)}`).join(", ")}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart} margin={{ top: 18, right: 0, bottom: 0, left: 0 }} barCategoryGap="18%">
                      <XAxis dataKey="libelle" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 10.5, fill: "oklch(0.52 0.02 255)" }} />
                      <Tooltip cursor={{ fill: "oklch(0.96 0.01 258)" }} formatter={(v: number) => [eur0(v), "Marge brute"]}
                        contentStyle={{ borderRadius: 9, border: `1px solid ${BORD}`, fontSize: 12 }} />
                      <Bar dataKey="v" radius={[6, 6, 3, 3]} maxBarSize={38} isAnimationActive={false}>
                        {chart.map((c) => <Cell key={c.mois} fill={c.courant ? "oklch(0.46 0.12 152)" : "oklch(0.84 0.06 152)"} />)}
                        <LabelList dataKey="v" position="top" formatter={(v: number) => `${nombre(Math.round(v / 100) / 10, 1)}k`}
                          style={{ fontSize: 10, fontFamily: "var(--f-mono)", fill: "oklch(0.44 0.02 255)" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ ...carte, display: "flex", flexDirection: "column", gap: 11 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Rentabilité par type de panne</h3>
                {rent.length === 0 && <span data-muted="1" style={{ fontSize: 12.5, color: "var(--c-muted)" }}>Aucun dossier clôturé sur la période.</span>}
                {rent.map((r) => (
                  <div key={r.label} style={{ display: "flex", flexDirection: "column", gap: 7, padding: "10px 11px", borderRadius: 10, border: "1px solid oklch(0.95 0.006 258)", background: "oklch(0.985 0.003 258)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "oklch(0.28 0.02 255)" }}>{r.label}</span>
                      <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.50 0.02 255)" }}>{r.dossiers} dossier{r.dossiers > 1 ? "s" : ""}</span>
                      <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: VERT_FONCE }}>+ {eur0(r.marge)}</span>
                    </div>
                    <div aria-hidden="true" style={{ height: 4, borderRadius: 99, background: "oklch(0.94 0.006 258)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.max(2, (Number(r.marge) / maxRent) * 100)}%`, background: "oklch(0.70 0.09 152)", borderRadius: 99 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Export */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: 17, borderRadius: 14, background: "oklch(0.21 0.025 258)", color: "#fff" }}>
              <div style={{ flex: 1, minWidth: 210, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Exporter le rapport</span>
                <span style={{ fontSize: 12, color: "oklch(0.76 0.02 258)" }}>Période : {data.periode.libelle} · 6 indicateurs · graphiques inclus</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                {([["PDF", "⤓", "PDF"], ["CSV", "▤", "CSV"], ["envoi", "✉", "Programmer l'envoi"]] as const).map(([cle, icone, lib], i) => (
                  <button key={cle} onClick={() => exporter(cle)} disabled={enCours !== null} aria-busy={enCours === cle}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, opacity: enCours && enCours !== cle ? 0.6 : 1, ...(i === 0 ? { background: "#fff", color: "oklch(0.24 0.02 255)" } : { background: "oklch(0.28 0.03 258)", color: "#fff", border: "1px solid oklch(0.36 0.03 258)" }) }}>
                    <span aria-hidden="true">{enCours === cle ? "…" : icone}</span>
                    <span>{lib}</span>
                  </button>
                ))}
              </div>
            </div>
            {perso && (
              <span data-tiny="1" data-muted="1" style={{ fontSize: 11.5, color: "var(--c-muted)", marginTop: -6 }}>
                L'envoi programmé porte sur la période « {PERIODES.find((p) => p.k === periode)?.l} » ; les exports PDF et CSV reprennent la période personnalisée.
              </span>
            )}
            {errExport && <Alerte>{errExport.message}</Alerte>}
            {export_ && (
              <div role="status" style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderRadius: 11, background: "oklch(0.965 0.03 152)", border: "1px solid oklch(0.86 0.06 152)" }}>
                <span aria-hidden="true" style={{ color: "oklch(0.38 0.11 152)", fontWeight: 700 }}>✓</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: VERT_FONCE }}>{export_}</span>
              </div>
            )}
          </>
        )}
      </Etat>

      <Fiabilite />
    </div>
  );
}

function indicateurs(d: S["RapportOut"]) {
  const SOMBRE = "oklch(0.24 0.02 255)";
  const NEUTRE = "oklch(0.46 0.02 255)";
  const vs = (k: S["KpiOut"]) => (k.delta_pct === null ? "— vs période précédente" : `${delta(k.delta_pct)} vs période précédente`);
  const delai = d.delai_moyen_j.valeur;
  const retour = d.taux_retour_pct.valeur;
  return [
    { label: "Chiffre d'affaires", value: eur0(d.ca.valeur ?? 0), delta: vs(d.ca), color: SOMBRE, deltaColor: couleurDelta(d.ca.delta_pct) },
    { label: "Marge brute", value: eur0(d.marge_brute.valeur ?? 0), delta: vs(d.marge_brute), color: VERT_FONCE, deltaColor: couleurDelta(d.marge_brute.delta_pct) },
    { label: "Réparations", value: nombre(d.reparations.valeur ?? 0), delta: vs(d.reparations), color: SOMBRE, deltaColor: couleurDelta(d.reparations.delta_pct) },
    {
      label: "Délai moyen", value: delai === null ? "—" : `${nombre(delai, 1)} j`,
      delta: `${d.delai_moyen_j.delta_pct === null ? "—" : delta(d.delai_moyen_j.delta_pct)} · objectif 2 j`,
      color: SOMBRE, deltaColor: couleurDelta(d.delai_moyen_j.delta_pct, false),
    },
    {
      label: "Taux de retour", value: retour === null ? "—" : `${nombre(retour, 1)} %`,
      delta: retour !== null && retour > 5 ? "au-dessus du seuil de 5 %" : "sous le seuil de 5 %",
      color: SOMBRE, deltaColor: retour !== null && retour > 5 ? "var(--c-danger-text)" : NEUTRE,
    },
    { label: "Panier moyen", value: eur0(d.panier_moyen.valeur ?? 0), delta: "par dossier clôturé", color: SOMBRE, deltaColor: NEUTRE },
  ];
}
