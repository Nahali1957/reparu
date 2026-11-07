import { useState, type CSSProperties, type FormEvent } from "react";
import { api, toApiError, type ApiError, type S } from "../api/client";
import Etat from "../components/Etat";
import AlertesSecurite from "../components/pilotage/AlertesSecurite";
import { Alerte } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { LIBELLES_ROLE, useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { dateHeure } from "../utils/format";

type Role = S["UserOut"]["role"];
type Teinte = { bg: string; fg: string; bd: string };

const GREEN: Teinte = { bg: "oklch(0.965 0.03 152)", fg: "oklch(0.36 0.10 152)", bd: "oklch(0.84 0.06 152)" };
const NEUTRAL: Teinte = { bg: "oklch(0.96 0.005 258)", fg: "oklch(0.44 0.02 255)", bd: "oklch(0.90 0.008 258)" };
const BLUE: Teinte = { bg: "oklch(0.96 0.02 258)", fg: "oklch(0.40 0.10 258)", bd: "oklch(0.90 0.03 258)" };
const VIOLET: Teinte = { bg: "oklch(0.965 0.025 292)", fg: "oklch(0.40 0.11 292)", bd: "oklch(0.90 0.04 292)" };
const TEAL: Teinte = { bg: "oklch(0.965 0.025 195)", fg: "oklch(0.36 0.08 195)", bd: "oklch(0.88 0.04 195)" };
const ROLE_TEINTE: Record<Role, Teinte> = { admin: TEAL, responsable: VIOLET, technicien: BLUE };

const badge = (m: Teinte): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 7px", borderRadius: 7, fontSize: 10.5, fontWeight: 700,
  whiteSpace: "nowrap", background: m.bg, color: m.fg, border: `1px solid ${m.bd}`,
});
const inputStyle = (bad: boolean): CSSProperties => ({
  width: "100%", padding: "11px 12px", borderRadius: 10, fontSize: 13.5, background: "#fff", border: `1.5px solid ${bad ? "oklch(0.66 0.14 25)" : "oklch(0.88 0.008 258)"}`,
});
const lib: CSSProperties = { fontSize: 12, fontWeight: 600, color: "oklch(0.34 0.02 255)" };
const errStyle: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "oklch(0.48 0.16 25)" };
const th = (align: "left" | "right"): CSSProperties => ({ padding: "11px 14px", textAlign: align, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "oklch(0.46 0.02 255)" });
const BORD = "oklch(0.91 0.008 258)";

/** Droits par rôle, alignés sur la matrice réelle (backend/app/core/rbac.py). */
const PERMS: Record<Role, { i: string; l: string }[]> = {
  technicien: [{ i: "🛠", l: "Dossiers de réparation" }, { i: "🧠", l: "Diagnostic assisté" }, { i: "👤", l: "Clients & appareils" }, { i: "€", l: "Devis & facturation" }, { i: "👁", l: "Stock en lecture seule" }],
  responsable: [{ i: "🛠", l: "Tous les dossiers" }, { i: "⧉", l: "Affectation & planning" }, { i: "📦", l: "Stocks & fournisseurs" }, { i: "◉", l: "Capteurs IoT" }, { i: "◧", l: "Tableau de bord & rapports" }],
  admin: [{ i: "🛠", l: "Tous les dossiers" }, { i: "📦", l: "Stocks & fournisseurs" }, { i: "◧", l: "Tableau de bord & rapports" }, { i: "🛡", l: "Gestion des comptes" }, { i: "▤", l: "Journal d'audit" }],
};

const initiales = (s: string) => s.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const VIDE = { nom: "", email: "", role: "technicien" as Role, specialite: "", password: "" };

export default function Comptes() {
  const { data, setData, etat, error, reload } = useApi<S["UserOut"][]>("/comptes");
  const journal = useApi<S["JournalEntreeOut"][]>("/audit/journal?limit=30");
  const { user } = useAuth();
  const toast = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [nu, setNu] = useState(VIDE);
  const [touched, setTouched] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [errCreation, setErrCreation] = useState<ApiError | null>(null);
  const [bascule, setBascule] = useState<number | null>(null);
  const [errStatut, setErrStatut] = useState<{ id: number; e: ApiError } | null>(null);

  const nomBad = touched && !nu.nom.trim();
  const mailBad = touched && !/^[^@\s]+@reparu\.fr$/i.test(nu.email.trim());
  const pwdBad = touched && nu.password.length < 10;

  const toggleForm = () => {
    setFormOpen((o) => !o);
    setTouched(false);
    setErrCreation(null);
  };

  const creer = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!nu.nom.trim() || !/^[^@\s]+@reparu\.fr$/i.test(nu.email.trim()) || nu.password.length < 10) return;
    setEnvoi(true);
    setErrCreation(null);
    try {
      const r = await api.post<S["UserOut"]>("/comptes", {
        nom: nu.nom.trim(), email: nu.email.trim(), role: nu.role, specialite: nu.specialite.trim() || null, password: nu.password,
      });
      setData((l) => [...(l ?? []), r.data].sort((a, b) => a.nom.localeCompare(b.nom, "fr")));
      toast(`Compte créé — ${r.data.email}`, "ok");
      setNu(VIDE);
      setTouched(false);
      setFormOpen(false);
      void journal.reload();
    } catch (err) {
      setErrCreation(toApiError(err));
    } finally {
      setEnvoi(false);
    }
  };

  const basculer = async (u: S["UserOut"]) => {
    setBascule(u.id);
    setErrStatut(null);
    try {
      const r = await api.patch<S["UserOut"]>(`/comptes/${u.id}/statut`, { actif: !u.actif });
      setData((l) => (l ?? []).map((x) => (x.id === u.id ? r.data : x)));
      toast(`Compte ${r.data.actif ? "réactivé" : "désactivé"} — ${r.data.email}`, "ok");
      void journal.reload();
    } catch (err) {
      setErrStatut({ id: u.id, e: toApiError(err) });
    } finally {
      setBascule(null);
    }
  };

  const users = data ?? [];
  const actifs = users.filter((u) => u.actif).length;

  return (
    <Etat etat={etat} meta={SCREENS.comptes} error={error} onRetry={reload}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <span data-muted="1" style={{ fontSize: 12.5, color: "oklch(0.46 0.02 255)" }}>{users.length} comptes · {actifs} actifs</span>
          <button onClick={toggleForm} aria-expanded={formOpen}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, ...(formOpen ? { border: "1px solid oklch(0.89 0.008 258)", background: "#fff", color: "oklch(0.34 0.02 255)" } : { background: "oklch(0.52 0.15 258)", color: "#fff" }) }}>
            <span aria-hidden="true">{formOpen ? "✕" : "+"}</span>
            <span>{formOpen ? "Fermer" : "Créer un compte"}</span>
          </button>
        </div>

        {formOpen && (
          <form onSubmit={creer} noValidate aria-label="Créer un compte"
            style={{ display: "flex", flexDirection: "column", gap: 13, padding: 17, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.84 0.04 258)", borderLeft: "4px solid oklch(0.52 0.15 258)" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Créer un compte</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 11 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={lib}>Nom et prénom<span style={{ color: "oklch(0.50 0.16 25)" }}> *</span></span>
                <input type="text" value={nu.nom} onChange={(e) => setNu({ ...nu, nom: e.target.value })} placeholder="Camille Perrot" aria-invalid={nomBad} required style={inputStyle(nomBad)} />
                {nomBad && <span role="alert" style={errStyle}>Le nom est obligatoire.</span>}
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={lib}>E-mail professionnel<span style={{ color: "oklch(0.50 0.16 25)" }}> *</span></span>
                <input type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="c.perrot@reparu.fr" aria-invalid={mailBad} required style={inputStyle(mailBad)} />
                {mailBad && <span role="alert" style={errStyle}>Adresse invalide (domaine @reparu.fr attendu).</span>}
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={lib}>Rôle</span>
                <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}
                  style={{ padding: "11px 12px", borderRadius: 10, border: "1px solid oklch(0.88 0.008 258)", fontSize: 13.5, background: "#fff" }}>
                  <option value="technicien">Technicien</option>
                  <option value="responsable">Responsable d'atelier</option>
                  <option value="admin">Administrateur</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={lib}>Spécialité</span>
                <input type="text" value={nu.specialite} onChange={(e) => setNu({ ...nu, specialite: e.target.value })} placeholder="Écrans & vitres" style={inputStyle(false)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={lib}>Mot de passe provisoire<span style={{ color: "oklch(0.50 0.16 25)" }}> *</span></span>
                <input type="password" autoComplete="new-password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} aria-invalid={pwdBad} required minLength={10} style={inputStyle(pwdBad)} />
                {pwdBad && <span role="alert" style={errStyle}>10 caractères minimum.</span>}
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: 13, borderRadius: 11, background: "oklch(0.975 0.004 258)", border: "1px solid oklch(0.93 0.008 258)" }}>
              <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".09em", textTransform: "uppercase", color: "oklch(0.50 0.02 255)" }}>Droits accordés à ce rôle</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {PERMS[nu.role].map((p) => (
                  <span key={p.l} data-badge="1" style={badge(BLUE)}><span aria-hidden="true">{p.i}</span>{p.l}</span>
                ))}
              </div>
            </div>
            {errCreation && <Alerte>{errCreation.message}</Alerte>}
            <div style={{ display: "flex", gap: 9 }}>
              <button type="submit" disabled={envoi} aria-busy={envoi} style={{ padding: "11px 17px", borderRadius: 10, background: "oklch(0.52 0.15 258)", color: "#fff", fontSize: 13, fontWeight: 700, opacity: envoi ? 0.6 : 1 }}>
                {envoi ? "Création…" : "Créer le compte"}
              </button>
              <button type="button" onClick={toggleForm} style={{ padding: "11px 15px", borderRadius: 10, border: "1px solid oklch(0.89 0.008 258)", fontSize: 13, fontWeight: 600, color: "oklch(0.36 0.02 255)" }}>Annuler</button>
            </div>
            <span data-tiny="1" style={{ fontSize: 11, lineHeight: 1.5, color: "oklch(0.52 0.02 255)" }}>
              Le mot de passe provisoire est à communiquer à l'utilisateur par un canal séparé ; il est haché (bcrypt), jamais stocké en clair.
            </span>
          </form>
        )}

        <div data-table="1" style={{ borderRadius: 14, overflow: "hidden", background: "#fff", border: `1px solid ${BORD}` }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "oklch(0.965 0.005 258)", borderBottom: `1px solid ${BORD}` }}>
                {["Utilisateur", "E-mail", "Rôle", "Statut", "Dernière connexion"].map((c) => <th key={c} scope="col" style={th("left")}>{c}</th>)}
                <th scope="col" style={th("right")}><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const soi = u.id === user?.id;
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid oklch(0.955 0.006 258)" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: "oklch(0.95 0.02 258)", color: "oklch(0.40 0.10 258)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{initiales(u.nom)}</span>
                        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{u.nom}{soi && <span data-muted="1" style={{ fontWeight: 500, color: "var(--c-muted)" }}> (vous)</span>}</span>
                          <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.50 0.02 255)" }}>{u.specialite ?? "—"}</span>
                        </span>
                      </span>
                    </td>
                    <td className="mono" style={{ padding: "12px 14px", fontSize: 12, color: "oklch(0.38 0.02 255)" }}>{u.email}</td>
                    <td style={{ padding: "12px 14px" }}><span data-badge="1" style={badge(ROLE_TEINTE[u.role])}>{LIBELLES_ROLE[u.role]}</span></td>
                    <td style={{ padding: "12px 14px" }}>
                      <span data-badge="1" style={badge(u.actif ? GREEN : NEUTRAL)}><span aria-hidden="true">{u.actif ? "●" : "○"}</span>{u.actif ? "Actif" : "Désactivé"}</span>
                    </td>
                    <td className="mono" style={{ padding: "12px 14px", fontSize: 11.5, color: "oklch(0.46 0.02 255)" }}>{u.derniere_connexion ? dateHeure(u.derniere_connexion) : "Jamais"}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <button onClick={() => basculer(u)} disabled={bascule === u.id} aria-label={`${u.actif ? "Désactiver" : "Réactiver"} le compte de ${u.nom}`}
                          style={{ padding: "7px 13px", borderRadius: 8, fontSize: 12, fontWeight: 700, opacity: bascule === u.id ? 0.6 : 1, border: `1px solid ${u.actif ? "oklch(0.88 0.06 25)" : "oklch(0.84 0.06 152)"}`, background: u.actif ? "oklch(0.98 0.015 25)" : "oklch(0.98 0.015 152)", color: u.actif ? "oklch(0.46 0.15 25)" : "oklch(0.36 0.10 152)" }}>
                          {u.actif ? "Désactiver" : "Réactiver"}
                        </button>
                        {errStatut?.id === u.id && <span role="alert" style={{ ...errStyle, maxWidth: 240, textAlign: "right" }}>{errStatut.e.message}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 16, borderRadius: 14, background: "#fff", border: `1px solid ${BORD}` }}>
          <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Journal des accès sensibles</h3>
          {journal.etat === "loading" && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 36, borderRadius: 10 }} />)}
          {journal.etat === "error" && (
            <Alerte>Impossible de charger le journal. {journal.error?.message} <button onClick={journal.reload} style={{ textDecoration: "underline", fontWeight: 700, color: "inherit" }}>Réessayer</button></Alerte>
          )}
          {journal.data?.length === 0 && <span data-muted="1" style={{ fontSize: 12.5, color: "var(--c-muted)" }}>Aucun accès sensible journalisé.</span>}
          <div style={{ display: "flex", flexDirection: "column", gap: 9, maxHeight: 420, overflowY: "auto" }}>
            {journal.data?.map((j) => (
              <div key={j.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 10, border: "1px solid oklch(0.955 0.006 258)", background: j.gravite === "critique" ? "oklch(0.98 0.012 25)" : "oklch(0.985 0.003 258)" }}>
                <span aria-hidden="true" style={{ display: "block", width: 8, height: 8, borderRadius: "50%", flex: "0 0 auto", background: j.gravite === "critique" ? "oklch(0.55 0.18 25)" : j.gravite === "alerte" ? "oklch(0.62 0.14 62)" : "oklch(0.55 0.13 152)" }} />
                <span className="sr-only">{j.gravite === "critique" ? "Critique : " : j.gravite === "alerte" ? "Alerte : " : ""}</span>
                <span style={{ flex: 1, minWidth: 150, fontSize: 12.5, color: "oklch(0.30 0.02 255)" }}>{j.libelle}</span>
                {j.ip && <span data-tiny="1" className="mono" style={{ fontSize: 10.5, color: "oklch(0.60 0.02 255)" }}>{j.ip}</span>}
                <span data-tiny="1" className="mono" style={{ fontSize: 11, color: "oklch(0.50 0.02 255)" }}>{dateHeure(j.horodatage)}</span>
              </div>
            ))}
          </div>
        </div>

        <AlertesSecurite onChange={journal.reload} />
      </div>
    </Etat>
  );
}
