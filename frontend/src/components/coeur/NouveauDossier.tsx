import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, toApiError, type S } from "../../api/client";
import { Alerte, ConfianceChip } from "../ui";

/** Formulaire « Ouvrir un dossier de réparation » du Kanban (5.3) : client → appareil → symptômes, pré-diagnostic IA en direct. */

type Priorite = S["Priorite"];
export interface DossierCree { numero: string; ia: { label: string; confiance: number } | null }

const PRIOS: { v: Priorite; l: string }[] = [{ v: "basse", l: "Basse" }, { v: "normale", l: "Normale" }, { v: "haute", l: "Haute" }];
const MIN_SYMPTOMES = 15;

const lab: CSSProperties = { fontSize: 12, fontWeight: 600, color: "oklch(0.34 0.02 255)" };
const etoile = <span style={{ color: "oklch(0.50 0.16 25)" }}> *</span>;
const erreurStyle: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "oklch(0.48 0.16 25)" };
const champ = (mauvais: boolean): CSSProperties => ({
  width: "100%", padding: "11px 12px", borderRadius: 10, fontSize: 13.5, background: "#fff",
  border: `1.5px solid ${mauvais ? "oklch(0.66 0.14 25)" : "oklch(0.88 0.008 258)"}`,
});
const btnSec: CSSProperties = { padding: "11px 15px", borderRadius: 10, border: "1px solid oklch(0.89 0.008 258)", fontSize: 13, fontWeight: 600, color: "oklch(0.36 0.02 255)" };

export default function NouveauDossier({ clientInitial, onClose, onCree }: {
  clientInitial?: number | null; onClose: () => void; onCree: (d: DossierCree) => void;
}) {
  const navigate = useNavigate();
  const [client, setClient] = useState<{ id: number; nom: string } | null>(null);
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<S["ClientLigneOut"][]>([]);
  const [listeOuverte, setListeOuverte] = useState(false);
  const [appareils, setAppareils] = useState<S["AppareilOut"][] | null>(null);
  const [appareilId, setAppareilId] = useState("");
  const [priorite, setPriorite] = useState<Priorite>("normale");
  const [techs, setTechs] = useState<S["ChargeTechOut"][]>([]);
  const [techId, setTechId] = useState("");
  const [symptomes, setSymptomes] = useState("");
  const [touche, setTouche] = useState(false);
  const [modeles, setModeles] = useState<S["ModeleOut"][]>([]);
  const [apercu, setApercu] = useState<S["DiagnosticOut"] | null>(null);
  const [apercuEnCours, setApercuEnCours] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const premierChamp = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<S["ModeleOut"][]>("/modeles").then((r) => setModeles(r.data)).catch(() => setModeles([]));
    api.get<S["ChargeTechOut"][]>("/techniciens").then((r) => setTechs(r.data)).catch(() => setTechs([]));
    premierChamp.current?.focus();
  }, []);

  // client prérempli (?client=<id>, retour de l'écran « Ajout appareil »)
  useEffect(() => {
    if (!clientInitial) return;
    api.get<S["ClientFicheOut"]>(`/clients/${clientInitial}`).then((r) => choisirClient({ id: r.data.id, nom: r.data.nom }, r.data.appareils)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientInitial]);

  // recherche de client (débounce)
  useEffect(() => {
    if (client || q.trim().length < 2) {
      setResultats([]);
      return;
    }
    const t = setTimeout(() => {
      api.get<S["Page_ClientLigneOut_"]>("/clients", { params: { q: q.trim(), taille: 8 } })
        .then((r) => setResultats(r.data.items)).catch(() => setResultats([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, client]);

  const choisirClient = (c: { id: number; nom: string }, connus?: S["AppareilOut"][]) => {
    setClient(c);
    setQ(c.nom);
    setListeOuverte(false);
    setAppareilId("");
    setAppareils(null);
    const poser = (liste: S["AppareilOut"][]) => {
      setAppareils(liste);
      if (liste.length === 1) setAppareilId(String(liste[0].id));
    };
    if (connus) poser(connus);
    else api.get<S["ClientFicheOut"]>(`/clients/${c.id}`).then((r) => poser(r.data.appareils)).catch(() => setAppareils([]));
  };

  const appareil = appareils?.find((a) => String(a.id) === appareilId) ?? null;
  const modeleId = appareil ? modeles.find((m) => m.marque === appareil.marque && m.modele === appareil.modele)?.id ?? null : null;

  // pré-diagnostic assisté en direct (débounce)
  useEffect(() => {
    const texte = symptomes.trim();
    if (texte.length < MIN_SYMPTOMES) {
      setApercu(null);
      return;
    }
    let annule = false;
    const t = setTimeout(() => {
      setApercuEnCours(true);
      api.post<S["DiagnosticOut"]>("/ia/diagnostic", { modele_id: modeleId, symptomes_texte: texte })
        .then((r) => !annule && setApercu(r.data))
        .catch(() => !annule && setApercu(null))
        .finally(() => !annule && setApercuEnCours(false));
    }, 600);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [symptomes, modeleId]);

  const clientMauvais = touche && !client;
  const appareilMauvais = touche && !!client && !appareilId;
  const symptomesMauvais = touche && symptomes.trim().length < MIN_SYMPTOMES;

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setTouche(true);
    setErreur(null);
    if (!client || !appareilId || symptomes.trim().length < MIN_SYMPTOMES) return;
    setBusy(true);
    try {
      const body: S["ReparationIn"] = { appareil_id: Number(appareilId), symptomes_texte: symptomes.trim(), priorite, tech_id: techId ? Number(techId) : null };
      const r = await api.post<S["DossierOut"]>("/reparations", body);
      const top = apercu?.pannes[0];
      onCree({ numero: r.data.numero, ia: top && apercu ? { label: top.label, confiance: apercu.confiance } : null });
    } catch (err) {
      setErreur(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const vueRattacher = () => navigate(client ? `/appareils/nouveau?client=${client.id}` : "/appareils/nouveau");

  return (
    <form onSubmit={soumettre} noValidate aria-label="Ouvrir un dossier de réparation"
      style={{ display: "flex", flexDirection: "column", gap: 13, padding: 17, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.84 0.04 258)", borderLeft: "4px solid oklch(0.52 0.15 258)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Ouvrir un dossier de réparation</span>
        <span data-muted="1" style={{ fontSize: 12.5, color: "oklch(0.48 0.02 255)" }}>
          Le dossier est créé au statut « Reçu ». Le diagnostic assisté s'exécute dès la saisie des symptômes.
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 11 }}>
        {/* client */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative" }}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setListeOuverte(false)}>
          <label htmlFor="nd-client" style={lab}>Client{etoile}</label>
          <input id="nd-client" ref={premierChamp} type="search" value={q} autoComplete="off" placeholder="Nom ou téléphone…"
            role="combobox" aria-expanded={listeOuverte && resultats.length > 0} aria-controls="nd-clients" aria-invalid={clientMauvais}
            onChange={(e) => { setQ(e.target.value); setClient(null); setAppareils(null); setAppareilId(""); setListeOuverte(true); }}
            onFocus={() => setListeOuverte(true)} style={champ(clientMauvais)} />
          {clientMauvais && <span role="alert" style={erreurStyle}>Recherchez puis sélectionnez le client.</span>}
          {listeOuverte && !client && q.trim().length >= 2 && (
            <div id="nd-clients" role="listbox" aria-label="Clients trouvés" className="card"
              style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, padding: 5, zIndex: 20, boxShadow: "var(--sh-modal)", maxHeight: 260, overflow: "auto" }}>
              {resultats.length === 0 && <div data-muted="1" style={{ padding: 10, fontSize: 12.5, color: "var(--c-muted)" }}>Aucun client pour « {q.trim()} ».</div>}
              {resultats.map((c) => (
                <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => choisirClient({ id: c.id, nom: c.nom })}
                  style={{ display: "flex", flexDirection: "column", width: "100%", padding: "8px 9px", borderRadius: 8, textAlign: "left" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{c.nom}</span>
                  <span data-tiny="1" data-muted="1" style={{ fontSize: 11.5, color: "var(--c-muted)" }}>
                    {c.telephone}{c.ville ? ` · ${c.ville}` : ""} · {c.appareils} appareil{c.appareils > 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* appareil */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <label htmlFor="nd-appareil" style={lab}>Appareil déposé{etoile}</label>
            {client && (
              <button type="button" onClick={vueRattacher} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--c-primary)", padding: 0 }}>+ Rattacher un appareil</button>
            )}
          </span>
          <select id="nd-appareil" value={appareilId} onChange={(e) => setAppareilId(e.target.value)} disabled={!client || appareils === null}
            aria-invalid={appareilMauvais} style={{ ...champ(appareilMauvais), opacity: client ? 1 : 0.6 }}>
            <option value="">{!client ? "— Choisir d'abord le client —" : appareils === null ? "Chargement…" : appareils.length === 0 ? "Aucun appareil rattaché" : "— Choisir un appareil —"}</option>
            {appareils?.map((a) => <option key={a.id} value={a.id}>{a.marque} {a.modele} — IMEI {a.imei}</option>)}
          </select>
          {appareilMauvais && <span role="alert" style={erreurStyle}>Sélectionnez l'appareil concerné.</span>}
        </div>

        {/* priorité */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span id="nd-prio" style={lab}>Priorité</span>
          <div role="radiogroup" aria-labelledby="nd-prio" style={{ display: "flex", gap: 6 }}>
            {PRIOS.map((p) => {
              const on = priorite === p.v;
              return (
                <button key={p.v} type="button" role="radio" aria-checked={on} onClick={() => setPriorite(p.v)}
                  style={{ flex: 1, padding: "10px 8px", borderRadius: 9, fontSize: 12.5, fontWeight: on ? 700 : 500, border: `1.5px solid ${on ? "oklch(0.82 0.06 258)" : "oklch(0.91 0.008 258)"}`, background: on ? "oklch(0.96 0.025 258)" : "#fff", color: on ? "oklch(0.36 0.12 258)" : "oklch(0.42 0.02 255)" }}>
                  {p.l}
                </button>
              );
            })}
          </div>
        </div>

        {/* technicien */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="nd-tech" style={lab}>Technicien affecté</label>
          <select id="nd-tech" value={techId} onChange={(e) => setTechId(e.target.value)} style={champ(false)}>
            <option value="">Non affecté (pool)</option>
            {techs.map((t) => <option key={t.id} value={t.id}>{t.nom}{t.specialite ? ` — ${t.specialite}` : ""}</option>)}
          </select>
        </div>
      </div>

      {/* symptômes */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <label htmlFor="nd-symptomes" style={lab}>Symptômes constatés à l'accueil{etoile}</label>
          <span data-tiny="1" aria-live="polite" style={{ fontSize: 11, color: "oklch(0.52 0.02 255)" }}>{symptomes.length} caractères</span>
        </span>
        <textarea id="nd-symptomes" rows={3} value={symptomes} onChange={(e) => setSymptomes(e.target.value)} aria-invalid={symptomesMauvais}
          placeholder="Décrivez ce que le client constate : « ne charge plus, le câble ne tient pas dans le port »…"
          style={{ ...champ(symptomesMauvais), fontSize: 13, lineHeight: 1.55, resize: "vertical" }} />
        {symptomesMauvais && <span role="alert" style={erreurStyle}>Décrivez le symptôme en 15 caractères minimum — c'est ce texte que le modèle analyse.</span>}
      </div>

      {/* aperçu IA */}
      {(apercu || apercuEnCours) && (
        <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 9, padding: "12px 13px", borderRadius: 11, background: "oklch(0.975 0.008 195)", border: "1px dashed oklch(0.82 0.04 195)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7, background: "oklch(0.55 0.10 195)", color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>🧠</span>
            <span style={{ flex: 1, minWidth: 180, fontSize: 12.5, lineHeight: 1.5, color: "oklch(0.32 0.06 195)" }}>
              <strong>Pré-diagnostic :</strong> {apercu?.pannes[0]?.label ?? "analyse des symptômes en cours…"}
            </span>
            {apercu && <ConfianceChip score={apercu.confiance} />}
          </div>
          {apercu && apercu.pannes.length > 1 && (
            <ol style={{ margin: 0, paddingLeft: 34, display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "oklch(0.36 0.04 195)" }}>
              {apercu.pannes.slice(0, 3).map((p) => (
                <li key={p.code}>
                  {p.label} <span className="mono" style={{ fontWeight: 600 }}>{Math.round(p.score * 100)} %</span>
                </li>
              ))}
            </ol>
          )}
          {apercu && !modeleId && (
            <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.42 0.04 195)" }}>Modèle d'appareil non précisé : l'analyse porte sur le texte seul.</span>
          )}
        </div>
      )}

      {erreur && <Alerte>{erreur}</Alerte>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
        <button type="submit" disabled={busy} aria-busy={busy}
          style={{ padding: "11px 17px", borderRadius: 10, background: "oklch(0.52 0.15 258)", color: "#fff", fontSize: 13, fontWeight: 700, opacity: busy ? 0.7 : 1 }}>
          {busy ? "Création…" : "Créer le dossier"}
        </button>
        <button type="button" onClick={onClose} style={btnSec}>Annuler</button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={vueRattacher} style={btnSec}>L'appareil n'est pas dans la liste →</button>
      </div>
    </form>
  );
}
