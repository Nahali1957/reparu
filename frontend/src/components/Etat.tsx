import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, type ApiError } from "../api/client";
import { LIBELLES_ROLE, useAuth } from "../hooks/useAuth";
import type { EtatEcran } from "../hooks/useApi";
import { ROUTES, type Kind, type ScreenMeta } from "../screens";

/** Les quatre états de la maquette (Repar-Etats) : Loading, Empty, Error, Verrouillé. */
const EMPTY: Record<Kind, { icon: string; title: string; body: string; cta: string; what: string }> = {
  dashboard: { icon: "◧", title: "Aucune donnée sur la période", body: "Aucune réparation clôturée sur la période. Élargissez la période, ou créez un premier dossier pour alimenter les indicateurs.", cta: "Créer un dossier", what: "les indicateurs" },
  kanban: { icon: "🛠", title: "Aucun dossier de réparation", body: "Le tableau est vide : aucun appareil n'est actuellement en atelier. Le premier dossier créé apparaîtra dans la colonne « Reçu ».", cta: "Ouvrir un dossier", what: "les dossiers de réparation" },
  table: { icon: "▤", title: "Aucun élément à afficher", body: "Cette liste est vide, ou aucun élément ne correspond à vos filtres. Réinitialisez la recherche pour voir l'ensemble des enregistrements.", cta: "Ajouter un élément", what: "la liste" },
  detail: { icon: "◍", title: "Fiche introuvable", body: "Cet enregistrement a peut-être été supprimé ou fusionné. Revenez à la liste pour retrouver la bonne fiche.", cta: "Revenir à la liste", what: "la fiche" },
  form: { icon: "＋", title: "Formulaire vierge", body: "Aucun brouillon en cours. Remplissez les champs obligatoires pour créer l'enregistrement.", cta: "Commencer la saisie", what: "le formulaire" },
};

const ALT: Record<string, { key: string; icon: string; label: string }[]> = {
  technicien: [
    { key: "kanban", icon: "🛠", label: "Voir mes dossiers de réparation" },
    { key: "inventaire", icon: "📦", label: "Consulter le stock (lecture seule)" },
  ],
  responsable: [
    { key: "dashboard", icon: "◧", label: "Tableau de bord de l'atelier" },
    { key: "kanban", icon: "🛠", label: "Kanban des réparations" },
  ],
  admin: [
    { key: "dashboard", icon: "◧", label: "Tableau de bord de l'atelier" },
    { key: "comptes", icon: "🛡", label: "Gestion des comptes utilisateurs" },
  ],
};

const sk = (h: number | string, extra: React.CSSProperties = {}) => (
  <div className="skeleton" style={{ height: h, borderRadius: 14, border: "1px solid var(--c-border)", ...extra }} />
);

interface Props {
  etat: EtatEcran;
  meta: ScreenMeta;
  error?: ApiError | null;
  onRetry?: () => void;
  onEmptyCta?: () => void;
  emptyBody?: string;
  emptyTitle?: string;
  emptyCta?: string;
  children?: ReactNode;
}

export default function Etat({ etat, meta, error, onRetry, onEmptyCta, emptyBody, emptyTitle, emptyCta, children }: Props) {
  if (etat === "nominal") return <>{children}</>;
  const e = EMPTY[meta.kind];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-live="polite">
      {etat === "loading" && <Chargement kind={meta.kind} what={e.what} />}
      {etat === "empty" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center", padding: "56px 28px", borderRadius: 16, background: "#fff", border: "1px dashed var(--c-border-7)" }}>
          <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 16, background: "oklch(0.96 0.02 258)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "oklch(0.48 0.12 258)" }}>{e.icon}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, maxWidth: 440 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>{emptyTitle ?? e.title}</h3>
            <p data-muted="1" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "oklch(0.48 0.02 255)" }}>{emptyBody ?? e.body}</p>
          </div>
          {onEmptyCta && (
            <button onClick={onEmptyCta} className="btn btn-primary" style={{ padding: "11px 18px" }}>
              <span aria-hidden="true">+</span>
              <span>{emptyCta ?? e.cta}</span>
            </button>
          )}
        </div>
      )}
      {etat === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "34px 28px", borderRadius: 16, background: "#fff", border: "1px solid var(--c-danger-border-2)" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ flex: "0 0 auto", width: 42, height: 42, borderRadius: 12, background: "var(--c-danger-bg)", color: "var(--c-danger-icon)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700 }}>!</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--c-danger-text-2)" }}>Impossible de charger {e.what}</h3>
              <p data-muted="1" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--c-text-7)", maxWidth: 520 }}>
                {error?.status && error.status < 500 ? error.message : "Le serveur n'a pas répondu dans le délai imparti. Vos données ne sont pas perdues : rien n'a été modifié. Réessayez, ou contactez l'administrateur si le problème persiste."}
              </p>
              <code data-tiny="1" className="mono" style={{ alignSelf: "flex-start", fontSize: 11.5, padding: "5px 9px", borderRadius: 6, background: "oklch(0.96 0.006 258)", color: "var(--c-text-7)" }}>
                HTTP {error?.status ?? "—"} · {error?.method ?? "GET"} {error?.url ?? ""}
              </code>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button onClick={onRetry} className="btn btn-primary" style={{ padding: "11px 18px" }}>
              <span aria-hidden="true">↺</span>
              <span>Réessayer</span>
            </button>
            <a className="btn btn-secondary" style={{ padding: "11px 16px" }} href={`mailto:c.vasseur@reparu.fr?subject=${encodeURIComponent(`Incident Repar U — ${meta.label}`)}&body=${encodeURIComponent(`HTTP ${error?.status ?? "—"} · ${error?.method} ${error?.url}`)}`}>
              Signaler l'incident
            </a>
          </div>
        </div>
      )}
      {etat === "locked" && <Verrouille meta={meta} />}
    </div>
  );
}

function Chargement({ kind, what }: { kind: Kind; what: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", borderRadius: 10, background: "var(--c-primary-soft)", border: "1px solid var(--c-primary-border-3)", alignSelf: "flex-start" }}>
        <span aria-hidden="true" style={{ display: "inline-block", width: 13, height: 13, borderRadius: "50%", border: "2px solid oklch(0.80 0.06 258)", borderTopColor: "oklch(0.50 0.15 258)", animation: "spin .8s linear infinite" }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--c-primary-text-2)" }}>Chargement de {what}…</span>
      </div>
      {kind === "dashboard" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>{[0, 1, 2, 3].map((i) => <div key={i}>{sk(112)}</div>)}</div>
          {sk(250)}
        </>
      )}
      {kind === "kanban" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, alignItems: "start" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 12, background: "var(--c-surface-3)", border: "1px solid var(--c-border)" }}>
              <div className="skeleton" style={{ height: 14, width: "64%", borderRadius: 5 }} />
              <div className="skeleton" style={{ height: 74, borderRadius: 10 }} />
              <div className="skeleton" style={{ height: 74, borderRadius: 10 }} />
            </div>
          ))}
        </div>
      )}
      {kind === "table" && (
        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--c-border)", background: "#fff" }}>
          <div style={{ height: 44, background: "var(--c-surface-3)", borderBottom: "1px solid var(--c-border-5)" }} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} style={{ display: "flex", gap: 18, alignItems: "center", padding: "14px 16px", borderBottom: "1px solid oklch(0.95 0.006 258)" }}>
              <div className="skeleton" style={{ height: 12, flex: 2, borderRadius: 5 }} />
              <div style={{ height: 12, flex: 1, borderRadius: 5, background: "oklch(0.945 0.006 258)" }} />
              <div style={{ height: 12, flex: 1, borderRadius: 5, background: "oklch(0.945 0.006 258)" }} />
              <div style={{ height: 22, width: 84, borderRadius: 7, background: "var(--c-surface-5)" }} />
            </div>
          ))}
        </div>
      )}
      {(kind === "detail" || kind === "form") && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 14, background: "#fff", border: "1px solid var(--c-border)" }}>
              <div style={{ height: 11, width: "38%", borderRadius: 5, background: "oklch(0.93 0.006 258)" }} />
              <div className="skeleton" style={{ height: 16, width: "78%", borderRadius: 5 }} />
              <div style={{ height: 11, width: "56%", borderRadius: 5, background: "oklch(0.945 0.006 258)" }} />
              <div style={{ height: 56, borderRadius: 10, background: "var(--c-surface-3)" }} />
            </div>
          ))}
        </div>
      )}
      <span data-tiny="1" style={{ fontSize: 11.5, color: "var(--c-muted-2)" }}>Squelette de contenu — jamais de spinner plein écran sur une liste ou un tableau.</span>
    </div>
  );
}

export function Verrouille({ meta }: { meta: ScreenMeta }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = LIBELLES_ROLE[user?.role ?? "technicien"];
  useEffect(() => {
    // le refus est aussi demandé au serveur, qui le journalise (audit « acces_refuse »)
    if (meta.probe) api.get(meta.probe).catch(() => {});
  }, [meta.probe]);
  const now = new Date();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "34px 28px", borderRadius: 16, background: "#fff", border: "1px solid var(--c-border-3)" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span aria-hidden="true" style={{ flex: "0 0 auto", width: 42, height: 42, borderRadius: 12, background: "var(--c-primary-soft-2)", color: "oklch(0.42 0.10 258)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>🔒</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Accès non autorisé pour le rôle « {role} »</h3>
          <p data-muted="1" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--c-text-7)", maxWidth: 560 }}>
            L'écran <strong>{meta.label}</strong> est réservé aux rôles suivants : {meta.roles}. Le contrôle est appliqué côté serveur (RBAC + JWT) : la ressource n'est pas seulement masquée, elle est refusée.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", borderRadius: 12, background: "oklch(0.97 0.005 258)", border: "1px solid var(--c-border-5)" }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--c-muted)" }}>Ce que vous pouvez faire</span>
        {(ALT[user?.role ?? "technicien"] ?? ALT.technicien).map((a) => (
          <button key={a.key} onClick={() => navigate(ROUTES[a.key])} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 9, background: "#fff", border: "1px solid var(--c-border-4)", fontSize: 13, fontWeight: 600, color: "var(--c-text-3)", textAlign: "left" }}>
            <span aria-hidden="true">{a.icon}</span>
            <span style={{ flex: 1 }}>{a.label}</span>
            <span aria-hidden="true" style={{ color: "var(--c-muted-3)" }}>→</span>
          </button>
        ))}
      </div>
      <span data-tiny="1" style={{ fontSize: 11.5, color: "var(--c-muted-2)" }}>
        Journalisé : tentative d'accès refusée · {role} · {now.toLocaleDateString("fr-FR")} {now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}
