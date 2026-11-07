import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type S } from "../api/client";
import Etat from "../components/Etat";
import { Alerte } from "../components/ui";
import {
  Avatar, btnPrimaire, btnSecondaire, ChampsClient, CLIENT_VIDE, clientPayload, erreurAction, erreursClient, useDebounce,
  type ClientSaisie, type ErreurAction,
} from "../components/gestion/commun";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { eur } from "../utils/format";

const TAILLE = 20;

const th = (droite = false): CSSProperties => ({
  padding: "11px 14px", textAlign: droite ? "right" : "left", fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
  textTransform: "uppercase", color: "oklch(0.46 0.02 255)", whiteSpace: "nowrap",
});
const td: CSSProperties = { padding: "12px 14px" };
const btnPage: CSSProperties = { padding: "6px 11px", borderRadius: 8, border: "1px solid oklch(0.90 0.008 258)", background: "#fff", fontSize: 12 };

/** 5.6 Liste des clients. */
export default function Clients() {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState("");
  const recherche = useDebounce(q.trim(), 300);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [recherche]);

  const url = `/clients?${new URLSearchParams({ ...(recherche ? { q: recherche } : {}), page: String(page), taille: String(TAILLE) })}`;
  const { data, etat, error, reload } = useApi<S["Page_ClientLigneOut_"]>(url, (d) => d.items.length === 0);

  const [formOpen, setFormOpen] = useState(false);
  const [nc, setNc] = useState<ClientSaisie>(CLIENT_VIDE);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ErreurAction | null>(null);

  const toggleForm = () => {
    setFormOpen((o) => !o);
    setTouched(false);
    setErr(null);
  };

  const erreurs = { ...(touched ? erreursClient(nc) : {}), ...(err?.champs ?? {}) };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setErr(null);
    if (Object.keys(erreursClient(nc)).length) return;
    setBusy(true);
    try {
      const r = await api.post<S["ClientFicheOut"]>("/clients", clientPayload(nc));
      toast(`Fiche client créée : ${r.data.nom}.`, "ok");
      navigate(`/clients/${r.data.id}`);
    } catch (ex) {
      setErr(erreurAction(ex));
    } finally {
      setBusy(false);
    }
  };

  const total = data?.total ?? 0;
  const nbPages = Math.max(1, Math.ceil(total / TAILLE));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", borderRadius: 10, background: "#fff", border: "1px solid oklch(0.89 0.008 258)" }}>
          <span aria-hidden="true" style={{ color: "oklch(0.55 0.02 255)" }}>⌕</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par nom ou téléphone…"
            aria-label="Rechercher un client" style={{ border: 0, background: "none", outline: "none", width: "100%", fontSize: 13.5 }} />
        </label>
        <button type="button" onClick={toggleForm} aria-expanded={formOpen}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700,
            ...(formOpen ? { border: "1px solid oklch(0.89 0.008 258)", background: "#fff", color: "oklch(0.34 0.02 255)" } : { background: "oklch(0.52 0.15 258)", color: "#fff" }),
          }}>
          <span aria-hidden="true">{formOpen ? "✕" : "+"}</span>
          <span>{formOpen ? "Fermer le formulaire" : "Ajouter un client"}</span>
        </button>
      </div>

      {formOpen && (
        <form onSubmit={submit} noValidate aria-label="Nouveau client"
          style={{ display: "flex", flexDirection: "column", gap: 13, padding: 17, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.84 0.04 258)", borderLeft: "4px solid oklch(0.52 0.15 258)" }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Nouveau client</span>
          <ChampsClient valeur={nc} onChange={(v) => { setNc(v); setErr(null); }} erreurs={erreurs} />
          {err && Object.keys(err.champs).length === 0 && <Alerte>{err.message}</Alerte>}
          <div style={{ display: "flex", gap: 9 }}>
            <button type="submit" disabled={busy} style={{ ...btnPrimaire, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Création…" : "Créer la fiche client"}
            </button>
            <button type="button" onClick={toggleForm} style={btnSecondaire}>Annuler</button>
          </div>
        </form>
      )}

      <Etat etat={etat} meta={SCREENS.clients} error={error} onRetry={reload}
        emptyTitle={recherche ? "Aucun client trouvé" : "Aucun client"}
        emptyBody={recherche ? `Aucun client ne correspond à « ${recherche} ». Vérifiez l'orthographe ou le numéro, ou créez la fiche.` : undefined}
        emptyCta="Ajouter un client" onEmptyCta={() => { setFormOpen(true); setTouched(false); }}>
        {data && (
          <div data-table="1" style={{ borderRadius: 14, overflow: "hidden", background: "#fff", border: "1px solid oklch(0.91 0.008 258)" }}>
            <table style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "oklch(0.965 0.005 258)", borderBottom: "1px solid oklch(0.91 0.008 258)" }}>
                  <th scope="col" style={th()}>Client</th>
                  <th scope="col" style={th()}>Téléphone</th>
                  <th scope="col" style={th()}>Ville</th>
                  <th scope="col" style={th()}>Appareils</th>
                  <th scope="col" style={th(true)}>Réparations</th>
                  <th scope="col" style={th(true)}>Total facturé</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} style={{ borderBottom: "1px solid oklch(0.955 0.006 258)", cursor: "pointer" }}>
                    <td style={td}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/clients/${c.id}`); }}
                        aria-label={`Ouvrir la fiche de ${c.nom}`} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
                        <Avatar nom={c.nom} />
                        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                          <span data-underline="1" style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.34 0.12 258)" }}>{c.nom}</span>
                          <span data-tiny="1" className="mono" style={{ fontSize: 11, color: "oklch(0.50 0.02 255)" }}>#{c.id}</span>
                        </span>
                      </button>
                    </td>
                    <td className="mono" style={{ ...td, fontSize: 12.5, color: "oklch(0.34 0.02 255)", whiteSpace: "nowrap" }}>{c.telephone}</td>
                    <td style={{ ...td, color: "oklch(0.40 0.02 255)" }}>{c.ville ?? "—"}</td>
                    <td style={td}>
                      {c.appareils > 0 ? (
                        <span style={{ padding: "3px 8px", borderRadius: 7, background: "oklch(0.96 0.006 258)", border: "1px solid oklch(0.92 0.008 258)", fontSize: 11.5, color: "oklch(0.36 0.02 255)", whiteSpace: "nowrap" }}>
                          {c.appareils} appareil{c.appareils > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span data-muted="1" style={{ fontSize: 12, color: "oklch(0.55 0.02 255)" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "oklch(0.36 0.02 255)" }}>{c.reparations}</td>
                    <td className="mono" style={{ ...td, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{eur(c.total_facture)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "oklch(0.98 0.003 258)" }}>
              <span data-tiny="1" style={{ fontSize: 11.5, color: "oklch(0.50 0.02 255)" }}>
                {total.toLocaleString("fr-FR")} clients · tri par nom{nbPages > 1 ? ` · page ${page} / ${nbPages}` : ""}
              </span>
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" style={{ ...btnPage, opacity: page <= 1 ? 0.5 : 1 }} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Précédent</button>
                <button type="button" style={{ ...btnPage, opacity: page >= nbPages ? 0.5 : 1 }} disabled={page >= nbPages} onClick={() => setPage((p) => p + 1)}>Suivant ›</button>
              </span>
            </div>
          </div>
        )}
      </Etat>
    </div>
  );
}
