import { useState, type CSSProperties, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, toApiError, type ApiError, type S } from "../api/client";
import { Alerte, Modal } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

/** 5.1 Connexion : panneau de marque à gauche, formulaire à droite (pleine page, sans coquille). */

const STATS = [
  { v: "−50 %", l: "temps de diagnostic" },
  { v: "+20 %", l: "marge maîtrisée" },
  { v: "−30 %", l: "ruptures de stock" },
];

const badgeS = (bg: string, fg: string, bd: string): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 7px", borderRadius: 7, fontSize: 10.5, fontWeight: 700,
  whiteSpace: "nowrap", background: bg, color: fg, border: `1px solid ${bd}`,
});

const DEMO = [
  { email: "l.marchand@reparu.fr", role: "Technicien", icon: "🔧", badge: badgeS("oklch(0.96 0.02 258)", "oklch(0.40 0.09 258)", "oklch(0.90 0.03 258)") },
  { email: "c.vasseur@reparu.fr", role: "Administrateur", icon: "📊", badge: badgeS("oklch(0.965 0.025 195)", "oklch(0.36 0.08 195)", "oklch(0.88 0.04 195)") },
];

const inputStyle = (erreur: boolean): CSSProperties => ({
  width: "100%", padding: "12px 13px", borderRadius: 10, fontSize: 14, background: "#fff", outline: "none",
  border: `1.5px solid ${erreur ? "oklch(0.66 0.14 25)" : "oklch(0.88 0.008 258)"}`,
});

const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "oklch(0.34 0.02 255)" };

/** Met en gras la première phrase du message serveur, comme la maquette (« Identifiants invalides. » …). */
function MessageErreur({ texte }: { texte: string }) {
  const i = texte.indexOf(". ");
  if (i < 0) return <strong>{texte}</strong>;
  return (
    <>
      <strong>{texte.slice(0, i + 1)}</strong> {texte.slice(i + 2)}
    </>
  );
}

export default function Connexion() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const depuis = (location.state as { depuis?: string } | null)?.depuis;

  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [souvenir, setSouvenir] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [oubliOuvert, setOubliOuvert] = useState(false);

  const cible = (role: string) => (depuis && depuis !== "/connexion" ? depuis : role === "technicien" ? "/reparations" : "/tableau-de-bord");

  if (ready && user && !enCours) return <Navigate to={cible(user.role)} replace />;

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      const u = await login(email.trim(), mdp, souvenir);
      navigate(cible(u.role), { replace: true });
    } catch (err) {
      const a = toApiError(err);
      if (a.status === 422) a.message = "Saisissez une adresse e-mail valide et votre mot de passe.";
      setErreur(a);
      setEnCours(false);
    }
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", minHeight: "100%", height: "100%" }}>
      {/* panneau de marque */}
      <div style={{ flex: "1 1 340px", background: "oklch(0.21 0.025 258)", color: "#fff", padding: "44px 40px", display: "flex", flexDirection: "column", gap: 34 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, background: "oklch(0.55 0.16 258)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>Ʀ</span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Repar U</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: "auto" }}>
          <p style={{ margin: 0, fontSize: 25, fontWeight: 300, lineHeight: 1.4, letterSpacing: "-0.01em", textWrap: "pretty" } as CSSProperties}>
            « Donner à l'atelier la précision d'un diagnostic assisté et la rigueur d'un pilotage data-driven. »
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 22, paddingTop: 18, borderTop: "1px solid oklch(0.32 0.02 258)" }}>
            {STATS.map((s) => (
              <span key={s.l} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="mono" style={{ fontSize: 21, fontWeight: 700, color: "oklch(0.80 0.10 258)" }}>{s.v}</span>
                <span style={{ fontSize: 11, color: "oklch(0.74 0.02 258)" }}>{s.l}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* formulaire */}
      <main style={{ flex: "1 1 420px", display: "flex", alignItems: "center", justifyContent: "center", padding: "36px 28px", background: "oklch(0.98 0.004 258)" }}>
        <form onSubmit={soumettre} noValidate style={{ width: "100%", maxWidth: 376, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Connexion à l'atelier</h1>
            <p data-muted="1" style={{ margin: 0, fontSize: 13.5, color: "oklch(0.48 0.02 255)" }}>Accès réservé au personnel — authentification JWT, session de 8 h.</p>
          </div>

          {erreur && (
            <div role="alert" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 13px", borderRadius: 10, background: "oklch(0.96 0.04 25)", border: "1px solid oklch(0.84 0.09 25)" }}>
              <span aria-hidden="true" style={{ fontWeight: 700, color: "oklch(0.48 0.17 25)" }}>{erreur.status === 423 ? "🔒" : "!"}</span>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: "oklch(0.38 0.13 25)" }}>
                <MessageErreur texte={erreur.message} />
              </span>
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Adresse e-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required
              aria-invalid={erreur?.status === 401 || erreur?.status === 422} style={inputStyle(erreur?.status === 401 || erreur?.status === 422)} />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <label htmlFor="mdp" style={labelStyle}>Mot de passe</label>
              <button type="button" onClick={() => setOubliOuvert(true)} style={{ fontSize: 12, fontWeight: 500, color: "var(--c-primary)", padding: 0 }}>
                Mot de passe oublié ?
              </button>
            </span>
            <input id="mdp" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="current-password" required
              aria-invalid={erreur?.status === 401} style={inputStyle(erreur?.status === 401 || erreur?.status === 422)} />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "oklch(0.36 0.02 255)" }}>
            <input type="checkbox" checked={souvenir} onChange={(e) => setSouvenir(e.target.checked)} style={{ width: 17, height: 17, accentColor: "oklch(0.52 0.15 258)" }} />
            <span>Se souvenir de ce poste (30 jours)</span>
          </label>

          <button type="submit" disabled={enCours} aria-busy={enCours}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: 13, borderRadius: 10, background: "oklch(0.52 0.15 258)", color: "#fff", fontSize: 14, fontWeight: 700, boxShadow: "0 2px 8px oklch(0.52 0.15 258 / 0.28)" }}>
            {enCours && (
              <span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "2px solid oklch(0.75 0.06 258)", borderTopColor: "#fff", animation: "spin .8s linear infinite" }} />
            )}
            <span>{enCours ? "Connexion en cours…" : "Se connecter"}</span>
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 13, borderRadius: 11, background: "#fff", border: "1px solid oklch(0.90 0.008 258)" }}>
            <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "oklch(0.50 0.02 255)" }}>Comptes de démonstration</span>
            {DEMO.map((d) => (
              <button key={d.email} type="button" onClick={() => { setEmail(d.email); setErreur(null); }}
                aria-label={`Préremplir l'e-mail du compte ${d.role} ${d.email}`}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 9px", borderRadius: 8, border: "1px solid oklch(0.92 0.008 258)", fontSize: 12.5, textAlign: "left", background: "oklch(0.985 0.003 258)" }}>
                <span aria-hidden="true">{d.icon}</span>
                <span className="mono" style={{ flex: 1, fontSize: 11.5, color: "oklch(0.40 0.02 255)" }}>{d.email}</span>
                <span data-badge="1" style={d.badge}>{d.role}</span>
              </button>
            ))}
          </div>
        </form>
      </main>

      {oubliOuvert && <MotDePasseOublie emailInitial={email} onClose={() => setOubliOuvert(false)} />}
    </div>
  );
}

function MotDePasseOublie({ emailInitial, onClose }: { emailInitial: string; onClose: () => void }) {
  const [email, setEmail] = useState(emailInitial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErreur(null);
    try {
      const r = await api.post<S["MessageOut"]>("/auth/mot-de-passe-oublie", { email: email.trim() });
      setMessage(r.data.detail);
    } catch (err) {
      const a = toApiError(err);
      setErreur(a.status === 422 ? "Saisissez une adresse e-mail valide." : a.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal titre="Mot de passe oublié" onClose={onClose} largeur={420}>
      {message ? (
        <>
          <Alerte ton="ok">{message}</Alerte>
          <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-end" }} onClick={onClose}>Fermer</button>
        </>
      ) : (
        <form onSubmit={envoyer} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p data-muted="1" style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--c-text-7)" }}>
            Saisissez l'adresse e-mail de votre compte : un lien de réinitialisation vous sera envoyé.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Adresse e-mail</span>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus aria-invalid={!!erreur} />
          </label>
          {erreur && <Alerte>{erreur}</Alerte>}
          <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>{busy ? "Envoi…" : "Envoyer le lien"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
