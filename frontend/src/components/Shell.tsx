import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, type S } from "../api/client";
import { useA11y } from "../hooks/useA11y";
import { LIBELLES_ROLE, useAuth } from "../hooks/useAuth";
import { NAV, ROUTES, SCREENS, type ScreenMeta } from "../screens";
import { Verrouille } from "./Etat";

/* L'écran courant publie son titre et son fil d'Ariane dans l'en-tête de la coquille. */
const EcranCtx = createContext<(m: ScreenMeta) => void>(() => {});

/** Enveloppe d'écran : publie l'en-tête et affiche « Verrouillé » si le rôle n'a pas la permission (jamais un masquage). */
export function Ecran({ meta, children }: { meta: ScreenMeta; children: ReactNode }) {
  const publier = useContext(EcranCtx);
  const { can } = useAuth();
  useEffect(() => publier(meta), [meta, publier]);
  if (meta.permission && !can(meta.permission)) return <Verrouille meta={meta} />;
  return <>{children}</>;
}

const ACTIF_PAR_ROUTE: [RegExp, string][] = [
  [/^\/reparations\/[^/]+\/facture/, "facturation"],
  [/^\/reparations/, "kanban"],
  [/^\/(clients|appareils)/, "clients"],
  [/^\/stocks\/capteurs/, "iot"],
];

export default function Shell() {
  const [meta, setMeta] = useState<ScreenMeta>(SCREENS.dashboard);
  const { user, can, logout } = useAuth();
  const { a11y, toggle } = useA11y();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [notif, setNotif] = useState<S["NotificationsOut"] | null>(null);
  const [alertesStock, setAlertesStock] = useState(0);

  useEffect(() => {
    const charger = () => {
      api.get<S["NotificationsOut"]>("/notifications").then((r) => setNotif(r.data)).catch(() => {});
      if (can("stocks.lire"))
        api.get<S["InventaireOut"]>("/pieces").then((r) => setAlertesStock(r.data.compteurs["Seuil bas"] + r.data.compteurs["Rupture"])).catch(() => {});
    };
    charger();
    const t = setInterval(charger, 60_000);
    return () => clearInterval(t);
  }, [can, pathname]);

  const actifForce = ACTIF_PAR_ROUTE.find(([re]) => re.test(pathname))?.[1];
  const initiales = (user?.nom ?? "").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <EcranCtx.Provider value={setMeta}>
      <div style={{ display: "flex", height: "100vh", background: "var(--c-app)" }}>
        <aside style={{ flex: "0 0 var(--sidebar-w)", background: "var(--c-chrome)", color: "var(--c-chrome-fg)", display: "flex", flexDirection: "column", padding: "18px 12px", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px" }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--c-primary-logo)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>Ʀ</span>
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Repar U</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--c-chrome-muted)" }}>Atelier Montpellier</span>
            </span>
          </div>
          <nav aria-label="Navigation principale" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV.map((k) => {
              const s = SCREENS[k];
              const verrouille = !!s.permission && !can(s.permission);
              const badge = k === "inventaire" && alertesStock ? String(alertesStock) : "";
              return (
                <NavLink key={k} to={ROUTES[k]}
                  style={({ isActive }) => {
                    const actif = actifForce ? actifForce === k : isActive;
                    return { display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 10px", borderRadius: 9, fontSize: 12.5, fontWeight: actif ? 700 : 500, color: actif ? "#fff" : "var(--c-chrome-text)", background: actif ? "var(--c-primary-strong)" : "transparent", opacity: verrouille ? 0.55 : 1, textDecoration: "none" };
                  }}
                  aria-label={verrouille ? `${s.nav ?? s.label} (non autorisé pour votre rôle)` : undefined}>
                  <span aria-hidden="true" style={{ width: 18, textAlign: "center", fontSize: 13 }}>{s.icon}</span>
                  <span style={{ flex: 1, textAlign: "left" }}>{s.nav ?? s.label}</span>
                  {(verrouille || badge) && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, background: verrouille ? "transparent" : "var(--c-danger-badge)", color: verrouille ? "oklch(0.66 0.02 258)" : "#fff" }}>
                      {verrouille ? "🔒" : badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: 10, borderRadius: 10, background: "var(--c-chrome-2)" }}>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--c-chrome-avatar)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{initiales}</span>
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.nom}</span>
                <span className="mono" style={{ fontSize: 10, color: "var(--c-chrome-role)" }}>{LIBELLES_ROLE[user?.role ?? ""]}</span>
              </span>
            </div>
            <button onClick={() => logout().then(() => navigate("/connexion"))} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 9, fontSize: 12, color: "var(--c-chrome-text)" }}>
              <span aria-hidden="true">⏻</span>
              <span>Se déconnecter</span>
            </button>
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", background: "#fff", borderBottom: "1px solid var(--c-border-4)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span data-muted="1" className="mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "oklch(0.54 0.02 255)" }}>{meta.crumb}</span>
              <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: "-0.015em" }}>{meta.label}</h1>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={toggle} aria-pressed={a11y} title="Contraste renforcé, tailles plus grandes"
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 11px", borderRadius: 9, fontSize: 12, fontWeight: 700, border: `1px solid ${a11y ? "oklch(0.44 0.14 258)" : "var(--c-border-2)"}`, background: a11y ? "var(--c-primary)" : "#fff", color: a11y ? "#fff" : "var(--c-text-4)" }}>
                <span aria-hidden="true">◑</span>
                <span>{a11y ? "Mode accessibilité activé" : "Mode accessibilité"}</span>
              </button>
              <Recherche />
              <Cloche notif={notif} />
            </div>
          </header>
          <main style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "22px 24px" }}>
            <Outlet />
          </main>
        </div>
      </div>
    </EcranCtx.Provider>
  );
}

function Recherche() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<S["ResultatOut"][]>([]);
  const [ouvert, setOuvert] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (q.trim().length < 2) {
      setRes([]);
      return;
    }
    const t = setTimeout(() => api.get<S["ResultatOut"][]>("/recherche", { params: { q } }).then((r) => setRes(r.data)).catch(() => setRes([])), 220);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div style={{ position: "relative" }} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOuvert(false)}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--c-border-2)", background: "var(--c-surface-2)", minWidth: 230 }}>
        <span aria-hidden="true" style={{ color: "var(--c-muted-3)", fontSize: 13 }}>⌕</span>
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setOuvert(true); }} onFocus={() => setOuvert(true)}
          placeholder="Rechercher un dossier, un client…" aria-label="Rechercher un dossier, un client ou un IMEI"
          style={{ border: 0, background: "none", outline: "none", width: "100%", fontSize: 13 }} />
      </label>
      {ouvert && q.trim().length >= 2 && (
        <div className="card" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 360, padding: 6, zIndex: 50, boxShadow: "var(--sh-modal)" }}>
          {res.length === 0 && <div data-muted="1" style={{ padding: 12, fontSize: 13, color: "var(--c-muted)" }}>Aucun résultat pour « {q} ».</div>}
          {res.map((r) => (
            <button key={r.type + r.lien + r.libelle} onClick={() => { navigate(r.lien); setOuvert(false); setQ(""); }}
              style={{ display: "flex", width: "100%", gap: 10, alignItems: "center", padding: "9px 10px", borderRadius: 8, textAlign: "left" }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--c-muted)", width: 64 }}>{r.type}</span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.libelle}</span>
                <span data-muted="1" style={{ fontSize: 12, color: "var(--c-muted)" }}>{r.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Cloche({ notif }: { notif: S["NotificationsOut"] | null }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOuvert(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  const couleur = { critique: "var(--c-danger-text)", alerte: "var(--c-warn-text)", info: "var(--c-text-5)" } as Record<string, string>;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button aria-label={`Alertes (${notif?.total ?? 0})`} aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}
        style={{ position: "relative", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--c-border-2)", background: "#fff" }}>
        <span aria-hidden="true" style={{ fontSize: 14 }}>⚠</span>
        <span style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 9, background: "var(--c-danger-solid)", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {notif?.total ?? 0}
        </span>
      </button>
      {ouvert && (
        <div className="card" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 380, padding: 8, zIndex: 50, boxShadow: "var(--sh-modal)", display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="kicker" style={{ padding: "6px 8px" }}>Alertes</span>
          {!notif?.alertes.length && <span data-muted="1" style={{ padding: 10, fontSize: 13, color: "var(--c-muted)" }}>Aucune alerte en cours.</span>}
          {notif?.alertes.map((a, i) => (
            <button key={i} onClick={() => { navigate(a.lien); setOuvert(false); }}
              style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 10px", borderRadius: 8, textAlign: "left", fontSize: 13 }}>
              <span aria-hidden="true" style={{ color: couleur[a.gravite] }}>{a.type === "stock" ? "■" : a.type === "sla" ? "◷" : "▲"}</span>
              <span style={{ color: "var(--c-text-3)", lineHeight: 1.45 }}>{a.libelle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
