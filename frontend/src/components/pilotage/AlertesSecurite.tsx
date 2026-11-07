import { useState } from "react";
import { api, toApiError, type ApiError, type S } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { useToast } from "../../hooks/useToast";
import { dateHeure, nombre } from "../../utils/format";
import { Alerte, Pastille, type Ton } from "../ui";

/** Encart « Alertes IA de sécurité » de 5.12 (détection d'anomalies sur le journal d'audit, M7). */

type AlerteSec = S["AlerteSecuriteOut"];

const TYPES: Record<string, string> = {
  brute_force: "Force brute",
  bourrage_identifiants: "Bourrage d'identifiants",
  refus_repetes: "Accès refusés répétés",
  export_massif: "Exports massifs",
  horaire_inhabituel: "Horaire inhabituel",
  comportement_inhabituel: "Comportement inhabituel",
};
const STATUTS: Record<string, { l: string; ton: Ton; i: string }> = {
  ouverte: { l: "Ouverte", ton: "warn", i: "▲" },
  corrigee: { l: "Traitée", ton: "ok", i: "✓" },
  faux_positif: { l: "Faux positif", ton: "neutral", i: "○" },
};
const BORD = "oklch(0.91 0.008 258)";

export default function AlertesSecurite({ onChange }: { onChange?: () => void }) {
  const { data, setData, etat, error, reload } = useApi<AlerteSec[]>("/securite/alertes?limit=20");
  const toast = useToast();
  const [analyse, setAnalyse] = useState(false);
  const [enCours, setEnCours] = useState<number | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);

  const analyser = async () => {
    setAnalyse(true);
    setErr(null);
    const avant = new Set((data ?? []).map((a) => a.id));
    try {
      const r = await api.post<AlerteSec[]>("/securite/analyser", undefined, { timeout: 60_000 });
      setData(r.data);
      const n = r.data.filter((a) => !avant.has(a.id)).length;
      toast(n ? `${n} nouvelle${n > 1 ? "s" : ""} alerte${n > 1 ? "s" : ""} détectée${n > 1 ? "s" : ""}.` : "Analyse terminée : aucune nouvelle anomalie.", n ? "info" : "ok");
      onChange?.();
    } catch (e) {
      setErr(toApiError(e));
    } finally {
      setAnalyse(false);
    }
  };

  const classer = async (a: AlerteSec, decision: "traitee" | "faux-positif") => {
    setEnCours(a.id);
    setErr(null);
    try {
      const r = await api.post<AlerteSec>(`/securite/alertes/${a.id}/${decision}`);
      setData((l) => (l ?? []).map((x) => (x.id === a.id ? r.data : x)));
      onChange?.();
    } catch (e) {
      setErr(toApiError(e));
    } finally {
      setEnCours(null);
    }
  };

  const ouvertes = (data ?? []).filter((a) => a.statut === "ouverte").length;

  return (
    <section aria-labelledby="titre-alertes-ia" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 14, background: "#fff", border: `1px solid ${BORD}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 220 }}>
          <h3 id="titre-alertes-ia" style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Alertes IA de sécurité</h3>
          <span data-tiny="1" data-muted="1" style={{ fontSize: 11.5, color: "var(--c-muted)" }}>
            Détection d'anomalies sur le journal d'audit · analyse automatique chaque minute{data ? ` · ${ouvertes} ouverte${ouvertes > 1 ? "s" : ""}` : ""}
          </span>
        </div>
        <button className="btn btn-ia" onClick={analyser} disabled={analyse} aria-busy={analyse} style={{ padding: "9px 14px", fontSize: 12.5, opacity: analyse ? 0.7 : 1 }}>
          <span aria-hidden="true">{analyse ? "…" : "◎"}</span>
          <span>{analyse ? "Analyse en cours…" : "Analyser maintenant"}</span>
        </button>
      </div>

      {err && <Alerte>{err.message}</Alerte>}
      {etat === "loading" && [0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 54, borderRadius: 10 }} />)}
      {etat === "error" && (
        <Alerte>Impossible de charger les alertes. {error?.message} <button onClick={reload} style={{ textDecoration: "underline", fontWeight: 700, color: "inherit" }}>Réessayer</button></Alerte>
      )}
      {data?.length === 0 && <span data-muted="1" style={{ fontSize: 12.5, color: "var(--c-muted)" }}>Aucune alerte de sécurité : aucun comportement atypique détecté.</span>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 460, overflowY: "auto" }}>
        {data?.map((a) => {
          const st = STATUTS[a.statut] ?? { l: a.statut, ton: "neutral" as Ton, i: "•" };
          const ouverte = a.statut === "ouverte";
          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 12px", borderRadius: 10, border: `1px solid ${ouverte ? "var(--c-ia-border)" : "oklch(0.955 0.006 258)"}`, background: ouverte ? "var(--c-ia-bg)" : "oklch(0.985 0.003 258)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 240 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--c-ia-text)", fontWeight: 600 }}>{TYPES[a.type] ?? a.type}</span>
                  <Pastille ton={st.ton} icon={st.i}>{st.l}</Pastille>
                </span>
                <span style={{ fontSize: 12.5, color: "oklch(0.30 0.02 255)" }}>{a.message}</span>
                <span data-tiny="1" className="mono" style={{ fontSize: 10.5, color: "oklch(0.50 0.02 255)" }}>
                  {dateHeure(a.detectee_le)} · modèle {a.modele_version ?? "—"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 92 }} title="Score d'anomalie (0 = habituel, 1 = très atypique)">
                <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{a.score === null ? "—" : nombre(a.score, 2)}</span>
                <span aria-hidden="true" style={{ width: 80, height: 4, borderRadius: 99, background: "oklch(0.93 0.01 292)", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${(a.score ?? 0) * 100}%`, background: "var(--c-ia-solid)" }} />
                </span>
                <span data-tiny="1" style={{ fontSize: 10.5, color: "oklch(0.50 0.02 255)" }}>score d'anomalie</span>
              </div>
              {ouverte && (
                <div style={{ display: "flex", gap: 7 }}>
                  <button onClick={() => classer(a, "traitee")} disabled={enCours === a.id} aria-label={`Marquer l'alerte « ${a.message} » comme traitée`}
                    style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "1px solid oklch(0.84 0.06 152)", background: "oklch(0.98 0.015 152)", color: "oklch(0.36 0.10 152)" }}>
                    ✓ Traitée
                  </button>
                  <button onClick={() => classer(a, "faux-positif")} disabled={enCours === a.id} aria-label={`Classer l'alerte « ${a.message} » en faux positif`}
                    style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid oklch(0.89 0.008 258)", background: "#fff", color: "oklch(0.36 0.02 255)" }}>
                    Faux positif
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
