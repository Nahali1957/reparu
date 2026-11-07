import { useEffect, useState, type CSSProperties } from "react";
import { Bar, BarChart, Cell, Tooltip, YAxis } from "recharts";
import { api, toApiError, type S } from "../api/client";
import Etat from "../components/Etat";
import { Alerte } from "../components/ui";
import { Badge, GREEN, NEUTRAL, ORANGE, btnSecondaire, type Palette } from "../components/stocks/commun";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { date, dateHeure, dateHeureLongue, heure } from "../utils/format";

type Capteur = S["CapteurOut"];
type Anomalie = S["AnomalieOut"];

const RAFRAICHISSEMENT_MS = 30_000;

/** « toutes les 6 h », « toutes les 2 min », d'après la période réelle de remontée du simulateur. */
function frequence(s: number): string {
  if (s >= 3600 && s % 3600 === 0) return `toutes les ${s / 3600} h`;
  if (s >= 60 && s % 60 === 0) return `toutes les ${s / 60} min`;
  return `toutes les ${s} s`;
}

const STATUT_CAPTEUR: Record<string, { m: Palette; icon: string; dot: string }> = {
  OK: { m: GREEN, icon: "●", dot: "oklch(0.55 0.13 152)" },
  "Écart": { m: ORANGE, icon: "▲", dot: "oklch(0.62 0.14 62)" },
  Muet: { m: ORANGE, icon: "◌", dot: "oklch(0.62 0.14 62)" },
  Inactif: { m: NEUTRAL, icon: "○", dot: "oklch(0.70 0.01 258)" },
};

const TYPE_ANOMALIE: Record<string, string> = {
  ecart_stock: "écart de stock",
  capteur_muet: "capteur muet",
  variation_incoherente: "variation incohérente",
};

export default function Capteurs() {
  const { can } = useAuth();
  const toast = useToast();
  const iot = useApi<S["IotOut"]>("/iot");
  const [maj, setMaj] = useState(() => new Date());
  const [rafraichit, setRafraichit] = useState(false);
  const [errRafr, setErrRafr] = useState<string | null>(null);
  const { reload, setData } = iot;

  useEffect(() => {
    const t = setInterval(() => {
      void reload().then(() => setMaj(new Date()));
    }, RAFRAICHISSEMENT_MS);
    return () => clearInterval(t);
  }, [reload]);

  const rafraichir = async () => {
    setRafraichit(true);
    setErrRafr(null);
    try {
      const r = await api.post<S["IotOut"]>("/iot/rapprocher");
      setData(r.data);
      setMaj(new Date());
    } catch (e) {
      setErrRafr(toApiError(e).message);
    } finally {
      setRafraichit(false);
    }
  };

  const d = iot.data;
  const capteurParCode = new Map((d?.capteurs ?? []).map((c) => [c.code, c]));

  const kpis = d
    ? [
      { label: "Capteurs actifs", icon: "◉", value: `${d.capteurs_actifs}/${d.capteurs_total}`, sub: "MQTT sécurisé (TLS)", color: "oklch(0.24 0.02 255)", border: "var(--c-border)" },
      { label: "Anomalies ouvertes", icon: "▲", value: String(d.anomalies_ouvertes), sub: "à vérifier par l'administrateur", color: "oklch(0.44 0.13 62)", border: "oklch(0.88 0.07 70)" },
      { label: "Dernière remontée", icon: "◷", value: d.derniere_remontee ? heure(d.derniere_remontee) : "—", sub: `${d.derniere_remontee ? date(d.derniere_remontee) : "aucune lecture"} · ${frequence(d.periode_s)}`, color: "oklch(0.24 0.02 255)", border: "var(--c-border)" },
    ]
    : [];

  return (
    <Etat etat={iot.etat} meta={SCREENS.iot} error={iot.error} onRetry={reload}>
      {d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <style>{"@keyframes pulseDot { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }"}</style>
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
            <span data-tiny="1" className="mono" aria-live="polite" style={{ fontSize: 11, color: "var(--c-muted-2)" }}>
              Mis à jour à {maj.toLocaleTimeString("fr-FR")} · actualisation auto toutes les 30 s
            </span>
            <button onClick={() => void rafraichir()} disabled={rafraichit} style={btnSecondaire} aria-busy={rafraichit}>
              <span aria-hidden="true">↻</span>
              <span>{rafraichit ? "Rapprochement…" : "Rafraîchir"}</span>
            </button>
          </div>
          {errRafr && <Alerte>{errRafr}</Alerte>}
          {iot.error && iot.etat === "nominal" && <Alerte ton="warn">Actualisation impossible : {iot.error.message}</Alerte>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 12 }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 15, borderRadius: 13, background: "#fff", border: `1px solid ${k.border}` }}>
                <span className="mono" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--c-muted)" }}>
                  <span aria-hidden="true">{k.icon}</span>{k.label}
                </span>
                <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: k.color }}>{k.value}</span>
                <span data-tiny="1" style={{ fontSize: 11, color: "var(--c-muted)" }}>{k.sub}</span>
              </div>
            ))}
          </div>

          {d.anomalies.length === 0 ? (
            <Alerte ton="ok">✓ Aucune anomalie ouverte : les niveaux lus par les capteurs concordent avec le stock comptable.</Alerte>
          ) : (
            d.anomalies.map((a) => (
              <CarteAnomalie key={a.id} a={a} capteur={a.capteur ? capteurParCode.get(a.capteur) : undefined} peutCorriger={can("stocks.ecrire")}
                onTraitee={(texte) => { toast(texte, "ok"); void reload(); }} />
            ))
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {d.capteurs.length === 0 && (
              <div data-muted="1" style={{ padding: "26px 14px", textAlign: "center", fontSize: 13, color: "var(--c-muted)", border: "1px dashed var(--c-border-7)", borderRadius: 14, background: "#fff" }}>
                Aucun capteur enregistré.
              </div>
            )}
            {d.capteurs.map((c) => <CarteCapteur key={c.id} c={c} />)}
          </div>
          <span data-tiny="1" style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--c-muted)" }}>
            Les lectures capteurs alimentent la prévision mais ne remplacent jamais le stock comptable : toute correction passe par un mouvement tracé et nominatif.
          </span>
        </div>
      )}
    </Etat>
  );
}

function CarteAnomalie({ a, capteur, peutCorriger, onTraitee }: { a: Anomalie; capteur?: Capteur; peutCorriger: boolean; onTraitee: (texte: string) => void }) {
  const [recompte, setRecompte] = useState(String(a.niveau_lu ?? a.stock_comptable ?? 0));
  const [motif, setMotif] = useState("Recomptage après anomalie capteur");
  const [busy, setBusy] = useState<"corriger" | "ignorer" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(recompte);
  const invalide = recompte === "" || !Number.isInteger(n) || n < 0 || motif.trim().length < 3;

  const agir = async (action: "corriger" | "ignorer") => {
    setBusy(action);
    setErr(null);
    try {
      const r = action === "corriger"
        ? await api.post<Anomalie>(`/iot/anomalies/${a.id}/corriger`, { recompte: n, motif: motif.trim() })
        : await api.post<Anomalie>(`/iot/anomalies/${a.id}/ignorer`);
      if (action === "ignorer") onTraitee("Anomalie classée faux positif (journalisé).");
      else if (r.data.statut === "faux_positif") onTraitee("Recomptage conforme au stock comptable : anomalie classée faux positif.");
      else onTraitee("Stock corrigé et mouvement tracé (source : saisie manuelle après vérification).");
    } catch (e) {
      setErr(toApiError(e).message);
      setBusy(null);
    }
  };

  const piece = capteur?.piece ?? "—";
  const fixActif = peutCorriger && !invalide && busy === null;

  return (
    <section aria-label={`Anomalie ${piece}`} style={{ display: "flex", flexDirection: "column", gap: 13, padding: 17, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.86 0.09 70)", borderLeft: "4px solid oklch(0.62 0.14 62)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 11, alignItems: "center" }}>
        <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, background: ORANGE.bg, color: "oklch(0.46 0.13 62)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>▲</span>
        <span style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>Anomalie détectée — {piece}</span>
          <span data-muted="1" style={{ fontSize: 12, color: "var(--c-text-8)" }}>
            {capteur?.emplacement ?? "—"} · capteur <span className="mono">{a.capteur ?? "—"}</span> · détectée le {dateHeureLongue(a.detectee_le)}
          </span>
        </span>
        <Badge m={ORANGE} size="m">{TYPE_ANOMALIE[a.type] ?? a.type.replace(/_/g, " ")}</Badge>
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--c-text-5)", textWrap: "pretty" } as CSSProperties}>
        {a.message} Le stock affiché <strong>n'a pas été modifié automatiquement</strong> : un recomptage humain est requis.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9, alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-4)" }}>Quantité recomptée</span>
          <input type="number" min={0} step={1} value={recompte} onChange={(e) => setRecompte(e.target.value)} disabled={!peutCorriger}
            aria-invalid={recompte !== "" && (!Number.isInteger(n) || n < 0)}
            style={{ width: 110, padding: "10px 12px", borderRadius: 9, border: "1.5px solid oklch(0.80 0.06 258)", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 220px", maxWidth: 360 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-4)" }}>Motif</span>
          <input className="input" value={motif} onChange={(e) => setMotif(e.target.value)} disabled={!peutCorriger} maxLength={200} />
        </label>
        <button onClick={() => void agir("corriger")} disabled={!fixActif}
          title={peutCorriger ? undefined : "Correction de stock réservée à l'administrateur et au responsable"}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 17px", borderRadius: 10, fontSize: 13, fontWeight: 700,
            ...(fixActif || busy === "corriger" ? { background: "var(--c-primary)", color: "#fff" } : { background: "oklch(0.97 0.004 258)", color: "oklch(0.68 0.01 258)", border: "1px solid oklch(0.93 0.008 258)" }) }}>
          <span aria-hidden="true">✓</span>
          <span>{busy === "corriger" ? "Correction…" : "Vérifier et corriger le stock"}</span>
        </button>
        <button onClick={() => void agir("ignorer")} disabled={busy !== null}
          style={{ padding: "12px 15px", borderRadius: 10, border: "1px solid var(--c-border-2)", background: "#fff", fontSize: 13, fontWeight: 600, color: "var(--c-text-5)" }}>
          {busy === "ignorer" ? "…" : "Ignorer (faux positif)"}
        </button>
      </div>
      {a.stock_comptable !== null && (
        <span data-tiny="1" style={{ fontSize: 11.5, color: "var(--c-muted)" }}>
          Stock comptable : <strong className="mono">{a.stock_comptable}</strong>
          {a.niveau_lu !== null && <> · niveau lu : <strong className="mono">{a.niveau_lu}</strong></>}
          {Number.isInteger(n) && a.stock_comptable !== null && recompte !== "" && <> · mouvement qui sera tracé : <strong className="mono">{n - a.stock_comptable > 0 ? "+" : ""}{n - a.stock_comptable}</strong></>}
        </span>
      )}
      {err && <Alerte>{err}</Alerte>}
    </section>
  );
}

function CarteCapteur({ c }: { c: Capteur }) {
  const st = STATUT_CAPTEUR[c.statut] ?? STATUT_CAPTEUR.Inactif;
  const alerte = c.statut !== "OK";
  const points = c.historique.map((p) => ({ le: p.le, niveau: p.niveau }));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: "15px 17px", borderRadius: 14, background: "#fff", border: `1px solid ${c.statut === "Écart" ? "oklch(0.88 0.07 70)" : "var(--c-border)"}` }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 210, flex: 1 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", flex: "0 0 auto", background: st.dot, animation: c.statut === "Inactif" ? undefined : "pulseDot 2.4s ease-in-out infinite" }} />
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.35, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{c.piece}</span>
          <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.48 0.02 255)" }}>{c.emplacement}</span>
        </span>
      </span>
      <span role="img" aria-label={`Historique des niveaux lus (${points.length} lectures)`} style={{ display: "flex", alignItems: "flex-end", height: 38 }}>
        {points.length > 0 ? (
          <BarChart width={Math.max(60, Math.min(200, points.length * 7))} height={38} data={points} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap={1}>
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip cursor={false} isAnimationActive={false}
              formatter={(v) => [`${v} unités`, "Niveau lu"]} labelFormatter={(_, p) => (p?.[0] ? dateHeure((p[0].payload as { le: string }).le) : "")}
              contentStyle={{ fontSize: 11.5, borderRadius: 8, padding: "5px 8px" }} />
            <Bar dataKey="niveau" radius={[2, 2, 0, 0]} isAnimationActive={false} minPointSize={3}>
              {points.map((_, i) => (
                <Cell key={i} fill={alerte && i === points.length - 1 ? "oklch(0.62 0.14 62)" : "oklch(0.78 0.05 258)"} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <span data-tiny="1" style={{ fontSize: 11, color: "var(--c-muted)" }}>aucune lecture</span>
        )}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 110 }}>
        <span data-tiny="1" className="mono" style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--c-muted-2)" }}>Stock comptable</span>
        <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.stock_comptable} unités</span>
        <span data-tiny="1" className="mono" style={{ fontSize: 10.5, color: c.ecart ? "oklch(0.44 0.13 62)" : "var(--c-muted-2)", fontWeight: c.ecart ? 700 : 400 }}>
          {c.ecart === null ? "écart : —" : `écart : ${c.ecart}`}
        </span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 110 }}>
        <span data-tiny="1" className="mono" style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--c-muted-2)" }}>Dernière lecture</span>
        <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.dernier_niveau === null ? "—" : `${c.dernier_niveau} unités`}</span>
        <span data-tiny="1" className="mono" style={{ fontSize: 10.5, color: "var(--c-muted-2)" }}>{dateHeure(c.derniere_lecture_le)}</span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", minWidth: 90 }}>
        <Badge m={st.m} icon={st.icon}>{c.statut}</Badge>
        <span data-tiny="1" className="mono" style={{ fontSize: 10.5, color: "var(--c-muted-2)" }}>{c.code}</span>
      </span>
    </div>
  );
}
