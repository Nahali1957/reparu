import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, telecharger, toApiError, type ApiError, type S } from "../api/client";
import Etat from "../components/Etat";
import { Alerte, Pastille, tdStyle, thStyle, type Ton } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { date, eur } from "../utils/format";

/* 5.14 Devis & facturation (maquette Repar-Extra, branche isFacture). */

type Fact = S["FacturationOut"];
type Doc = S["DocumentOut"];
type Mode = S["ModeReglement"];

export default function Facturation() {
  const { numero } = useParams();
  return numero ? <Document numero={numero} /> : <Recents />;
}

/* ------------------------------------------------------------- helpers */

const GREEN = { bg: "oklch(0.965 0.03 152)", fg: "oklch(0.36 0.10 152)", bd: "oklch(0.84 0.06 152)" };
const ORANGE = { bg: "oklch(0.965 0.05 70)", fg: "oklch(0.42 0.11 62)", bd: "oklch(0.86 0.09 70)" };
const RED = { bg: "oklch(0.96 0.04 25)", fg: "oklch(0.42 0.15 25)", bd: "oklch(0.86 0.08 25)" };

function Badge({ t, icon, children }: { t: typeof GREEN; icon?: string; children: ReactNode }) {
  return (
    <span data-badge="1" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 7px", borderRadius: 7, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

const nombreFr = (v: string | number) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** Les erreurs des téléchargements arrivent en Blob : on relit le `detail` JSON du backend. */
async function erreurApi(e: unknown): Promise<ApiError> {
  const err = toApiError(e);
  const data = (e as { response?: { data?: unknown } }).response?.data;
  if (data instanceof Blob) {
    try {
      const j = JSON.parse(await data.text()) as { detail?: unknown };
      if (typeof j.detail === "string") err.message = j.detail;
    } catch {
      /* corps non JSON : on garde le message générique */
    }
  }
  return err;
}

const kicker: CSSProperties = { fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "oklch(0.52 0.02 255)" };
const carte: CSSProperties = { display: "flex", flexDirection: "column", gap: 12, padding: 17, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.91 0.008 258)" };
const th = (align: "left" | "right"): CSSProperties => ({ padding: "12px 16px", textAlign: align, fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "oklch(0.48 0.02 255)" });
const actionStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, border: "1px solid oklch(0.92 0.008 258)", background: "oklch(0.985 0.003 258)", fontSize: 12.5, fontWeight: 600, color: "oklch(0.32 0.02 255)", width: "100%",
};

const MODES: { k: Mode; l: string; i: string }[] = [
  { k: "carte", l: "Carte", i: "▭" }, { k: "especes", l: "Espèces", i: "◫" },
  { k: "virement", l: "Virement", i: "⇄" }, { k: "trois_fois", l: "3 fois", i: "⋯" },
];

/* ------------------------------------------------------------- document d'un dossier */

function Document({ numero }: { numero: string }) {
  const { data, setData, etat, error, reload } = useApi<Fact>(`/reparations/${numero}/facturation`);
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<{ ou: string; e: ApiError } | null>(null);
  const [succes, setSucces] = useState("");
  const [mode, setMode] = useState<Mode>("carte");

  /** Toutes les actions métier renvoient FacturationOut à jour. */
  const action = async (ou: string, url: string, body: object = {}, message = "") => {
    setBusy(ou);
    setErreur(null);
    setSucces("");
    try {
      const r = await api.post<Fact>(url, body);
      setData(r.data);
      if (message) toast(message, "ok");
    } catch (e) {
      setErreur({ ou, e: toApiError(e) });
    } finally {
      setBusy(null);
    }
  };

  const retour = () => navigate(`/reparations/${numero}`);

  return (
    <Etat etat={etat} meta={SCREENS.facturation} error={error} onRetry={reload}>
      {data && !data.document && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "34px 28px", borderRadius: 16, background: "#fff", border: "1px dashed var(--c-border-7)", maxWidth: 680 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ flex: "0 0 auto", width: 42, height: 42, borderRadius: 12, background: "oklch(0.96 0.02 258)", color: "oklch(0.48 0.12 258)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>€</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span style={kicker}>Dossier <span className="mono">{data.dossier}</span></span>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Aucun devis pour ce dossier</h2>
              <p data-muted="1" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--c-text-7)" }}>{data.raison_absence}</p>
            </div>
          </div>
          {erreur?.ou === "devis" && <Alerte>{erreur.e.message}</Alerte>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button className="btn btn-primary" disabled={busy !== null} onClick={() => action("devis", `/reparations/${numero}/devis`, {}, "Devis édité.")}>
              <span aria-hidden="true">€</span><span>{busy === "devis" ? "Édition…" : "Éditer le devis"}</span>
            </button>
            <Link className="btn btn-secondary" to={`/reparations/${numero}`}>
              <span aria-hidden="true">◍</span><span>Revenir au dossier de réparation</span>
            </Link>
          </div>
        </div>
      )}
      {data?.document && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 14, alignItems: "start" }}>
          <Papier doc={data.document} />
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <Reglement doc={data.document} mode={mode} setMode={setMode} busy={busy} erreur={erreur}
              onAction={(ou, chemin, body, msg) => action(ou, `/reparations/${numero}${chemin}`, body, msg)} />
            <Actions doc={data.document} numero={numero} busy={busy} setBusy={setBusy} erreur={erreur} setErreur={setErreur}
              succes={succes} setSucces={setSucces} onRetour={retour} />
          </div>
        </div>
      )}
    </Etat>
  );
}

function Papier({ doc }: { doc: Doc }) {
  const totaux = [
    { k: "Total HT", v: eur(doc.total_ht), size: 12.5, weight: 500, color: "oklch(0.40 0.02 255)", sep: {} },
    { k: "TVA 20 %", v: eur(doc.tva), size: 12.5, weight: 500, color: "oklch(0.40 0.02 255)", sep: {} },
    { k: "Total TTC", v: eur(doc.total_ttc), size: 19, weight: 700, color: "oklch(0.22 0.02 255)", sep: { paddingTop: 9, borderTop: "2px solid oklch(0.90 0.008 258)" } },
    { k: "Marge nette atelier", v: eur(doc.marge_nette), size: 12.5, weight: 700, color: "oklch(0.34 0.10 152)", sep: {} },
  ];
  return (
    <article aria-label={`${doc.type} ${doc.numero}`} style={{ display: "flex", flexDirection: "column", borderRadius: 14, overflow: "hidden", background: "#fff", border: "1px solid oklch(0.91 0.008 258)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start", padding: 22, background: "oklch(0.21 0.025 258)", color: "#fff" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 170 }}>
          <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: "oklch(0.55 0.16 258)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flex: "0 0 auto" }}>Ʀ</span>
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Repar U</span>
            <span data-tiny="1" style={{ fontSize: 10.5, color: "oklch(0.76 0.02 258)" }}>14 rue des Ateliers · 34000 Montpellier · SIRET 902 118 447</span>
          </span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "right" }}>
          <span data-tiny="1" className="mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "oklch(0.74 0.03 258)" }}>{doc.type}</span>
          <span className="mono" style={{ fontSize: 17, fontWeight: 600 }}>{doc.numero}</span>
          <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.76 0.02 258)" }}>émis le {date(doc.emis_le)}</span>
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: "20px 22px", borderBottom: "1px solid oklch(0.94 0.006 258)" }}>
        <Bloc titre="Client">
          <span style={{ fontSize: 14, fontWeight: 700 }}>{doc.client_nom}</span>
          <span data-tiny="1" style={{ fontSize: 11.5, color: "oklch(0.46 0.02 255)" }}>{[doc.client_telephone, doc.client_ville].filter(Boolean).join(" · ")}</span>
        </Bloc>
        <Bloc titre="Appareil">
          <span style={{ fontSize: 14, fontWeight: 700 }}>{doc.appareil}</span>
          <span data-tiny="1" className="mono" style={{ fontSize: 11, color: "oklch(0.46 0.02 255)" }}>IMEI {doc.imei}</span>
        </Bloc>
        <Bloc titre="Dossier">
          <Link to={`/reparations/${doc.dossier}`} className="mono" style={{ fontSize: 14, fontWeight: 600, color: "inherit" }}>{doc.dossier}</Link>
          <span data-tiny="1" style={{ fontSize: 11.5, color: "oklch(0.46 0.02 255)" }}>technicien {doc.technicien ?? "non affecté"}</span>
        </Bloc>
      </div>

      <div data-table="1" style={{ padding: "0 6px" }}>
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid oklch(0.92 0.008 258)" }}>
              <th scope="col" style={th("left")}>Désignation</th>
              <th scope="col" style={th("right")}>Qté</th>
              <th scope="col" style={th("right")}>P.U. HT</th>
              <th scope="col" style={th("right")}>Total HT</th>
            </tr>
          </thead>
          <tbody>
            {doc.lignes.map((l, i) => (
              <tr key={i} style={{ borderBottom: "1px solid oklch(0.96 0.006 258)" }}>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.26 0.02 255)" }}>{l.designation}</span>
                    {l.detail && <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.50 0.02 255)" }}>{l.detail}</span>}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "oklch(0.38 0.02 255)", whiteSpace: "nowrap" }}>
                  {nombreFr(l.qte)}{l.type === "main_oeuvre" ? " h" : ""}
                </td>
                <td className="mono" style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "oklch(0.38 0.02 255)", whiteSpace: "nowrap" }}>{eur(l.pu_ht)}</td>
                <td className="mono" style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {l.type === "forfait" && Number(l.total_ht) === 0 ? "offert" : eur(l.total_ht)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 22px 20px" }}>
        <dl style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 250, margin: 0 }}>
          {totaux.map((t) => (
            <div key={t.k} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, ...t.sep }}>
              <dt style={{ fontSize: t.size, fontWeight: t.weight, color: t.color }}>{t.k}</dt>
              <dd className="mono" style={{ margin: 0, fontSize: t.size, fontWeight: t.weight, fontVariantNumeric: "tabular-nums", color: t.color }}>{t.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div style={{ padding: "14px 22px", background: "oklch(0.975 0.004 258)", borderTop: "1px solid oklch(0.94 0.006 258)" }}>
        <span data-tiny="1" style={{ fontSize: 11, lineHeight: 1.55, color: "oklch(0.50 0.02 255)" }}>
          Garantie pièce et main-d'œuvre : 6 mois à compter de la date de restitution, hors casse et oxydation. TVA 20 % — TVA acquittée sur les débits. Pénalités de retard : 3 × le taux d'intérêt légal.
        </span>
      </div>
    </article>
  );
}

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 150 }}>
      <span data-tiny="1" style={kicker}>{titre}</span>
      {children}
    </span>
  );
}

function Reglement({ doc, mode, setMode, busy, erreur, onAction }: {
  doc: Doc; mode: Mode; setMode: (m: Mode) => void; busy: string | null; erreur: { ou: string; e: ApiError } | null;
  onAction: (ou: string, chemin: string, body?: object, message?: string) => void;
}) {
  const paye = doc.statut_reglement === "Réglé";
  const [t, icon] = paye ? [GREEN, "✓"] : doc.statut_reglement === "Devis refusé" ? [RED, "✕"] : [ORANGE, "◷"];
  const enAttente = doc.type === "DEVIS" && doc.statut_reglement === "Devis en attente";
  const refuse = doc.statut_reglement === "Devis refusé";
  const modeActif = doc.mode_reglement ?? mode;
  const err = (ou: string) => (erreur?.ou === ou ? <Alerte>{erreur.e.message}</Alerte> : null);
  const petit: CSSProperties = { padding: "8px 11px", fontSize: 12, borderRadius: 9 };

  return (
    <section style={carte} aria-labelledby="titre-reglement">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h3 id="titre-reglement" style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Statut du règlement</h3>
        <Badge t={t} icon={icon}>{doc.statut_reglement}</Badge>
      </div>

      <ol style={{ display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" }}>
        {doc.etapes.map((s, i) => (
          <li key={s.libelle} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto", alignSelf: "stretch" }}>
              <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: "50%", flex: "0 0 auto", marginTop: 3, background: s.fait ? "oklch(0.50 0.12 152)" : "#fff", border: `2px solid ${s.fait ? "oklch(0.50 0.12 152)" : "oklch(0.84 0.01 258)"}` }} />
              {i < doc.etapes.length - 1 && <span aria-hidden="true" style={{ flex: 1, width: 2, background: s.fait ? "oklch(0.84 0.06 152)" : "oklch(0.92 0.008 258)", margin: "3px 0" }} />}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 13 }}>
              <span style={{ fontSize: 12.5, fontWeight: s.fait ? 700 : 500, color: s.fait ? "oklch(0.34 0.10 152)" : "oklch(0.46 0.02 255)" }}>
                <span className="sr-only">{s.fait ? "Fait : " : "À faire : "}</span>{s.libelle}
              </span>
              <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.50 0.02 255)" }}>{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      {(enAttente || refuse) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 11, background: "oklch(0.975 0.004 258)", border: "1px solid oklch(0.92 0.008 258)" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.34 0.02 255)" }}>{refuse ? "Le client a refusé le devis" : "Réponse du client"}</span>
          {err("devis")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {enAttente && (
              <>
                <button className="btn btn-secondary" style={petit} disabled={busy !== null}
                  onClick={() => onAction("devis", "/devis/envoyer", { canal: "sms" }, "Devis envoyé par SMS au client (envoi simulé).")}>
                  <span aria-hidden="true">✉</span><span>Envoyer le devis par SMS</span>
                </button>
                <button className="btn btn-secondary" style={{ ...petit, color: "oklch(0.34 0.10 152)", borderColor: "oklch(0.84 0.06 152)" }} disabled={busy !== null}
                  onClick={() => onAction("devis", "/devis/accepter", {}, "Devis accepté par le client.")}>
                  <span aria-hidden="true">✓</span><span>Accepté par le client</span>
                </button>
                <button className="btn btn-secondary" style={{ ...petit, color: "oklch(0.42 0.15 25)", borderColor: "oklch(0.86 0.08 25)" }} disabled={busy !== null}
                  onClick={() => onAction("devis", "/devis/refuser", {}, "Refus du devis enregistré.")}>
                  <span aria-hidden="true">✕</span><span>Refusé</span>
                </button>
              </>
            )}
            {refuse && (
              <button className="btn btn-secondary" style={petit} disabled={busy !== null}
                onClick={() => onAction("devis", "/devis", {}, "Nouveau devis édité.")}>
                <span aria-hidden="true">€</span><span>Éditer le devis</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span id="lbl-mode" style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.34 0.02 255)" }}>Mode de règlement</span>
        <div role="radiogroup" aria-labelledby="lbl-mode" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MODES.map((m) => {
            const on = modeActif === m.k;
            return (
              <button key={m.k} role="radio" aria-checked={on} disabled={paye} onClick={() => setMode(m.k)}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: on ? 700 : 500, border: `1.5px solid ${on ? "oklch(0.82 0.06 258)" : "oklch(0.91 0.008 258)"}`, background: on ? "oklch(0.96 0.025 258)" : "#fff", color: on ? "oklch(0.36 0.12 258)" : "oklch(0.40 0.02 255)", opacity: paye && !on ? 0.6 : 1 }}>
                <span aria-hidden="true">{m.i}</span><span>{m.l}</span>
              </button>
            );
          })}
        </div>
      </div>

      {err("encaisser")}
      <button disabled={paye || !doc.peut_encaisser || busy !== null} aria-describedby={!paye && doc.raison_encaissement ? "raison-enc" : undefined}
        onClick={() => onAction("encaisser", "/encaisser", { mode }, "Règlement enregistré.")}
        style={{ padding: 13, borderRadius: 10, fontSize: 13.5, fontWeight: 700, ...(paye
          ? { background: "oklch(0.965 0.03 152)", color: "oklch(0.34 0.10 152)", border: "1px solid oklch(0.86 0.06 152)" }
          : { background: "oklch(0.52 0.15 258)", color: "#fff", opacity: doc.peut_encaisser ? 1 : 0.5 }) }}>
        {paye ? "Règlement encaissé ✓" : busy === "encaisser" ? "Encaissement…" : `Encaisser ${eur(doc.total_ttc)}`}
      </button>
      {!paye && doc.raison_encaissement && (
        <span id="raison-enc" data-tiny="1" data-muted="1" style={{ fontSize: 11.5, lineHeight: 1.45, color: "oklch(0.46 0.02 255)", marginTop: -4 }}>
          <span aria-hidden="true">ⓘ </span>{doc.raison_encaissement}
        </span>
      )}
    </section>
  );
}

function Actions({ doc, numero, busy, setBusy, erreur, setErreur, succes, setSucces, onRetour }: {
  doc: Doc; numero: string; busy: string | null; setBusy: (b: string | null) => void;
  erreur: { ou: string; e: ApiError } | null; setErreur: (e: { ou: string; e: ApiError } | null) => void;
  succes: string; setSucces: (s: string) => void; onRetour: () => void;
}) {
  const lancer = async (ou: string, f: () => Promise<string>) => {
    setBusy(ou);
    setErreur(null);
    setSucces("");
    try {
      setSucces(await f());
    } catch (e) {
      setErreur({ ou: "actions", e: await erreurApi(e) });
    } finally {
      setBusy(null);
    }
  };
  const liste = [
    { icon: "⤓", label: "Télécharger le PDF", run: () => lancer("pdf", async () => {
      await telecharger(`/reparations/${numero}/document.pdf`, `${doc.numero}.pdf`);
      return "PDF généré — prêt à imprimer.";
    }) },
    { icon: "✉", label: "Envoyer au client par e-mail", run: () => lancer("email", async () => {
      const r = await api.post<S["Message"]>(`/reparations/${numero}/document/envoyer`);
      return r.data.detail;
    }) },
    { icon: "🏷", label: "Imprimer le bon de restitution", run: () => lancer("bon", async () => {
      await telecharger(`/reparations/${numero}/bon-restitution.pdf`, `restitution-${numero}.pdf`, true);
      return "Bon de restitution ouvert dans un nouvel onglet.";
    }) },
    { icon: "◍", label: "Revenir au dossier de réparation", run: onRetour },
  ];
  return (
    <section style={{ ...carte, gap: 9 }} aria-labelledby="titre-actions">
      <h3 id="titre-actions" style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Actions</h3>
      {liste.map((a) => (
        <button key={a.label} onClick={a.run} disabled={busy !== null} style={{ ...actionStyle, opacity: busy && busy !== "actions" ? 0.85 : 1 }}>
          <span aria-hidden="true" style={{ width: 18, textAlign: "center" }}>{a.icon}</span>
          <span style={{ flex: 1, textAlign: "left" }}>{a.label}</span>
          <span aria-hidden="true" style={{ color: "oklch(0.58 0.02 255)" }}>›</span>
        </button>
      ))}
      {erreur?.ou === "actions" && <Alerte>{erreur.e.message}</Alerte>}
      {succes && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderRadius: 10, background: "oklch(0.965 0.03 152)", border: "1px solid oklch(0.86 0.06 152)" }}>
          <span aria-hidden="true" style={{ color: "oklch(0.38 0.11 152)", fontWeight: 700 }}>✓</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.34 0.10 152)" }}>{succes}</span>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- liste (menu « Devis & facturation ») */

const TON_STATUT: Record<string, [Ton, string]> = {
  "Réglé": ["ok", "✓"], "Accepté": ["primary", "●"], "En attente": ["warn", "◷"], "Refusé": ["danger", "✕"],
};

function Recents() {
  const { data, etat, error, reload } = useApi<S["DocumentRecentOut"][]>("/facturation/recents", (d) => d.length === 0);
  const navigate = useNavigate();
  return (
    <Etat etat={etat} meta={SCREENS.facturation} error={error} onRetry={reload}
      emptyTitle="Aucun devis ni facture" emptyBody="Les devis apparaissent ici dès qu'ils sont édités depuis un dossier de réparation (valeur retenue renseignée, puis « Éditer le devis »)."
      emptyCta="Ouvrir le Kanban des réparations" onEmptyCta={() => navigate("/reparations")}>
      {data && (
        <section className="card" style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "16px 18px" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>Documents récents</h2>
            <span data-muted="1" style={{ fontSize: 12, color: "var(--c-muted)" }}>Derniers devis et factures émis — ouvrez un document pour le faire accepter, l'encaisser ou l'envoyer.</span>
          </div>
          <table data-table="1" style={{ width: "100%" }}>
            <thead>
              <tr>
                {["Numéro", "Type", "Dossier", "Client", "Émis le", "Total TTC", "Statut", ""].map((h, i) => (
                  <th key={i} scope="col" style={{ ...thStyle, textAlign: h === "Total TTC" ? "right" : "left" }}>{h ? h.toUpperCase() : <span className="sr-only">Ouvrir</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => {
                const [ton, icon] = TON_STATUT[d.statut] ?? ["neutral", "●"];
                return (
                  <tr key={d.numero}>
                    <td style={{ ...tdStyle, fontWeight: 600 }} className="mono">{d.numero}</td>
                    <td style={tdStyle}>{d.type}</td>
                    <td style={tdStyle}><Link to={`/reparations/${d.dossier}`} className="mono" data-underline="1">{d.dossier}</Link></td>
                    <td style={tdStyle}>{d.client_nom}</td>
                    <td style={tdStyle} className="mono">{date(d.emis_le)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }} className="mono">{eur(d.total_ttc)}</td>
                    <td style={tdStyle}><Pastille ton={ton} icon={icon}>{d.statut}</Pastille></td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <Link to={`/reparations/${d.dossier}/facture`} aria-label={`Ouvrir ${d.type.toLowerCase()} ${d.numero}`} style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>Ouvrir →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </Etat>
  );
}
