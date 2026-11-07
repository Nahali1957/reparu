import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type S } from "../api/client";
import Etat from "../components/Etat";
import { Alerte, Modal, StatutChip } from "../components/ui";
import {
  Avatar, btnPrimaire, btnSecondaire, carte, ChampsClient, clientPayload, erreurAction, erreursClient, moisAnnee,
  type ClientSaisie, type ErreurAction,
} from "../components/gestion/commun";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { date, eur } from "../utils/format";

const vide = { display: "block", padding: 14, textAlign: "center" as const, fontSize: 12, color: "oklch(0.55 0.02 255)", border: "1px dashed oklch(0.89 0.008 258)", borderRadius: 10 };

const resume = (s: string | null) => (!s ? "Diagnostic à établir" : s.length > 62 ? `${s.slice(0, 62)}…` : s);

/** 5.5 Fiche client. */
export default function FicheClient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: c, setData, etat, error, reload } = useApi<S["ClientFicheOut"]>(`/clients/${id}`);
  const [edition, setEdition] = useState<ClientSaisie | null>(null);

  const etatEcran = error?.status === 404 || error?.status === 422 ? "empty" : etat;

  return (
    <Etat etat={etatEcran} meta={SCREENS.client} error={error} onRetry={reload} emptyCta="Revenir à la liste" onEmptyCta={() => navigate("/clients")}>
      {c && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* en-tête */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", padding: 18, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.91 0.008 258)" }}>
            <Avatar nom={c.nom} taille={52} />
            <div style={{ flex: 1, minWidth: 170, display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>{c.nom}</h2>
              <span data-muted="1" style={{ fontSize: 12.5, color: "oklch(0.46 0.02 255)" }}>client depuis {moisAnnee(c.client_depuis)} · {c.ville ?? "—"}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {[
                { label: "Réparations", value: String(c.reparations), color: "oklch(0.24 0.02 255)" },
                { label: "Total facturé", value: eur(c.total_facture), color: "oklch(0.34 0.10 152)" },
                { label: "Appareils", value: String(c.appareils.length), color: "oklch(0.24 0.02 255)" },
              ].map((s) => (
                <span key={s.label} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 14px", borderRadius: 11, background: "oklch(0.975 0.004 258)", border: "1px solid oklch(0.93 0.008 258)", minWidth: 104 }}>
                  <span data-tiny="1" className="mono" style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "oklch(0.50 0.02 255)" }}>{s.label}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: s.color }}>{s.value}</span>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setEdition({ nom: c.nom, telephone: c.telephone, email: c.email ?? "", ville: c.ville ?? "" })}
                style={{ padding: "10px 14px", borderRadius: 9, border: "1px solid oklch(0.89 0.008 258)", background: "#fff", fontSize: 12.5, fontWeight: 600 }}>
                <span aria-hidden="true">✎</span> Éditer
              </button>
              <button type="button" onClick={() => navigate(`/appareils/nouveau?client=${c.id}`)}
                style={{ padding: "10px 14px", borderRadius: 9, background: "oklch(0.52 0.15 258)", color: "#fff", fontSize: 12.5, fontWeight: 700 }}>
                <span aria-hidden="true">+</span> Appareil
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 14, alignItems: "start" }}>
            {/* coordonnées */}
            <div style={carte}>
              <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Coordonnées</h3>
              {[
                { label: "Téléphone", value: c.telephone, mono: true },
                { label: "E-mail", value: c.email ?? "—", mono: false },
                { label: "Ville", value: c.ville ?? "—", mono: false },
                { label: "Identifiant", value: `#${c.id}`, mono: true },
              ].map((f) => (
                <div key={f.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingBottom: 9, borderBottom: "1px solid oklch(0.955 0.006 258)" }}>
                  <span data-muted="1" style={{ fontSize: 12, color: "oklch(0.48 0.02 255)" }}>{f.label}</span>
                  <span className={f.mono ? "mono" : undefined} style={{ fontSize: 13, fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{f.value}</span>
                </div>
              ))}
              <span data-tiny="1" style={{ fontSize: 11, lineHeight: 1.5, color: "oklch(0.52 0.02 255)" }}>
                Données personnelles — conservation 3 ans après la dernière intervention (registre RGPD).
                {c.conservation_jusquau && <> Conservées jusqu'au {date(c.conservation_jusquau)}.</>}
              </span>
            </div>

            {/* appareils */}
            <div style={carte}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Appareils rattachés</h3>
                <span className="mono" style={{ fontSize: 11.5, color: "oklch(0.50 0.02 255)" }}>
                  {c.appareils.length} {c.appareils.length > 1 ? "appareils" : "appareil"}
                </span>
              </div>
              {c.appareils.map((a) => (
                <button key={a.id} type="button" onClick={() => navigate(`/appareils/${a.id}`)} aria-label={`Modifier l'appareil ${a.marque} ${a.modele}, IMEI ${a.imei}`}
                  style={{ display: "flex", alignItems: "center", gap: 11, padding: 11, borderRadius: 11, border: "1px solid oklch(0.94 0.006 258)", background: "oklch(0.985 0.003 258)", textAlign: "left" }}>
                  <span aria-hidden="true" style={{ width: 30, height: 38, borderRadius: 6, border: "1.5px solid oklch(0.72 0.02 258)", background: "oklch(0.93 0.008 258)", flex: "0 0 auto" }} />
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{a.marque} {a.modele}</span>
                    <span data-tiny="1" className="mono" style={{ fontSize: 11, color: "oklch(0.48 0.02 255)" }}>IMEI {a.imei} · {a.couleur ?? "—"}</span>
                  </span>
                  <span data-tiny="1" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 11, color: "oklch(0.50 0.02 255)", whiteSpace: "nowrap" }}>
                    <span>déposé {date(a.depose_le)}</span>
                    <span>{a.reparations} réparation{a.reparations > 1 ? "s" : ""}</span>
                  </span>
                </button>
              ))}
              {c.appareils.length === 0 && <span data-tiny="1" style={vide}>Aucun appareil rattaché — ajoutez-en un pour ouvrir un dossier.</span>}
            </div>
          </div>

          {/* historique */}
          <div style={carte}>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Historique des réparations</h3>
            {c.historique.map((r) => (
              <button key={r.numero} type="button" onClick={() => navigate(`/reparations/${r.numero}`)}
                style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 11, padding: 12, borderRadius: 11, border: "1px solid oklch(0.94 0.006 258)", background: "oklch(0.985 0.003 258)", textAlign: "left" }}>
                <span data-underline="1" className="mono" style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.42 0.13 258)" }}>{r.numero}</span>
                <span style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.26 0.02 255)" }}>{r.appareil}</span>
                  <span data-tiny="1" style={{ fontSize: 11.5, color: "oklch(0.48 0.02 255)" }}>{resume(r.diagnostic)}</span>
                </span>
                <StatutChip statut={r.statut} />
                <span data-tiny="1" className="mono" style={{ fontSize: 11.5, color: "oklch(0.50 0.02 255)" }}>{date(r.recu_le)}</span>
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 74, textAlign: "right" }}>
                  {r.prix_ttc == null ? "à estimer" : eur(r.prix_ttc)}
                </span>
              </button>
            ))}
            {c.historique.length === 0 && <span data-tiny="1" style={vide}>Aucune intervention pour ce client.</span>}
          </div>

          {edition && (
            <EditionClient id={c.id} initial={edition} onClose={() => setEdition(null)}
              onSaved={(f) => { setData(f); setEdition(null); toast("Fiche client mise à jour.", "ok"); }} />
          )}
        </div>
      )}
    </Etat>
  );
}

function EditionClient({ id, initial, onClose, onSaved }: {
  id: number; initial: ClientSaisie; onClose: () => void; onSaved: (f: S["ClientFicheOut"]) => void;
}) {
  const [v, setV] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ErreurAction | null>(null);
  const erreurs = { ...(touched ? erreursClient(v) : {}), ...(err?.champs ?? {}) };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setErr(null);
    if (Object.keys(erreursClient(v)).length) return;
    setBusy(true);
    try {
      const r = await api.put<S["ClientFicheOut"]>(`/clients/${id}`, clientPayload(v));
      onSaved(r.data);
    } catch (ex) {
      setErr(erreurAction(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal titre="Modifier la fiche client" onClose={onClose} largeur={560}>
      <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <ChampsClient valeur={v} onChange={(x) => { setV(x); setErr(null); }} erreurs={erreurs} />
        {err && Object.keys(err.champs).length === 0 && <Alerte>{err.message}</Alerte>}
        <div style={{ display: "flex", gap: 9 }}>
          <button type="submit" disabled={busy} style={{ ...btnPrimaire, opacity: busy ? 0.6 : 1 }}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
          <button type="button" onClick={onClose} style={btnSecondaire}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
