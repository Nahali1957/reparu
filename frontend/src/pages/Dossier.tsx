import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, telecharger, toApiError, type S } from "../api/client";
import Etat from "../components/Etat";
import { Alerte, ConfianceChip, niveauConfiance, Pastille, PrioriteChip, STATUTS, StatutChip, StockChip, statutInfo, type Ton } from "../components/ui";
import {
  carte, h3, libellePhoto, lireNombre, ModaleAffectation, ModalePhoto, ModalePiece, petit, PhotoAgrandie, TYPES_PHOTO, versSaisie, Vignette,
  type Dossier as DossierT,
} from "../components/dossier/parts";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { dateHeure, eur } from "../utils/format";

/* 5.4 Dossier de réparation (maquette Repar-Coeur, partie « dossier »). */

interface PieceSuggeree { piece_id: number; designation: string; stock: number; statut: string }
interface Hypothese { code: string; label: string; score: number; pieces: PieceSuggeree[]; manque: string | null }

const TEINTE: Record<Ton, string> = {
  primary: "var(--c-primary)", ia: "var(--c-ia-solid)", warn: "var(--c-warn-solid)", ok: "var(--c-ok-solid)", neutral: "var(--c-muted-3)", danger: "var(--c-danger-solid)",
};
const TEXTE: Record<Ton, string> = {
  primary: "var(--c-primary-text)", ia: "var(--c-ia-text)", warn: "var(--c-warn-text)", ok: "var(--c-ok-text)", neutral: "var(--c-neutral-text)", danger: "var(--c-danger-text)",
};
const CONF_FG = { haute: "oklch(0.36 0.10 152)", moyenne: "oklch(0.42 0.11 62)", "indéterminée": "oklch(0.40 0.02 255)" } as const;

const initiales = (s: string) => s.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));
const fr = (v: number, d = 2) => v.toLocaleString("fr-FR", { maximumFractionDigits: d });
const dureeChrono = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;

const navBtn = (on: boolean, accent: boolean): CSSProperties => ({
  display: "flex", alignItems: "center", gap: 7, padding: "10px 13px", borderRadius: 9, fontSize: 12.5, fontWeight: 700,
  border: `1px solid ${on ? (accent ? "oklch(0.80 0.06 258)" : "oklch(0.89 0.008 258)") : "oklch(0.94 0.006 258)"}`,
  background: on ? (accent ? "oklch(0.52 0.15 258)" : "#fff") : "oklch(0.98 0.003 258)",
  color: on ? (accent ? "#fff" : "oklch(0.34 0.02 255)") : "oklch(0.78 0.008 258)",
});
const quickBtn = (accent: boolean): CSSProperties => ({
  display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: accent ? 700 : 600,
  border: `1px solid ${accent ? "oklch(0.80 0.06 258)" : "oklch(0.90 0.008 258)"}`, background: accent ? "oklch(0.96 0.025 258)" : "#fff",
  color: accent ? "oklch(0.36 0.12 258)" : "oklch(0.34 0.02 255)",
});
const tagIA: CSSProperties = { fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: ".06em", textTransform: "uppercase", color: "oklch(0.45 0.05 195)" };
const tagRetenu: CSSProperties = { fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: ".06em", textTransform: "uppercase", color: "oklch(0.44 0.10 258)" };
const champRetenu = (invalide: boolean, lecture = false): CSSProperties => ({
  width: "100%", padding: "9px 10px", borderRadius: 9, border: `1.5px solid ${invalide ? "var(--c-danger-input)" : "oklch(0.72 0.08 258)"}`,
  fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", background: lecture ? "var(--c-surface-3)" : "#fff",
});

const DEVIS: Record<string, { label: string; icon: string; ton: Ton }> = {
  emis: { label: "En attente client", icon: "◷", ton: "warn" },
  accepte: { label: "Accepté", icon: "✓", ton: "ok" },
  refuse: { label: "Refusé", icon: "✕", ton: "danger" },
};

export default function Dossier() {
  const { numero = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const url = `/reparations/${encodeURIComponent(numero)}`;
  const { data: d, setData, etat, error, reload } = useApi<DossierT>(url);
  const inventaire = useApi<S["InventaireOut"]>(can("stocks.lire") ? "/pieces" : null);

  /* ---------------- actions : chaque réponse remplace le dossier local */
  const [busy, setBusy] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string | null>>({});
  const setErreur = (cle: string, msg: string | null) => setErreurs((e) => ({ ...e, [cle]: msg }));

  const executer = useCallback(
    async (cle: string, fn: () => Promise<{ data: DossierT }>, ok?: string): Promise<DossierT | null> => {
      setBusy(cle);
      setErreurs((e) => ({ ...e, [cle]: null }));
      try {
        const r = await fn();
        setData(r.data);
        if (ok) toast(ok, "ok");
        return r.data;
      } catch (e) {
        setErreurs((x) => ({ ...x, [cle]: toApiError(e).message }));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [setData, toast],
  );

  /* ---------------- chronomètre : temps cumulé serveur + temps écoulé depuis la réception de la réponse */
  const recuA = useMemo(() => Date.now(), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, tick] = useState(0);
  useEffect(() => {
    if (!d?.chrono_depuis) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [d?.chrono_depuis]);

  /* ---------------- symptômes */
  const [symptomes, setSymptomes] = useState("");
  useEffect(() => setSymptomes(d?.symptomes_texte ?? ""), [d?.symptomes_texte]);
  const symptomesModifies = !!d && symptomes.trim() !== d.symptomes_texte.trim();
  const enregistrerSymptomes = async () => {
    if (!d || !symptomesModifies) return true;
    if (symptomes.trim().length < 15) {
      setErreur("symptomes", "Décrivez les symptômes en 15 caractères au moins.");
      return false;
    }
    return !!(await executer("symptomes", () => api.patch(url, { symptomes_texte: symptomes.trim() })));
  };

  /* ---------------- diagnostic assisté */
  const [historisees, setHistorisees] = useState<number | null>(null);
  const lancerDiagnostic = async () => {
    if (!(await enregistrerSymptomes())) return;
    setBusy("diag");
    setErreur("diag", null);
    try {
      const r = await api.post<S["DiagnosticOut"]>("/ia/diagnostic", { reparation: numero });
      setHistorisees(r.data.historique_interventions);
      const f = await api.get<DossierT>(url);
      setData(f.data);
    } catch (e) {
      setErreur("diag", toApiError(e).message);
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- valeur retenue (formulaire local resynchronisé sur les valeurs serveur) */
  const [diag, setDiag] = useState("");
  const [cout, setCout] = useState("");
  const [prix, setPrix] = useState("");
  const [duree, setDuree] = useState("");
  useEffect(() => {
    if (!d) return;
    setDiag(d.diagnostic_final ?? "");
    setCout(versSaisie(d.cout_pieces_retenu));
    setPrix(versSaisie(d.prix_retenu_ht));
    setDuree(d.duree_estimee_min == null ? "" : String(d.duree_estimee_min));
  }, [d?.diagnostic_final, d?.cout_pieces_retenu, d?.prix_retenu_ht, d?.duree_estimee_min]); // eslint-disable-line react-hooks/exhaustive-deps

  const coutN = lireNombre(cout);
  const prixN = lireNombre(prix);
  const dureeN = duree.trim() === "" ? null : /^\d+$/.test(duree.trim()) ? Number(duree.trim()) : NaN;
  const dureeInvalide = dureeN !== null && (Number.isNaN(dureeN) || dureeN < 5 || dureeN > 1440);
  const formInvalide = Number.isNaN(coutN) || Number.isNaN(prixN) || dureeInvalide;

  const changements = useMemo(() => {
    if (!d) return {};
    const c: Record<string, unknown> = {};
    if (diag.trim() !== (d.diagnostic_final ?? "").trim()) c.diagnostic_final = diag.trim();
    if (coutN !== null && !Number.isNaN(coutN) && coutN !== num(d.cout_pieces_retenu)) c.cout_pieces_retenu = coutN;
    if (prixN !== null && !Number.isNaN(prixN) && prixN !== num(d.prix_retenu_ht)) c.prix_retenu_ht = prixN;
    if (dureeN !== null && !dureeInvalide && dureeN !== d.duree_estimee_min) c.duree_estimee_min = dureeN;
    return c;
  }, [d, diag, coutN, prixN, dureeN, dureeInvalide]);
  const modifie = Object.keys(changements).length > 0;

  const enregistrer = async (silencieux = false) => {
    if (formInvalide) {
      setErreur("valeur", "Corrigez les valeurs saisies : montants en euros (ex. 48,50), durée entre 5 et 1 440 minutes.");
      return false;
    }
    if (!modifie) {
      if (!silencieux) toast("Aucune modification à enregistrer.");
      return true;
    }
    return !!(await executer("valeur", () => api.patch(url, changements), silencieux ? undefined : "Dossier enregistré."));
  };

  const editerDevis = async () => {
    if (!(await enregistrer(true))) return;
    setBusy("devis");
    setErreur("valeur", null);
    try {
      await api.post(`${url}/devis`);
      navigate(`${url}/facture`);
    } catch (e) {
      setErreur("valeur", toApiError(e).message);
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- modales */
  const [modale, setModale] = useState<null | "photo" | "affecter" | "piece">(null);
  const [typePhoto, setTypePhoto] = useState("etat_general");
  const [photoOuverte, setPhotoOuverte] = useState<S["PhotoOut"] | null>(null);

  return (
    <Etat etat={etat} meta={SCREENS.dossier} error={error} onRetry={reload}>
      {d && (() => {
        const clos = d.statut === "livre";
        const idx = STATUTS.findIndex((s) => s.key === d.statut);
        const prev = STATUTS[idx - 1];
        const next = STATUTS[idx + 1];
        const tPrev = prev && d.transitions.find((t) => t.statut === prev.key);
        const tNext = next && d.transitions.find((t) => t.statut === next.key);
        const prevOk = !!tPrev?.possible;
        const nextOk = !!tNext?.possible;
        const raisons = [!prevOk && tPrev?.raison, !nextOk && tNext?.raison].filter(Boolean) as string[];
        const changerStatut = (cible: string) =>
          executer("statut", () => api.post(`${url}/statut`, { statut: cible }), `Dossier ${d.numero} passé au statut « ${statutInfo(cible).label} ».`);

        const minutes = d.temps_passe_min + (d.chrono_depuis ? Math.floor((Date.now() - recuA) / 60000) : 0);
        const sugg = d.suggestion;
        const pannes = (sugg?.pannes ?? []) as unknown as Hypothese[];
        const suggereesIds = pannes[0]?.pieces.map((p) => p.piece_id) ?? [];
        const stockDe = (id: number) => inventaire.data?.pieces.find((p) => p.id === id);

        const appliquerSuggestion = () => {
          const top = pannes[0];
          if (!top || !sugg) return;
          const body: Record<string, unknown> = { panne_code: top.code, diagnostic_final: top.label };
          if (sugg.cout != null) body.cout_pieces_retenu = Number(sugg.cout);
          if (sugg.prix != null) body.prix_retenu_ht = Number(sugg.prix);
          if (sugg.duree_min != null) body.duree_estimee_min = sugg.duree_min;
          void executer("valeur", () => api.patch(url, body), "Hypothèse reprise dans le diagnostic final : vérifiez puis ajustez la valeur retenue.");
        };

        const marge = prixN !== null && !Number.isNaN(prixN) ? prixN - (coutN !== null && !Number.isNaN(coutN) ? coutN : 0) : null;
        const tonMarge = marge === null
          ? { bg: "oklch(0.96 0.005 258)", bd: "oklch(0.90 0.008 258)", fg: "oklch(0.42 0.02 255)", lb: "oklch(0.46 0.02 255)", t: "En attente" }
          : marge < 0
            ? { bg: "oklch(0.96 0.04 25)", bd: "oklch(0.86 0.08 25)", fg: "oklch(0.40 0.15 25)", lb: "oklch(0.44 0.14 25)", t: "Perte calculée" }
            : { bg: "oklch(0.965 0.03 152)", bd: "oklch(0.86 0.06 152)", fg: "oklch(0.34 0.10 152)", lb: "oklch(0.38 0.08 152)", t: "Marge calculée" };

        const faites = d.checklist.filter((e) => e.faite).length;
        const totalEtapes = d.checklist.length || 5;
        const m = d.montants;
        const devis = d.devis_statut ? DEVIS[d.devis_statut] : null;

        const photosParType = (t: string) => d.photos.filter((p) => p.type === t);
        const slots = ["etat_general", "zone_endommagee", "apres_intervention"].map((t) => {
          const ps = photosParType(t);
          return { type: t, photo: ps[ps.length - 1] };
        });
        const autres = d.photos.filter((p) => !slots.some((s) => s.photo?.id === p.id));

        const affecter = () => (can("planning") ? setModale("affecter") : navigate("/planning"));

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {/* ------------------------------------------------ en-tête */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px", borderRadius: 14, background: "#fff", border: "1px solid var(--c-border)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200, flex: 1 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{d.numero}</span>
                    <StatutChip statut={d.statut} />
                    <PrioriteChip priorite={d.priorite} />
                  </span>
                  <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: "-0.015em" }}>
                    {d.appareil.marque} {d.appareil.modele}
                    {d.appareil.couleur && <span data-muted="1" style={{ fontSize: 13, fontWeight: 500, color: "var(--c-muted)", marginLeft: 8 }}>{d.appareil.couleur}</span>}
                  </h2>
                  <span data-muted="1" style={{ fontSize: 12.5, color: "oklch(0.46 0.02 255)" }}>
                    IMEI <span className="mono">{d.appareil.imei}</span> · reçu le {dateHeure(d.recu_le)} · {d.technicien ? `technicien ${d.technicien.nom}` : "technicien non affecté"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 190 }}>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--c-muted)" }}>Client</span>
                  <Link to={`/clients/${d.client.id}`} aria-label={`Ouvrir la fiche client de ${d.client.nom}`}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 10, border: "1px solid var(--c-border-5)", background: "var(--c-surface-2)", textAlign: "left", color: "inherit", textDecoration: "none" }}>
                    <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", background: "oklch(0.94 0.02 258)", color: "oklch(0.40 0.10 258)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{initiales(d.client.nom)}</span>
                    <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{d.client.nom}</span>
                      <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.48 0.02 255)" }}>{d.client.telephone}</span>
                    </span>
                  </Link>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button type="button" onClick={() => prev && changerStatut(prev.key)} disabled={!prevOk || busy === "statut"} style={navBtn(prevOk, false)}
                      title={tPrev?.raison ?? (prev ? `Revenir au statut « ${prev.label} »` : "Premier statut")}
                      aria-label={prev ? `Revenir au statut ${prev.label}` : "Premier statut"}>
                      <span aria-hidden="true">◀</span><span>{prev ? prev.label : "Début"}</span>
                    </button>
                    <button type="button" onClick={() => next && changerStatut(next.key)} disabled={!nextOk || busy === "statut"} style={navBtn(nextOk, true)}
                      title={tNext?.raison ?? (next ? `Passer au statut « ${next.label} »` : "Dossier clôturé")}
                      aria-label={next ? `Passer au statut ${next.label}` : "Dossier clôturé"}>
                      <span>{next ? next.label : "Clôturé"}</span><span aria-hidden="true">▶</span>
                    </button>
                  </div>
                  {raisons.map((r) => (
                    <span key={r} data-tiny="1" style={{ maxWidth: 300, fontSize: 11, lineHeight: 1.45, color: "var(--c-warn-text)", textAlign: "right" }}>
                      <span aria-hidden="true">▲ </span>{r}
                    </span>
                  ))}
                </div>
              </div>
              {erreurs.statut && <Alerte>{erreurs.statut}</Alerte>}
            </div>

            {(d.sla_depasse || d.retour_de || clos) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {d.sla_depasse && (
                  <Alerte ton="danger">
                    <span aria-hidden="true">⚠ </span>Engagement de délai dépassé : dossier reçu le {dateHeure(d.recu_le)}, plus de 48 h sans être prêt.
                  </Alerte>
                )}
                {d.retour_de && (
                  <Alerte ton="info">
                    <span aria-hidden="true">↩ </span>Retour sous garantie de <Link to={`/reparations/${d.retour_de}`} className="mono">{d.retour_de}</Link> : aucune facturation.
                  </Alerte>
                )}
                {clos && (
                  <Alerte ton="info">
                    <span aria-hidden="true">🔒 </span>Dossier clôturé le {dateHeure(d.cloture_le)} : il n'est plus modifiable (lecture seule).
                  </Alerte>
                )}
              </div>
            )}

            {/* ------------------------------------------------ barre d'actions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center" }}>
              <button type="button" style={quickBtn(false)} onClick={() =>
                telecharger(`${url}/etiquette.pdf`, `etiquette-${d.numero}.pdf`, true).catch((e) => toast(toApiError(e).message, "erreur"))}>
                <span aria-hidden="true">🏷</span><span>Imprimer l'étiquette</span>
              </button>
              <button type="button" style={quickBtn(false)} disabled={busy === "sms"} onClick={async () => {
                setBusy("sms");
                try {
                  const r = await api.post<S["Message"]>(`${url}/notifier`);
                  toast(r.data.detail, "ok");
                } catch (e) {
                  toast(toApiError(e).message, "erreur");
                } finally {
                  setBusy(null);
                }
              }}>
                <span aria-hidden="true">✉</span><span>{busy === "sms" ? "Envoi…" : "Notifier le client (SMS)"}</span>
              </button>
              <button type="button" style={quickBtn(false)} onClick={() => {
                setTypePhoto(slots.find((s) => !s.photo)?.type ?? "autre");
                setModale("photo");
              }}>
                <span aria-hidden="true">📷</span><span>Ajouter une photo</span>
              </button>
              <button type="button" style={{ ...quickBtn(!d.technicien), opacity: clos ? 0.55 : 1 }} onClick={affecter} disabled={clos}>
                <span aria-hidden="true">👤</span><span>{d.technicien ? "Réaffecter" : "Affecter un technicien"}</span>
              </button>
              <span style={{ flex: 1 }} />
              <span style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 13px", borderRadius: 10, background: "#fff", border: "1px solid var(--c-border)" }}>
                <span aria-hidden="true" style={{ color: "var(--c-muted)" }}>◷</span>
                <span data-tiny="1" className="mono" style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--c-muted)" }}>Temps passé</span>
                <span role="timer" aria-live="off" style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{dureeChrono(minutes)}</span>
                <button type="button" aria-pressed={!!d.chrono_depuis} disabled={clos || busy === "chrono"}
                  onClick={() => executer("chrono", () => api.post(`${url}/chrono/${d.chrono_depuis ? "arreter" : "demarrer"}`))}
                  style={{ padding: "6px 11px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, opacity: clos ? 0.55 : 1,
                    border: `1px solid ${d.chrono_depuis ? "oklch(0.86 0.08 25)" : "oklch(0.84 0.05 258)"}`,
                    background: d.chrono_depuis ? "oklch(0.97 0.025 25)" : "oklch(0.96 0.025 258)",
                    color: d.chrono_depuis ? "oklch(0.44 0.15 25)" : "oklch(0.38 0.12 258)" }}>
                  {d.chrono_depuis ? "Arrêter" : "Démarrer"}
                </button>
              </span>
            </div>
            {erreurs.chrono && <Alerte>{erreurs.chrono}</Alerte>}

            {/* ------------------------------------------------ deux colonnes */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* symptômes */}
                <div style={carte()}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Symptômes constatés</span>
                      <span data-tiny="1" style={{ fontSize: 11, color: "var(--c-muted-2)" }}>saisi à l'accueil · modifiable</span>
                    </span>
                    <textarea rows={4} value={symptomes} readOnly={clos} aria-invalid={!!erreurs.symptomes}
                      onChange={(e) => { setSymptomes(e.target.value); setErreur("symptomes", null); }}
                      onBlur={() => void enregistrerSymptomes()}
                      style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${erreurs.symptomes ? "var(--c-danger-input)" : "var(--c-border-3)"}`, fontSize: 13, lineHeight: 1.55, resize: "vertical", background: "oklch(0.99 0.002 258)" }} />
                  </label>
                  {d.symptomes.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-label="Symptômes reconnus">
                      {d.symptomes.map((s) => <Pastille key={s} ton="neutral">{s}</Pastille>)}
                    </div>
                  )}
                  {erreurs.symptomes && <Alerte>{erreurs.symptomes}</Alerte>}
                  <button type="button" className="btn-ia" onClick={lancerDiagnostic} disabled={clos || busy === "diag"}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: 12, borderRadius: 10, fontSize: 13.5, fontWeight: 700, color: "#fff",
                      background: busy === "diag" ? "oklch(0.62 0.08 195)" : "oklch(0.52 0.10 195)", opacity: clos ? 0.55 : 1 }}>
                    {busy === "diag"
                      ? <span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "2px solid oklch(0.78 0.05 195)", borderTopColor: "#fff", animation: "spin .8s linear infinite" }} />
                      : <span aria-hidden="true" style={{ fontSize: 14 }}>🧠</span>}
                    <span>{busy === "diag" ? "Analyse des symptômes en cours…" : "Lancer le diagnostic assisté"}</span>
                  </button>
                  {erreurs.diag && <Alerte>{erreurs.diag}</Alerte>}
                  <span data-tiny="1" style={petit}>
                    {historisees !== null
                      ? `Le modèle compare les symptômes aux ${historisees.toLocaleString("fr-FR")} interventions historisées. Il propose, il ne décide pas.`
                      : "Le modèle compare les symptômes aux interventions historisées. Il propose, il ne décide pas."}
                  </span>
                </div>

                {/* suggestion IA */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 17, borderRadius: 14, background: "var(--c-ia-bg-2)", border: "1px solid var(--c-ia-border)", borderLeft: "4px solid var(--c-ia-solid-2)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 150 }}>
                      <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 8, background: "var(--c-ia-solid-2)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🧠</span>
                      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--c-ia-text-2)" }}>Suggestion IA</span>
                        <span data-tiny="1" className="mono" style={{ fontSize: 10.5, color: "oklch(0.45 0.04 195)" }}>
                          lecture seule · modèle {sugg?.modele_version ?? "—"}{sugg ? ` · ${dateHeure(sugg.cree_le)}` : ""}
                        </span>
                      </span>
                    </span>
                    {sugg && <span title="Probabilité estimée par le modèle"><ConfianceChip score={sugg.confiance} /></span>}
                  </div>
                  {!sugg && (
                    <span data-tiny="1" style={{ padding: 14, textAlign: "center", fontSize: 12, color: "var(--c-ia-text)", border: "1px dashed var(--c-ia-dashed)", borderRadius: 10, background: "#fff" }}>
                      Aucune suggestion pour ce dossier : lancez le diagnostic assisté à partir des symptômes.
                    </span>
                  )}
                  {pannes.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {pannes.slice(0, 3).map((p, i) => {
                        const c = CONF_FG[niveauConfiance(p.score)];
                        return (
                          <div key={p.code} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 11, borderRadius: 10, background: "#fff", border: "1px solid oklch(0.91 0.012 195)" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                              <span className="mono" aria-hidden="true" style={{ width: 19, height: 19, borderRadius: 6, background: "oklch(0.94 0.02 195)", color: "oklch(0.36 0.06 195)", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "oklch(0.28 0.02 255)" }}>{p.label}</span>
                              <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: c }}>{Math.round(p.score * 100)} %</span>
                            </span>
                            <span role="progressbar" aria-label={`Score de l'hypothèse ${p.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.score * 100)}
                              style={{ height: 6, borderRadius: 99, background: "var(--c-surface-5)", overflow: "hidden", display: "block" }}>
                              <span style={{ display: "block", height: "100%", borderRadius: 99, width: `${Math.round(p.score * 100)}%`, background: c }} />
                            </span>
                            {p.pieces.length > 0 ? (
                              <span data-tiny="1" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 11, color: "oklch(0.48 0.02 255)" }}>
                                Pièces suggérées :
                                {p.pieces.map((x) => (
                                  <span key={x.piece_id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontWeight: 600, color: "var(--c-text-5)" }}>{x.designation}</span>
                                    <span className="mono">({x.stock})</span>
                                    <StockChip statut={x.statut} />
                                  </span>
                                ))}
                              </span>
                            ) : (
                              <span data-tiny="1" style={{ fontSize: 11, color: p.manque ? "var(--c-warn-text)" : "oklch(0.48 0.02 255)" }}>
                                {p.manque ? `Aucune « ${p.manque.toLowerCase()} » compatible référencée pour ce modèle — manque, à commander` : "Aucune pièce associée"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {sugg && (
                    <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.45 0.04 195)" }}>
                      Estimation : {eur(sugg.cout)} de pièces · {eur(sugg.prix)} HT conseillé · {sugg.duree_min ?? "—"} min
                    </span>
                  )}
                  <button type="button" onClick={appliquerSuggestion} disabled={!pannes.length || clos || busy === "valeur"}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 10, borderRadius: 9, background: "#fff", border: "1px solid oklch(0.62 0.08 195)", fontSize: 12.5, fontWeight: 700, color: "var(--c-ia-text)", opacity: !pannes.length || clos ? 0.55 : 1 }}>
                    <span aria-hidden="true">↓</span><span>Reprendre cette hypothèse dans le diagnostic final</span>
                  </button>
                </div>

                {/* constat photo */}
                <div style={carte()}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <h3 style={h3}>Constat photo</h3>
                    <span data-tiny="1" style={{ fontSize: 11, color: "var(--c-muted)" }}>horodaté · valeur probante</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(102px,1fr))", gap: 9 }}>
                    {slots.map((s) => (
                      <Vignette key={s.type} label={libellePhoto(s.type)} photo={s.photo} onOuvrir={setPhotoOuverte}
                        onAjouter={() => { setTypePhoto(s.type); setModale("photo"); }} />
                    ))}
                    {autres.map((p) => (
                      <Vignette key={p.id} label={libellePhoto(p.type)} photo={p} onOuvrir={setPhotoOuverte} onAjouter={() => {}} />
                    ))}
                  </div>
                  <span data-tiny="1" style={petit}>Deux clichés minimum sont exigés à l'accueil (état général + zone endommagée). Ils protègent l'atelier en cas de litige sur un dommage préexistant.</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* valeur retenue */}
                <div style={carte({ border: "1px solid oklch(0.84 0.04 258)", borderLeft: "4px solid var(--c-primary)" })}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 8, background: "var(--c-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✎</span>
                    <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Valeur retenue par le technicien</span>
                      <span data-tiny="1" className="mono" style={{ fontSize: 10.5, color: "oklch(0.48 0.02 255)" }}>éditable · fait foi pour le devis</span>
                    </span>
                  </span>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--c-text-4)" }}>Diagnostic final</span>
                    <textarea rows={4} value={diag} readOnly={clos} onChange={(e) => setDiag(e.target.value)} maxLength={2000}
                      placeholder="Décrivez la panne confirmée et l'intervention prévue…"
                      style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid oklch(0.86 0.02 258)", fontSize: 13, lineHeight: 1.55, resize: "vertical" }} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
                    {[
                      { label: "Coût des pièces", ia: eur(sugg?.cout), val: cout, set: setCout, bad: Number.isNaN(coutN), unite: "€" },
                      { label: "Prix client (HT)", ia: eur(sugg?.prix), val: prix, set: setPrix, bad: Number.isNaN(prixN), unite: "€" },
                    ].map((e) => (
                      <div key={e.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.38 0.02 255)" }}>{e.label}</span>
                        <BlocIA valeur={e.ia} />
                        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span data-tiny="1" style={tagRetenu}>Valeur retenue</span>
                          <span style={{ position: "relative", display: "block" }}>
                            <input type="text" inputMode="decimal" value={e.val} readOnly={clos} aria-invalid={e.bad} aria-label={`${e.label} — valeur retenue en euros`}
                              onChange={(x) => e.set(x.target.value)} style={{ ...champRetenu(e.bad, clos), paddingRight: 26 }} />
                            <span aria-hidden="true" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: "var(--c-muted)" }}>{e.unite}</span>
                          </span>
                        </label>
                      </div>
                    ))}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.38 0.02 255)" }}>Marge brute</span>
                      <BlocIA valeur={eur(sugg?.marge)} />
                      <span style={{ display: "flex", flexDirection: "column", gap: 4, padding: "9px 10px", borderRadius: 9, background: tonMarge.bg, border: `1px solid ${tonMarge.bd}` }}>
                        <span data-tiny="1" className="mono" style={{ fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: tonMarge.lb }}>{tonMarge.t}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: tonMarge.fg }}>{marge === null ? "à valider" : eur(marge)}</span>
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.38 0.02 255)" }}>Durée estimée</span>
                      <BlocIA valeur={sugg?.duree_min != null ? `${sugg.duree_min} min` : "—"} />
                      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span data-tiny="1" style={tagRetenu}>Valeur retenue</span>
                        <span style={{ position: "relative", display: "block" }}>
                          <input type="text" inputMode="numeric" value={duree} readOnly={clos} aria-invalid={dureeInvalide} aria-label="Durée estimée — valeur retenue en minutes"
                            onChange={(x) => setDuree(x.target.value)} style={{ ...champRetenu(dureeInvalide, clos), paddingRight: 38 }} />
                          <span aria-hidden="true" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, fontWeight: 700, color: "var(--c-muted)" }}>min</span>
                        </span>
                      </label>
                    </div>
                  </div>
                  <span data-tiny="1" style={petit}>La durée estimée fixe la main-d'œuvre du devis ({m ? `${fr(Number(m.taux_horaire))} €` : "45 €"} HT de l'heure).</span>
                  {erreurs.valeur && <Alerte>{erreurs.valeur}</Alerte>}
                  {!clos && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 9, paddingTop: 4 }}>
                      <button type="button" className="btn-primary" onClick={() => void enregistrer()} disabled={busy === "valeur"}
                        style={{ flex: 1, minWidth: 130, padding: 11, borderRadius: 10, background: "var(--c-primary)", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", justifyContent: "center" }}>
                        {busy === "valeur" ? "Enregistrement…" : "Enregistrer le dossier"}{modifie && busy !== "valeur" ? " •" : ""}
                      </button>
                      <button type="button" onClick={editerDevis} disabled={busy === "devis"}
                        style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid var(--c-border-2)", fontSize: 13, fontWeight: 600, color: "var(--c-text-4)", background: "#fff" }}>
                        {busy === "devis" ? "Édition…" : "Éditer le devis"}
                      </button>
                    </div>
                  )}
                </div>

                {/* pièces engagées */}
                <div style={carte({ gap: 10 })}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <h3 style={h3}>Pièces engagées</h3>
                    {!clos && (
                      <button type="button" onClick={() => setModale("piece")}
                        style={{ padding: "6px 11px", borderRadius: 8, border: "1px solid var(--c-border-2)", fontSize: 12, fontWeight: 600, color: "var(--c-text-5)" }}>
                        + Ajouter
                      </button>
                    )}
                  </div>
                  {d.pieces.map((p) => {
                    const inv = stockDe(p.piece_id);
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, border: "1px solid oklch(0.94 0.006 258)", background: "var(--c-surface-2)" }}>
                        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--c-text-2)" }}>{p.designation}</span>
                          <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.48 0.02 255)" }}>
                            {inv ? `${inv.compatibilite.join(", ") || "Universelle"} · ` : ""}réf. {p.reference} · qté {p.qte}
                          </span>
                        </span>
                        {inv && <StockChip statut={inv.statut} />}
                        <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.32 0.02 255)" }}>{eur(Number(p.prix_achat_unitaire) * p.qte)}</span>
                        {!clos && (
                          <button type="button" aria-label={`Retirer ${p.designation} du dossier`} title="Retirer (la pièce revient en stock)" disabled={busy === "pieces"}
                            onClick={() => executer("pieces", () => api.delete(`${url}/pieces/${p.id}`), `${p.designation} retirée : la pièce revient en stock.`)}
                            style={{ padding: "4px 8px", borderRadius: 7, fontSize: 13, color: "var(--c-muted)", border: "1px solid transparent" }}>
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {d.pieces.length === 0 && (
                    <span data-tiny="1" style={{ display: "block", padding: 14, textAlign: "center", fontSize: 12, color: "var(--c-muted-3)", border: "1px dashed var(--c-border-2)", borderRadius: 10 }}>
                      Aucune pièce engagée — les pièces suggérées par l'IA apparaîtront ici après validation.
                    </span>
                  )}
                  {erreurs.pieces && <Alerte>{erreurs.pieces}</Alerte>}
                </div>

                {/* checklist */}
                <div style={carte()}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <h3 style={h3}>Checklist d'intervention</h3>
                    <Pastille ton={faites === totalEtapes ? "ok" : "warn"}>{faites} / {totalEtapes} étapes</Pastille>
                  </div>
                  <span aria-hidden="true" style={{ height: 7, borderRadius: 99, background: "var(--c-surface-5)", overflow: "hidden", display: "block" }}>
                    <span style={{ display: "block", height: "100%", borderRadius: 99, width: `${(faites / totalEtapes) * 100}%`, background: "var(--c-ok-solid)" }} />
                  </span>
                  {d.checklist.map((e) => (
                    <button key={e.ordre} type="button" aria-pressed={e.faite} disabled={clos || busy === `ck${e.ordre}`}
                      title={e.faite_le ? `Cochée le ${dateHeure(e.faite_le)}` : undefined}
                      onClick={() => executer(`ck${e.ordre}`, () => api.patch(`${url}/checklist/${e.ordre}`, { faite: !e.faite }))}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 10,
                        border: `1px solid ${e.faite ? "oklch(0.94 0.02 152)" : "oklch(0.95 0.006 258)"}`, background: e.faite ? "oklch(0.985 0.012 152)" : "var(--c-surface-2)" }}>
                      <span aria-hidden="true" style={{ width: 19, height: 19, borderRadius: 6, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff",
                        background: e.faite ? "var(--c-ok-solid-2)" : "transparent", border: `1.5px solid ${e.faite ? "var(--c-ok-solid-2)" : "oklch(0.82 0.01 258)"}` }}>{e.faite ? "✓" : ""}</span>
                      <span style={{ flex: 1, textAlign: "left", fontSize: 12.5, fontWeight: e.faite ? 600 : 500, color: e.faite ? "oklch(0.42 0.02 255)" : "var(--c-text-2)",
                        ...(e.faite ? { textDecoration: "line-through", textDecorationColor: "oklch(0.72 0.02 258)" } : {}) }}>{e.libelle}</span>
                      <span data-tiny="1" className="mono" style={{ fontSize: 10.5, color: "oklch(0.54 0.02 255)" }}>{e.duree_min} min</span>
                    </button>
                  ))}
                  {Object.entries(erreurs).filter(([k, v]) => k.startsWith("ck") && v).map(([k, v]) => <Alerte key={k}>{v}</Alerte>)}
                  <span data-tiny="1" style={petit}>Le passage au statut « Prêt à facturer » exige que le test de sortie soit coché.</span>
                </div>

                {/* devis client */}
                <div style={carte({ gap: 12 })}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <h3 style={h3}>Devis client</h3>
                      {d.devis_numero && <span data-tiny="1" className="mono" style={{ fontSize: 11, color: "var(--c-muted)" }}>{d.devis_numero}{d.facture_numero ? ` · ${d.facture_numero}` : ""}</span>}
                    </span>
                    {devis ? <Pastille ton={devis.ton} icon={devis.icon}>{devis.label}</Pastille>
                      : <Pastille ton="neutral" icon="○">{d.retour_de ? "Sous garantie" : "Non édité"}</Pastille>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <LigneDevis k="Pièces" v={m ? eur(m.cout_pieces) : eur(d.cout_pieces_retenu)} />
                    <LigneDevis k={`Main-d'œuvre (${m ? fr(Number(m.heures)) : "—"} h × ${m ? fr(Number(m.taux_horaire)) : "45"} €)`} v={m ? eur(m.main_oeuvre) : "—"} />
                    {m && <LigneDevis k="TVA 20 %" v={eur(m.tva)} />}
                    <LigneDevis k="Total TTC" v={m ? eur(m.prix_ttc) : "à valider"} fort taille={16} sep />
                    <LigneDevis k="Marge nette" v={m ? eur(m.marge_nette) : "à valider"} fort taille={13}
                      couleur={!m ? "oklch(0.46 0.02 255)" : Number(m.marge_nette) < 0 ? "oklch(0.44 0.15 25)" : "oklch(0.34 0.10 152)"} />
                  </div>
                  <button type="button" onClick={() => navigate(`${url}/facture`)}
                    style={{ padding: 11, borderRadius: 10, border: "1px solid var(--c-primary-border)", background: "var(--c-primary-soft)", fontSize: 12.5, fontWeight: 700, color: "var(--c-primary-text)" }}>
                    Ouvrir le devis / la facture →
                  </button>
                </div>

                {/* historique */}
                <div style={carte({ gap: 12 })}>
                  <h3 style={h3}>Historique des statuts</h3>
                  <ol style={{ display: "flex", flexDirection: "column", gap: 0, listStyle: "none", margin: 0, padding: 0 }}>
                    {d.historique.map((h, i, arr) => {
                      const s = statutInfo(h.vers_statut);
                      return (
                        <li key={`${h.le}-${i}`} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto", alignSelf: "stretch" }}>
                            <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: "50%", background: TEINTE[s.ton], flex: "0 0 auto", marginTop: 3 }} />
                            {i < arr.length - 1 && <span aria-hidden="true" style={{ flex: 1, width: 2, background: "var(--c-border)", margin: "3px 0" }} />}
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 14 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXTE[s.ton] }}>
                              {h.de_statut ? `${statutInfo(h.de_statut).label} → ${s.label}` : `${s.label} · ouverture du dossier`}
                            </span>
                            <span data-tiny="1" style={{ fontSize: 11, color: "var(--c-muted)" }}>{dateHeure(h.le)} · {h.par ?? "système"}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            </div>

            {modale === "photo" && (
              <ModalePhoto numero={d.numero} typeInitial={TYPES_PHOTO.some((t) => t.key === typePhoto) ? typePhoto : "autre"} onClose={() => setModale(null)}
                onOk={(x) => { setData(x); setModale(null); toast("Photo ajoutée au constat (horodatée).", "ok"); }} />
            )}
            {modale === "affecter" && (
              <ModaleAffectation dossier={d} onClose={() => setModale(null)}
                onOk={(x) => { setData(x); setModale(null); toast(x.technicien ? `Dossier affecté à ${x.technicien.nom}.` : "Dossier désaffecté.", "ok"); }} />
            )}
            {modale === "piece" && (
              <ModalePiece dossier={d} inventaire={!can("stocks.lire") || inventaire.error ? inventaire.data?.pieces ?? [] : inventaire.data?.pieces ?? null} suggerees={suggereesIds} onClose={() => setModale(null)}
                onOk={(x) => { setData(x); setModale(null); void inventaire.reload(); toast("Pièce engagée : stock mis à jour.", "ok"); }} />
            )}
            {photoOuverte && <PhotoAgrandie photo={photoOuverte} onClose={() => setPhotoOuverte(null)} />}
          </div>
        );
      })()}
    </Etat>
  );
}

function BlocIA({ valeur }: { valeur: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "9px 10px", borderRadius: 9, background: "var(--c-ia-bg-2)", border: "1px dashed oklch(0.80 0.04 195)" }}>
      <span data-tiny="1" style={tagIA}>Suggestion IA</span>
      <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "oklch(0.34 0.06 195)" }}>{valeur}</span>
    </div>
  );
}

function LigneDevis({ k, v, fort, taille = 12.5, sep, couleur }: { k: string; v: string; fort?: boolean; taille?: number; sep?: boolean; couleur?: string }) {
  const c = couleur ?? (fort ? "var(--c-text)" : "var(--c-text-5)");
  return (
    <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, ...(sep ? { paddingTop: 8, borderTop: "1px solid oklch(0.93 0.008 258)" } : {}) }}>
      <span style={{ fontSize: 12.5, fontWeight: fort ? 700 : 500, color: c }}>{k}</span>
      <span className="mono" style={{ fontSize: taille, fontWeight: fort ? 700 : 500, fontVariantNumeric: "tabular-nums", color: c }}>{v}</span>
    </span>
  );
}
