import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, toApiError, type ApiError, type S } from "../api/client";
import Etat from "../components/Etat";
import { Alerte, Field, Modal } from "../components/ui";
import { Badge, GREEN, NEUTRAL, ORANGE, RED, SourceChip, TEAL, btnAction, carte, entier, paletteStock, tableWrap, th, type Palette } from "../components/stocks/commun";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { dateHeure, eur } from "../utils/format";

type Piece = S["PieceOut"];
type Filtre = "" | "En stock" | "Seuil bas" | "Rupture";

const FILTRES: { k: Filtre; cle: string; l: string; i: string; m: Palette }[] = [
  { k: "", cle: "Toutes", l: "Toutes", i: "▤", m: NEUTRAL },
  { k: "En stock", cle: "En stock", l: "En stock", i: "●", m: GREEN },
  { k: "Seuil bas", cle: "Seuil bas", l: "Seuil bas", i: "▲", m: ORANGE },
  { k: "Rupture", cle: "Rupture", l: "Rupture", i: "■", m: RED },
];

const signe = (n: number) => `${n > 0 ? "+" : ""}${n}`;

export default function Inventaire() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const ecriture = can("stocks.ecrire");
  const readOnly = !ecriture;

  const [filtre, setFiltre] = useState<Filtre>("");
  const [saisie, setSaisie] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(saisie.trim()), 250);
    return () => clearTimeout(t);
  }, [saisie]);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (filtre) p.set("statut", filtre);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/pieces${s ? `?${s}` : ""}`;
  }, [filtre, q]);

  const inv = useApi<S["InventaireOut"]>(url, (d) => d.compteurs["Toutes"] === 0);
  const mvts = useApi<S["MouvementOut"][]>("/mouvements?limit=10");
  const prev = useApi<S["PrevisionOut"][]>("/ia/prevision");

  const [ajust, setAjust] = useState<{ piece: Piece; sens: 1 | -1 } | null>(null);
  const [bcCrees, setBcCrees] = useState<S["BonCommandeOut"][] | null>(null);
  const [bcBusy, setBcBusy] = useState(false);
  const [bcErr, setBcErr] = useState<string | null>(null);

  const generer = async () => {
    setBcBusy(true);
    setBcErr(null);
    try {
      const r = await api.post<S["BonCommandeOut"][]>("/bons-commande/generer");
      setBcCrees(r.data);
    } catch (e) {
      setBcErr(toApiError(e).message);
    } finally {
      setBcBusy(false);
    }
  };

  const toutRecharger = () => {
    void inv.reload();
    void mvts.reload();
    void prev.reload();
  };

  const compteurs = inv.data?.compteurs ?? {};
  const pieces = inv.data?.pieces ?? [];

  return (
    <Etat etat={inv.etat} meta={SCREENS.inventaire} error={inv.error} onRetry={inv.reload}
      emptyTitle="Aucune pièce référencée" emptyBody="L'inventaire est vide : aucune pièce détachée n'est encore référencée dans le stock de l'atelier.">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {readOnly && (
          <div role="note" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 11, background: "oklch(0.96 0.02 258)", border: "1px solid oklch(0.89 0.03 258)" }}>
            <span aria-hidden="true" style={{ color: "oklch(0.40 0.11 258)" }}>👁</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "oklch(0.34 0.07 258)" }}>
              <strong>Consultation seule.</strong> En tant que Technicien vous voyez les niveaux de stock mais ne pouvez pas les corriger. Signalez un écart à l'administrateur.
            </span>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center" }}>
          <div role="group" aria-label="Filtrer par statut de stock" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {FILTRES.map((f) => {
              const on = filtre === f.k;
              return (
                <button key={f.cle} aria-pressed={on} onClick={() => setFiltre(f.k)}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 10, fontSize: 12.5, fontWeight: on ? 700 : 500, background: on ? f.m.bg : "#fff", color: on ? f.m.fg : "oklch(0.40 0.02 255)", border: `1.5px solid ${on ? f.m.bd : "oklch(0.91 0.008 258)"}` }}>
                  <span aria-hidden="true">{f.i}</span>
                  <span>{f.l}</span>
                  <span className="mono" style={{ minWidth: 19, padding: "1px 5px", borderRadius: 6, fontSize: 10.5, fontWeight: 700, textAlign: "center", background: on ? "oklch(1 0 0 / 0.6)" : "oklch(0.96 0.005 258)", color: on ? f.m.fg : "oklch(0.46 0.02 255)" }}>
                    {compteurs[f.cle] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 11px", borderRadius: 10, border: "1px solid oklch(0.91 0.008 258)", background: "#fff", minWidth: 220 }}>
            <span aria-hidden="true" style={{ color: "var(--c-muted-3)", fontSize: 13 }}>⌕</span>
            <input type="search" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Désignation ou référence…" aria-label="Rechercher une pièce par désignation ou référence"
              style={{ border: 0, outline: "none", background: "none", width: "100%", fontSize: 12.5 }} />
          </label>
          <span style={{ flex: 1 }} />
          <button disabled={readOnly || bcBusy} onClick={() => void generer()} style={btnAction(!readOnly)} aria-busy={bcBusy}
            title={readOnly ? "Réservé à l'administrateur et au responsable" : undefined}>
            <span aria-hidden="true">⇄</span>
            <span>{bcBusy ? "Génération…" : "Générer un bon de commande"}</span>
          </button>
        </div>
        {bcErr && <Alerte>{bcErr}</Alerte>}

        <div data-table="1" style={tableWrap}>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "oklch(0.965 0.005 258)", borderBottom: "1px solid var(--c-border)" }}>
                <th scope="col" style={th("left")}>Pièce détachée</th>
                <th scope="col" style={th("left")}>Compatibilité</th>
                <th scope="col" style={th("left")}>Niveau de stock</th>
                <th scope="col" style={th("left")}>Statut</th>
                <th scope="col" style={th("left")}>Dernier mouvement</th>
                <th scope="col" style={th("right")}>Prix achat</th>
                <th scope="col" style={th("right")}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {pieces.length === 0 && (
                <tr>
                  <td colSpan={7} data-muted="1" style={{ padding: "28px 14px", textAlign: "center", fontSize: 13, color: "var(--c-muted)" }}>
                    Aucune pièce ne correspond à ces filtres.
                  </td>
                </tr>
              )}
              {pieces.map((p) => (
                <LignePiece key={p.id} p={p} readOnly={readOnly} onAjuster={(sens) => setAjust({ piece: p, sens })}
                  onComparer={() => navigate(`/fournisseurs?piece=${p.id}`)} />
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 14, alignItems: "start" }}>
          <MouvementsRecents etat={mvts.etat} data={mvts.data} error={mvts.error} onRetry={mvts.reload} />
          <Previsions etat={prev.etat} data={prev.data} error={prev.error} onRetry={prev.reload} />
        </div>
      </div>

      {ajust && (
        <ModaleAjustement piece={ajust.piece} sens={ajust.sens} onClose={() => setAjust(null)}
          onOk={(m) => {
            setAjust(null);
            toast(`Mouvement enregistré : ${signe(m.qte)} ${m.piece} (${m.motif}).`, "ok");
            toutRecharger();
          }} />
      )}
      {bcCrees && <ModaleBonsCommande crees={bcCrees} onClose={() => { setBcCrees(null); toutRecharger(); }} />}
    </Etat>
  );
}

function LignePiece({ p, readOnly, onAjuster, onComparer }: { p: Piece; readOnly: boolean; onAjuster: (s: 1 | -1) => void; onComparer: () => void }) {
  const m = paletteStock(p.statut);
  const mv = p.dernier_mouvement;
  const largeur = Math.min(100, Math.max(3, Math.round(p.niveau * 100)));
  const btn = (plus: boolean) => ({
    padding: "7px 11px", borderRadius: 8, fontSize: 13, fontWeight: 700,
    border: `1px solid ${readOnly ? "oklch(0.94 0.006 258)" : plus ? "oklch(0.84 0.05 258)" : "oklch(0.90 0.008 258)"}`,
    background: readOnly ? "oklch(0.98 0.003 258)" : plus ? "oklch(0.96 0.025 258)" : "#fff",
    color: readOnly ? "oklch(0.80 0.008 258)" : plus ? "oklch(0.38 0.12 258)" : "oklch(0.36 0.02 255)",
  });
  return (
    <tr style={{ borderBottom: "1px solid oklch(0.955 0.006 258)" }}>
      <td style={{ padding: "12px 14px" }}>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--c-text-2)" }}>{p.designation}</span>
          <span data-tiny="1" className="mono" style={{ fontSize: 11, color: "var(--c-muted)" }}>réf. {p.reference}</span>
        </span>
      </td>
      <td style={{ padding: "12px 14px", color: "oklch(0.38 0.02 255)" }}>{p.compatibilite.join(", ") || "—"}</td>
      <td style={{ padding: "12px 14px", minWidth: 150 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 9 }} title={`Stock ${p.stock} pour un seuil de ${p.seuil}`}>
          <span aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: 99, background: "oklch(0.93 0.008 258)", overflow: "hidden", display: "block" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 99, width: `${largeur}%`, background: m.fg }} />
          </span>
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: m.fg, minWidth: 44, textAlign: "right" }}>
            {p.stock}/{p.seuil}
          </span>
        </span>
      </td>
      <td style={{ padding: "12px 14px" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
          <Badge m={m} icon={m.icon}>{p.statut}</Badge>
          {p.commande_en_cours && <Badge m={{ bg: "var(--c-primary-soft)", fg: "var(--c-primary-text)", bd: "var(--c-primary-border)" }} icon="⇄">commande en cours</Badge>}
        </span>
      </td>
      <td style={{ padding: "12px 14px" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {mv ? <SourceChip source={mv.source} long /> : <span data-muted="1" style={{ fontSize: 12, color: "var(--c-muted)" }}>—</span>}
          <span data-tiny="1" style={{ fontSize: 10.5, color: "var(--c-muted-2)" }}>
            {mv ? (
              <>
                {dateHeure(mv.le)} · <span className="mono" style={{ fontWeight: 700, color: mv.qte > 0 ? "var(--c-ok-text)" : "var(--c-danger-text)" }}>{signe(mv.qte)}</span>
              </>
            ) : "aucun mouvement"}
          </span>
        </span>
      </td>
      <td className="mono" style={{ padding: "12px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(p.prix_achat)}</td>
      <td style={{ padding: "10px 14px" }}>
        <span style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
          <button disabled={readOnly} onClick={() => onAjuster(-1)} aria-label={`Retirer une unité de ${p.designation}`} style={btn(false)}><span aria-hidden="true">−</span></button>
          <button disabled={readOnly} onClick={() => onAjuster(1)} aria-label={`Ajouter une unité de ${p.designation}`} style={btn(true)}><span aria-hidden="true">+</span></button>
          <button onClick={onComparer} aria-label={`Comparer les fournisseurs pour ${p.designation}`}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid oklch(0.90 0.008 258)", background: "#fff", fontSize: 11.5, fontWeight: 600, color: "oklch(0.36 0.02 255)" }}>
            Comparer
          </button>
        </span>
      </td>
    </tr>
  );
}

interface Bloc<T> { etat: string; data: T | null; error: ApiError | null; onRetry: () => void }

function EtatBloc({ etat, error, onRetry, vide }: { etat: string; error: ApiError | null; onRetry: () => void; vide: string }) {
  if (etat === "loading") return <>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 46, borderRadius: 10 }} />)}</>;
  if (etat === "error" || etat === "locked")
    return (
      <Alerte>
        {error?.message ?? "Chargement impossible."}{" "}
        <button onClick={onRetry} style={{ textDecoration: "underline", fontWeight: 700 }}>Réessayer</button>
      </Alerte>
    );
  return <span data-muted="1" style={{ fontSize: 12.5, color: "var(--c-muted)" }}>{vide}</span>;
}

function MouvementsRecents({ etat, data, error, onRetry }: Bloc<S["MouvementOut"][]>) {
  return (
    <section style={{ ...carte, gap: 10 }} aria-label="Mouvements récents">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Mouvements récents</h3>
        <span style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600, color: "oklch(0.36 0.08 195)" }}><span aria-hidden="true">◉</span>capteur</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600, color: "var(--c-text-7)" }}><span aria-hidden="true">✎</span>manuel</span>
        </span>
      </div>
      {data && data.length > 0
        ? data.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderRadius: 10, border: "1px solid oklch(0.95 0.006 258)", background: "var(--c-surface-2)" }}>
            <span className="mono" style={{ minWidth: 38, textAlign: "center", padding: "4px 7px", borderRadius: 8, fontSize: 12, fontWeight: 700, ...(m.qte > 0 ? { background: GREEN.bg, color: GREEN.fg } : { background: RED.bg, color: "oklch(0.44 0.14 25)" }) }}>
              {signe(m.qte)}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.28 0.02 255)" }}>{m.piece}</span>
              <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.48 0.02 255)" }}>{m.reparation ?? m.motif} · {m.par}</span>
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
              <SourceChip source={m.source} />
              <span data-tiny="1" className="mono" style={{ fontSize: 10.5, color: "var(--c-muted-2)" }}>{dateHeure(m.le)}</span>
            </span>
          </div>
        ))
        : <EtatBloc etat={etat} error={error} onRetry={onRetry} vide="Aucun mouvement de stock enregistré." />}
    </section>
  );
}

function Previsions({ etat, data, error, onRetry }: Bloc<S["PrevisionOut"][]>) {
  const lignes = useMemo(() => {
    if (!data) return [];
    const rang = (p: S["PrevisionOut"]) => (p.action.includes("urgent") ? 0 : p.quantite_a_commander > 0 ? 1 : 2);
    return [...data]
      .sort((a, b) => rang(a) - rang(b) || (a.couverture_j ?? 1e9) - (b.couverture_j ?? 1e9) || b.prevision_30j - a.prevision_30j)
      .slice(0, 8);
  }, [data]);
  const modele = data?.[0]?.modele_version;
  return (
    <section style={{ ...carte, gap: 11 }} aria-label="Prévision de consommation">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Prévision de consommation</h3>
        <span data-tiny="1" style={{ fontSize: 11, color: "var(--c-muted)" }}>moyennes mobiles · 30 j{modele ? ` · modèle ${modele}` : ""}</span>
      </div>
      {lignes.length > 0
        ? lignes.map((pv) => {
          const urgent = pv.action.includes("urgent");
          const commander = pv.action.includes("Commander");
          const ecartCapteur = pv.stock_observe !== null && pv.stock_observe < pv.stock;
          return (
            <div key={pv.piece_id} style={{ display: "flex", alignItems: "center", gap: 11, padding: 11, borderRadius: 10, border: "1px solid oklch(0.95 0.006 258)", background: "var(--c-surface-2)" }}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "oklch(0.28 0.02 255)" }}>{pv.designation}</span>
                <span data-tiny="1" style={{ fontSize: 11, color: "oklch(0.48 0.02 255)" }}>
                  {entier(pv.conso_30j)} consommées → {entier(pv.prevision_30j)} prévues · couverture {pv.couverture_j === null ? "—" : `${Math.round(pv.couverture_j)} j`}
                  {ecartCapteur && <> · <span style={{ color: TEAL.fg, fontWeight: 600 }}><span aria-hidden="true">◉ </span>capteur : {pv.stock_observe}</span></>}
                </span>
              </span>
              <Badge m={urgent ? RED : commander ? ORANGE : GREEN}>{pv.action}</Badge>
            </div>
          );
        })
        : <EtatBloc etat={etat} error={error} onRetry={onRetry} vide="Aucune prévision disponible." />}
    </section>
  );
}

function ModaleAjustement({ piece, sens, onClose, onOk }: { piece: Piece; sens: 1 | -1; onClose: () => void; onOk: (m: S["MouvementOut"]) => void }) {
  const [qte, setQte] = useState(String(sens));
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(qte);
  const qteInvalide = !Number.isInteger(n) || n === 0;
  const motifInvalide = motif.trim().length < 3;

  const valider = async () => {
    if (qteInvalide || motifInvalide) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<S["MouvementOut"]>(`/pieces/${piece.id}/ajustement`, { qte: n, motif: motif.trim() });
      onOk(r.data);
    } catch (e) {
      setErr(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal titre="Correction de stock" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{piece.designation}</span>
        <span data-tiny="1" className="mono" style={{ fontSize: 11.5, color: "var(--c-muted)" }}>réf. {piece.reference} · stock comptable actuel : {piece.stock}</span>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void valider(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Quantité (signée)" required hint={`Négatif pour retirer, positif pour ajouter. Nouveau stock : ${qteInvalide ? "—" : piece.stock + n}`}
          error={qte !== "" && qteInvalide ? "Saisissez un nombre entier non nul." : null}>
          <input className="input mono" type="number" step={1} value={qte} onChange={(e) => setQte(e.target.value)} aria-invalid={qteInvalide} style={{ width: 140, fontWeight: 700 }} autoFocus />
        </Field>
        <Field label="Motif" required hint="Obligatoire : le mouvement est tracé et nominatif.">
          <input className="input" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : inventaire tournant, casse, réception fournisseur…" maxLength={200} />
        </Field>
        {err && <Alerte>{err}</Alerte>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy || qteInvalide || motifInvalide}>
            <span aria-hidden="true">✓</span>
            <span>{busy ? "Enregistrement…" : "Enregistrer le mouvement"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

const LIB_BC: Record<string, { l: string; m: Palette }> = {
  brouillon: { l: "Brouillon", m: NEUTRAL },
  envoye: { l: "Envoyé", m: ORANGE },
  recu: { l: "Réceptionné", m: GREEN },
};

function ModaleBonsCommande({ crees: init, onClose }: { crees: S["BonCommandeOut"][]; onClose: () => void }) {
  const toast = useToast();
  const [crees, setCrees] = useState<S["BonCommandeOut"][]>(init);
  const [enCours, setEnCours] = useState<S["BonCommandeOut"][]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    api.get<S["BonCommandeOut"][]>("/bons-commande")
      .then((r) => setEnCours(r.data.filter((b) => b.statut !== "recu" && !init.some((c) => c.id === b.id))))
      .catch((e) => setErr(toApiError(e).message));
  }, [init]);

  const agir = async (bc: S["BonCommandeOut"], action: "envoyer" | "receptionner") => {
    setBusy(bc.id);
    setErr(null);
    try {
      const r = await api.post<S["BonCommandeOut"]>(`/bons-commande/${bc.id}/${action}`);
      const maj = (l: S["BonCommandeOut"][]) => l.map((b) => (b.id === r.data.id ? r.data : b));
      setCrees(maj);
      setEnCours(maj);
      toast(action === "envoyer" ? `Bon ${r.data.numero} envoyé à ${r.data.fournisseur} (envoi simulé).` : `Bon ${r.data.numero} réceptionné : stock mis à jour.`, "ok");
    } catch (e) {
      setErr(toApiError(e).message);
    } finally {
      setBusy(null);
    }
  };

  const carteBC = (bc: S["BonCommandeOut"]) => {
    const st = LIB_BC[bc.statut] ?? LIB_BC.brouillon;
    return (
      <div key={bc.id} style={{ display: "flex", flexDirection: "column", gap: 9, padding: 13, borderRadius: 12, border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 700 }}>{bc.numero}</span>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{bc.fournisseur}</span>
          <Badge m={st.m}>{st.l}</Badge>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
          {bc.lignes.map((l) => (
            <li key={l.piece_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
              <span>{l.qte} × {l.designation}</span>
              <span className="mono" style={{ color: "var(--c-text-6)" }}>{eur(l.prix_ht)} HT</span>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>Total : <span className="mono">{eur(bc.total_ht)} HT</span></span>
          {bc.statut === "brouillon" && (
            <button className="btn btn-secondary" style={{ padding: "7px 12px", fontSize: 12.5 }} disabled={busy !== null} onClick={() => void agir(bc, "envoyer")}>
              <span aria-hidden="true">✉</span>Envoyer
            </button>
          )}
          {bc.statut !== "recu" && (
            <button className="btn btn-primary" style={{ padding: "7px 12px", fontSize: 12.5 }} disabled={busy !== null} onClick={() => void agir(bc, "receptionner")}>
              <span aria-hidden="true">✓</span>Réceptionner
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal titre="Bons de commande" onClose={onClose} largeur={600}>
      {err && <Alerte>{err}</Alerte>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="kicker">Générés à l'instant · {crees.length}</span>
          {crees.length === 0
            ? <Alerte ton="info">Aucune pièce sous le seuil sans commande en cours.</Alerte>
            : crees.map(carteBC)}
      </div>
      {enCours.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="kicker">Bons en attente de réception · {enCours.length}</span>
          {enCours.map(carteBC)}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

