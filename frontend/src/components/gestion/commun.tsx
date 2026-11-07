import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { AxiosError } from "axios";
import { toApiError } from "../../api/client";

/* Styles et petits composants communs aux écrans Gestion (5.5 Fiche client, 5.6 Clients, 5.7 Appareil). */

export const initiales = (s: string | null | undefined) =>
  (s || "").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function Avatar({ nom, taille = 30 }: { nom: string; taille?: number }) {
  return (
    <span aria-hidden="true" style={{
      width: taille, height: taille, borderRadius: "50%", flex: "0 0 auto", background: "oklch(0.95 0.02 258)",
      color: taille > 40 ? "oklch(0.38 0.11 258)" : "oklch(0.40 0.10 258)", fontSize: taille > 40 ? 17 : 11, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>{initiales(nom)}</span>
  );
}

/** Carte blanche des écrans Gestion (rayon 14, bordure fine). */
export const carte: CSSProperties = { display: "flex", flexDirection: "column", gap: 11, padding: 17, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.91 0.008 258)" };

/** Bouton secondaire de la maquette (bordure grise, texte foncé). */
export const btnSecondaire: CSSProperties = { padding: "11px 15px", borderRadius: 10, border: "1px solid oklch(0.89 0.008 258)", background: "#fff", fontSize: 13, fontWeight: 600, color: "oklch(0.36 0.02 255)" };
export const btnPrimaire: CSSProperties = { padding: "11px 17px", borderRadius: 10, background: "oklch(0.52 0.15 258)", color: "#fff", fontSize: 13, fontWeight: 700 };

/** Champ de formulaire au gabarit de la maquette : libellé 12 px, aide ou erreur sous le champ. */
export function Champ({ label, requis, aide, erreur, succes, children }: {
  label: string; requis?: boolean; aide?: ReactNode; erreur?: string | null; succes?: ReactNode; children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.34 0.02 255)" }}>
        {label}
        {requis && <span aria-hidden="true" style={{ color: "oklch(0.50 0.16 25)" }}> *</span>}
      </span>
      {children}
      {erreur ? (
        <span role="alert" style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.48 0.16 25)" }}>{erreur}</span>
      ) : succes ? (
        <span role="status" style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.38 0.11 152)" }}>{succes}</span>
      ) : aide ? (
        <span data-tiny="1" data-muted="1" style={{ fontSize: 11.5, color: "oklch(0.52 0.02 255)" }}>{aide}</span>
      ) : null}
    </label>
  );
}

export const styleSaisie = (bad: boolean): CSSProperties => ({
  padding: "11px 12px", borderRadius: 10, borderWidth: 1.5, borderStyle: "solid",
  borderColor: bad ? "oklch(0.66 0.14 25)" : "oklch(0.88 0.008 258)",
});

/**
 * Erreur d'une action : message global + messages par champ (422 Pydantic : loc = ["body", "<champ>"]).
 * Les messages du serveur sont déjà en français.
 */
export interface ErreurAction { message: string; status: number | null; champs: Record<string, string> }
export function erreurAction(e: unknown): ErreurAction {
  const base = toApiError(e);
  const champs: Record<string, string> = {};
  const detail = (e as AxiosError<{ detail?: unknown }>).response?.data?.detail;
  if (Array.isArray(detail)) {
    for (const d of detail as { loc?: (string | number)[]; msg?: string }[]) {
      const champ = d.loc?.[d.loc.length - 1];
      if (typeof champ === "string" && d.msg) champs[champ] = d.msg.replace(/^Value error, /, "");
    }
  }
  return { message: base.message, status: base.status, champs };
}

export function useDebounce<T>(valeur: T, ms = 300): T {
  const [v, setV] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setV(valeur), ms);
    return () => clearTimeout(t);
  }, [valeur, ms]);
  return v;
}

/** Contrôle de Luhn (identique à celui du serveur, services/regles.py). */
export function luhnValide(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let total = 0;
  [...imei].reverse().forEach((ch, i) => {
    let d = Number(ch);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  });
  return total % 10 === 0;
}

export const TELEPHONE_RE = /^0[1-9]([ .-]?[0-9]{2}){4}$/;

export const moisAnnee = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "—";

/* ------------------------------------------------------------ formulaire client (création / édition) */

export interface ClientSaisie { nom: string; telephone: string; email: string; ville: string }
export const CLIENT_VIDE: ClientSaisie = { nom: "", telephone: "", email: "", ville: "" };

export function erreursClient(c: ClientSaisie): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.nom.trim()) e.nom = "Le nom est obligatoire.";
  if (!TELEPHONE_RE.test(c.telephone.trim())) e.telephone = "Format attendu : 06 12 34 56 78.";
  return e;
}

export const clientPayload = (c: ClientSaisie) => ({
  nom: c.nom.trim(), telephone: c.telephone.trim(), email: c.email.trim() || null, ville: c.ville.trim() || null,
});

/** Les 4 champs « Nom et prénom / Téléphone / E-mail / Ville » de la maquette 5.6. */
export function ChampsClient({ valeur, onChange, erreurs }: {
  valeur: ClientSaisie; onChange: (v: ClientSaisie) => void; erreurs: Record<string, string>;
}) {
  const champ = (cle: keyof ClientSaisie, label: string, ph: string, requis: boolean, type = "text") => (
    <Champ key={cle} label={label} requis={requis} erreur={erreurs[cle]}>
      <input className="input" type={type} value={valeur[cle]} placeholder={ph} required={requis} aria-required={requis}
        aria-invalid={!!erreurs[cle]} autoComplete="off"
        onChange={(e) => onChange({ ...valeur, [cle]: e.target.value })} style={styleSaisie(!!erreurs[cle])} />
    </Champ>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 11 }}>
      {champ("nom", "Nom et prénom", "Marion Delcourt", true)}
      {champ("telephone", "Téléphone", "06 12 34 56 78", true, "tel")}
      {champ("email", "E-mail", "prenom.nom@email.fr", false, "email")}
      {champ("ville", "Ville", "Montpellier", false)}
    </div>
  );
}
