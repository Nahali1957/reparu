import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { api, toApiError, type S } from "../../api/client";
import { eur } from "../../utils/format";
import { Alerte, Modal, StockChip } from "../ui";

/* Briques de l'écran 5.4 « Dossier de réparation » (modales, vignettes photo, styles communs). */

export type Dossier = S["DossierOut"];

export const TYPES_PHOTO: { key: string; label: string }[] = [
  { key: "etat_general", label: "État général" },
  { key: "zone_endommagee", label: "Zone endommagée" },
  { key: "apres_intervention", label: "Après intervention" },
  { key: "autre", label: "Autre" },
];
export const libellePhoto = (t: string) => TYPES_PHOTO.find((x) => x.key === t)?.label ?? t;

/** Carte blanche de la maquette (padding 17, rayon 14). */
export const carte = (extra: CSSProperties = {}): CSSProperties => ({
  display: "flex", flexDirection: "column", gap: 11, padding: 17, borderRadius: 14, background: "#fff", border: "1px solid var(--c-border)", ...extra,
});
export const h3: CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700 };
export const petit: CSSProperties = { fontSize: 11, lineHeight: 1.5, color: "var(--c-muted-2)" };

/** Analyse un montant saisi (« 48,52 », « 48.52 € »). null si vide, NaN si invalide. */
export function lireNombre(v: string): number | null {
  const t = v.replace(/\s|€/g, "").replace(",", ".");
  if (t === "") return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}
export const versSaisie = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "" : String(Number(v).toFixed(2)).replace(".", ",");

/* ---------------------------------------------------------------- photo authentifiée */

/** L'image est servie derrière le JWT : on la charge en blob puis on crée une URL locale. */
export function useImage(url: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  const [echec, setEchec] = useState(false);
  useEffect(() => {
    if (!url) return;
    let actif = true;
    let href: string | null = null;
    setEchec(false);
    api
      .get(url.replace(/^\/api/, ""), { responseType: "blob" })
      .then((r) => {
        href = URL.createObjectURL(r.data as Blob);
        if (actif) setSrc(href);
      })
      .catch(() => actif && setEchec(true));
    return () => {
      actif = false;
      if (href) URL.revokeObjectURL(href);
    };
  }, [url]);
  return { src, echec };
}

const horodatage = (v: string) => {
  const d = new Date(v);
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

export function Vignette({ label, photo, onAjouter, onOuvrir, desactive }: {
  label: string; photo?: S["PhotoOut"]; onAjouter: () => void; onOuvrir: (p: S["PhotoOut"]) => void; desactive?: boolean;
}) {
  const { src, echec } = useImage(photo?.url ?? null);
  const base: CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, aspectRatio: "4 / 5", borderRadius: 11,
    textAlign: "center", padding: 8, overflow: "hidden", position: "relative", width: "100%",
  };
  if (!photo) {
    return (
      <button type="button" onClick={onAjouter} disabled={desactive} aria-label={`Ajouter la photo « ${label} »`}
        style={{ ...base, background: "oklch(0.985 0.003 258)", border: "1px dashed oklch(0.86 0.01 258)" }}>
        <span aria-hidden="true" style={{ fontSize: 17, color: "oklch(0.52 0.12 258)" }}>＋</span>
        <span data-tiny="1" style={{ fontSize: 10.5, lineHeight: 1.35, fontWeight: 600, color: "oklch(0.42 0.10 258)" }}>{label}</span>
        <span data-tiny="1" className="mono" style={{ fontSize: 9.5, color: "oklch(0.54 0.02 255)" }}>à prendre</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={() => onOuvrir(photo)} aria-label={`Agrandir la photo « ${label} » du ${horodatage(photo.prise_le)}`}
      style={{ ...base, justifyContent: "flex-end", background: "oklch(0.955 0.008 258)", border: "1px solid oklch(0.90 0.008 258)", padding: 0 }}>
      {src ? (
        <img src={src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span aria-hidden="true" style={{ position: "absolute", top: "38%", fontSize: 17, color: "oklch(0.58 0.02 255)" }}>{echec ? "▣" : "…"}</span>
      )}
      <span style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", gap: 2, padding: "6px 6px 7px", background: "oklch(0.985 0.003 258 / 0.92)", borderTop: "1px solid oklch(0.90 0.008 258)" }}>
        <span data-tiny="1" style={{ fontSize: 10.5, lineHeight: 1.35, fontWeight: 600, color: "oklch(0.38 0.02 255)" }}>{label}</span>
        <span data-tiny="1" className="mono" style={{ fontSize: 9.5, color: "oklch(0.54 0.02 255)" }}>{horodatage(photo.prise_le)}</span>
      </span>
    </button>
  );
}

export function PhotoAgrandie({ photo, onClose }: { photo: S["PhotoOut"]; onClose: () => void }) {
  const { src, echec } = useImage(photo.url);
  return (
    <Modal titre={`Constat photo — ${libellePhoto(photo.type)}`} onClose={onClose} largeur={640}>
      <div style={{ minHeight: 240, borderRadius: 12, background: "var(--c-surface-3)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {src ? <img src={src} alt={`Photo ${libellePhoto(photo.type)}`} style={{ maxWidth: "100%", maxHeight: "60vh", display: "block" }} />
          : <span data-muted="1" style={{ color: "var(--c-muted)", fontSize: 13 }}>{echec ? "Image indisponible." : "Chargement…"}</span>}
      </div>
      <span data-tiny="1" className="mono" style={{ fontSize: 11.5, color: "var(--c-muted)" }}>
        Prise le {new Date(photo.prise_le).toLocaleDateString("fr-FR")} à {new Date(photo.prise_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        {photo.par ? ` · par ${photo.par}` : ""} · horodatage serveur
      </span>
    </Modal>
  );
}

/* ---------------------------------------------------------------- ajout de photo */

export function ModalePhoto({ numero, typeInitial, onClose, onOk }: {
  numero: string; typeInitial: string; onClose: () => void; onOk: (d: Dossier) => void;
}) {
  const [type, setType] = useState(typeInitial);
  const [fichier, setFichier] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const envoyer = async () => {
    if (!fichier) return setErreur("Choisissez un fichier image (JPEG, PNG ou WebP).");
    setBusy(true);
    setErreur(null);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("fichier", fichier);
      const r = await api.post<Dossier>(`/reparations/${encodeURIComponent(numero)}/photos`, fd);
      onOk(r.data);
    } catch (e) {
      setErreur(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal titre="Ajouter une photo" onClose={onClose} largeur={480}>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <legend style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-4)", marginBottom: 8 }}>Type de cliché</legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {TYPES_PHOTO.map((t) => (
            <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 9, fontSize: 13, cursor: "pointer",
              border: `1px solid ${type === t.key ? "var(--c-primary-border-2)" : "var(--c-border-4)"}`, background: type === t.key ? "var(--c-primary-soft)" : "#fff", fontWeight: type === t.key ? 700 : 500 }}>
              <input type="radio" name="type-photo" value={t.key} checked={type === t.key} onChange={() => setType(t.key)} />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" tabIndex={-1}
        aria-hidden="true" onChange={(e) => { setFichier(e.target.files?.[0] ?? null); setErreur(null); }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()}>
          <span aria-hidden="true">📷</span><span>Choisir un fichier</span>
        </button>
        <span data-muted="1" style={{ fontSize: 12.5, color: "var(--c-muted)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fichier ? fichier.name : "JPEG, PNG ou WebP · 8 Mo maximum"}
        </span>
      </div>
      <span data-tiny="1" style={petit}>Le cliché est horodaté par le serveur et rattaché au dossier : il a valeur probante en cas de litige.</span>
      {erreur && <Alerte>{erreur}</Alerte>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button type="button" className="btn btn-primary" onClick={envoyer} disabled={busy || !fichier}>{busy ? "Envoi…" : "Enregistrer la photo"}</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- affectation */

export function ModaleAffectation({ dossier, onClose, onOk }: { dossier: Dossier; onClose: () => void; onOk: (d: Dossier) => void }) {
  const [techs, setTechs] = useState<S["ChargeTechOut"][] | null>(null);
  const [choix, setChoix] = useState<number | null>(dossier.technicien?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api.get<S["ChargeTechOut"][]>("/techniciens").then((r) => setTechs(r.data)).catch((e) => setErreur(toApiError(e).message));
  }, []);

  const valider = async () => {
    setBusy(true);
    setErreur(null);
    try {
      const r = await api.post<Dossier>(`/reparations/${encodeURIComponent(dossier.numero)}/affecter`, { tech_id: choix });
      onOk(r.data);
    } catch (e) {
      setErreur(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const tonCharge = (s: string) => (s === "Surchargé" ? "var(--c-danger-text)" : s === "Chargé" ? "var(--c-warn-text)" : "var(--c-ok-text)");
  const options = [{ id: null as number | null, nom: "Non affecté", detail: "Le dossier reste dans la file commune", couleur: "var(--c-muted)", init: "?" }].concat(
    (techs ?? []).map((t) => ({ id: t.id, nom: t.nom, detail: `${t.ouverts} dossier${t.ouverts > 1 ? "s" : ""} en cours · ${t.specialite ?? "polyvalent"} · ${t.statut}`, couleur: tonCharge(t.statut), init: t.initiales })),
  );

  return (
    <Modal titre={dossier.technicien ? "Réaffecter le dossier" : "Affecter un technicien"} onClose={onClose} largeur={500}>
      <div role="radiogroup" aria-label="Technicien" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {techs === null && !erreur && <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />}
        {techs !== null && options.map((o) => {
          const actif = o.id === choix;
          return (
            <button key={o.id ?? "aucun"} type="button" role="radio" aria-checked={actif} onClick={() => setChoix(o.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, textAlign: "left",
                border: `1px solid ${actif ? "var(--c-primary-border-2)" : "var(--c-border-4)"}`, background: actif ? "var(--c-primary-soft)" : "#fff" }}>
              <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", background: "oklch(0.94 0.02 258)", color: "oklch(0.40 0.10 258)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{o.init}</span>
              <span style={{ display: "flex", flexDirection: "column", flex: 1, lineHeight: 1.35 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{o.nom}</span>
                <span data-tiny="1" style={{ fontSize: 11.5, color: o.couleur, fontWeight: 600 }}>{o.detail}</span>
              </span>
              {actif && <span aria-hidden="true" style={{ color: "var(--c-primary)", fontWeight: 700 }}>✓</span>}
            </button>
          );
        })}
      </div>
      {erreur && <Alerte>{erreur}</Alerte>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button type="button" className="btn btn-primary" onClick={valider} disabled={busy || techs === null || choix === (dossier.technicien?.id ?? null)}>
          {busy ? "Enregistrement…" : "Valider l'affectation"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- engagement de pièce */

export function ModalePiece({ dossier, inventaire, suggerees, onClose, onOk }: {
  dossier: Dossier; inventaire: S["PieceOut"][] | null; suggerees: number[]; onClose: () => void; onOk: (d: Dossier) => void;
}) {
  const modele = dossier.appareil.modele;
  const [q, setQ] = useState("");
  const [compatibles, setCompatibles] = useState(true);
  const [choix, setChoix] = useState<number | null>(suggerees[0] ?? null);
  const [qte, setQte] = useState("1");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const liste = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (inventaire ?? [])
      .filter((p) => !compatibles || p.compatibilite.length === 0 || p.compatibilite.includes(modele))
      .filter((p) => !t || `${p.designation} ${p.reference} ${p.categorie} ${p.compatibilite.join(" ")}`.toLowerCase().includes(t))
      .sort((a, b) => Number(suggerees.includes(b.id)) - Number(suggerees.includes(a.id)) || a.designation.localeCompare(b.designation, "fr"));
  }, [inventaire, q, compatibles, modele, suggerees]);

  const n = Number(qte);
  const qteOk = Number.isInteger(n) && n >= 1 && n <= 20;

  const engager = async () => {
    if (choix === null || !qteOk) return;
    setBusy(true);
    setErreur(null);
    try {
      const r = await api.post<Dossier>(`/reparations/${encodeURIComponent(dossier.numero)}/pieces`, { piece_id: choix, qte: n });
      onOk(r.data);
    } catch (e) {
      setErreur(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal titre="Engager une pièce" onClose={onClose} largeur={620}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <label style={{ flex: 1 }}>
          <span className="sr-only">Rechercher une pièce</span>
          <input className="input" type="search" placeholder="Rechercher une pièce, une référence…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: "var(--c-text-5)", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={compatibles} onChange={(e) => setCompatibles(e.target.checked)} />
          Compatibles {modele}
        </label>
      </div>
      <div role="radiogroup" aria-label="Pièce" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflow: "auto" }}>
        {inventaire === null && <div className="skeleton" style={{ height: 140, borderRadius: 10 }} />}
        {inventaire !== null && liste.length === 0 && (
          <span data-tiny="1" style={{ padding: 14, textAlign: "center", fontSize: 12, color: "var(--c-muted-3)", border: "1px dashed var(--c-border-2)", borderRadius: 10 }}>
            Aucune pièce ne correspond à la recherche.
          </span>
        )}
        {liste.map((p) => {
          const actif = p.id === choix;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={actif} onClick={() => setChoix(p.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 10, textAlign: "left",
                border: `1px solid ${actif ? "var(--c-primary-border-2)" : "oklch(0.94 0.006 258)"}`, background: actif ? "var(--c-primary-soft)" : "oklch(0.985 0.003 258)" }}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--c-text-2)" }}>
                  {p.designation}
                  {suggerees.includes(p.id) && <span className="mono" style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: "var(--c-ia-text)" }}>🧠 SUGGÉRÉE</span>}
                </span>
                <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.48 0.02 255)" }}>{p.compatibilite.join(", ") || "Universelle"} · réf. {p.reference} · {p.stock} en stock</span>
              </span>
              <StockChip statut={p.statut} />
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.32 0.02 255)", minWidth: 70, textAlign: "right" }}>{eur(p.prix_achat)}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 120, fontSize: 12.5, fontWeight: 600, color: "var(--c-text-4)" }}>
          Quantité
          <input className="input" type="number" min={1} max={20} value={qte} onChange={(e) => setQte(e.target.value)} aria-invalid={!qteOk} />
        </label>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button type="button" className="btn btn-primary" onClick={engager} disabled={busy || choix === null || !qteOk}>{busy ? "Engagement…" : "Engager la pièce"}</button>
      </div>
      <span data-tiny="1" style={petit}>L'engagement sort la pièce du stock (mouvement journalisé). Si le stock est insuffisant, l'opération est refusée.</span>
      {erreur && <Alerte>{erreur}</Alerte>}
    </Modal>
  );
}
