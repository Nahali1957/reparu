import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, toApiError, type S } from "../api/client";
import Etat from "../components/Etat";
import { Alerte, Field, Modal } from "../components/ui";
import { Badge, GREEN, ORANGE, RED, TEAL, carte, tableWrap, th, type Palette } from "../components/stocks/commun";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { eur, pct } from "../utils/format";

type Offre = S["OffreOut"];

const paletteFiabilite = (l: string): Palette & { icon: string } =>
  l === "Excellente" ? { ...GREEN, icon: "●" } : l === "Bonne" ? { ...TEAL, icon: "◐" } : { ...ORANGE, icon: "○" };

const jours = (n: number) => `${n} ${n > 1 ? "jours" : "jour"}`;

export default function Fournisseurs() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const four = useApi<S["FournisseurOut"][]>("/fournisseurs");
  const pieces = useApi<S["InventaireOut"]>("/pieces");

  const options = useMemo(
    () => [...(pieces.data?.pieces ?? [])].sort((a, b) => a.designation.localeCompare(b.designation, "fr")),
    [pieces.data],
  );
  const pieceParam = Number(params.get("piece")) || null;
  const pieceId = pieceParam ?? options[0]?.id ?? null;
  const piece = options.find((p) => p.id === pieceId);

  const cmp = useApi<S["ComparaisonOut"]>(pieceId ? `/pieces/${pieceId}/offres` : null);
  const reco = useApi<S["RecommandationAchatOut"]>(pieceId ? `/ia/recommandation-achat?piece_id=${pieceId}` : null);

  const [modale, setModale] = useState<null | "fournisseur" | "offre">(null);
  const [commande, setCommande] = useState<number | null>(null);
  const [errCmd, setErrCmd] = useState<string | null>(null);
  useEffect(() => setErrCmd(null), [pieceId]);

  const offres = useMemo(
    () => [...(cmp.data?.offres ?? [])].sort((a, b) => Number(a.prix_ht) - Number(b.prix_ht)),
    [cmp.data],
  );

  const qteReco = reco.data && reco.data.prevision.quantite_a_commander > 0 ? reco.data.prevision.quantite_a_commander : 1;

  const commander = async (o: Offre) => {
    if (!pieceId) return;
    const qte = Math.max(qteReco, o.minimum_commande);
    setCommande(o.fournisseur_id);
    setErrCmd(null);
    try {
      const r = await api.post<S["BonCommandeOut"]>(`/fournisseurs/${o.fournisseur_id}/commander`, { piece_id: pieceId, qte });
      toast(`Bon de commande ${r.data.numero} créé chez ${r.data.fournisseur} : ${qte} × ${cmp.data?.piece ?? "pièce"} (${eur(r.data.total_ht)} HT).`, "ok");
      void reco.reload();
    } catch (e) {
      setErrCmd(toApiError(e).message);
    } finally {
      setCommande(null);
    }
  };

  const libellePiece = piece ? `${piece.designation}${piece.compatibilite.length ? ` — ${piece.compatibilite.join(", ")}` : ""}` : cmp.data?.piece ?? "";
  const texteReco = (cmp.data?.recommandation ?? "").replace(/^Recommandation d'achat\s*[:.]\s*/i, "");

  return (
    <Etat etat={four.etat} meta={SCREENS.fournisseurs} error={four.error} onRetry={four.reload}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 11, alignItems: "flex-end", justifyContent: "space-between" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 250 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-4)" }}>Pièce à comparer</span>
            <select value={pieceId ?? ""} onChange={(e) => setParams({ piece: e.target.value }, { replace: true })} disabled={!options.length}
              style={{ padding: "11px 12px", borderRadius: 10, border: "1px solid var(--c-border-3)", fontSize: 13.5, background: "#fff", minWidth: 320 }}>
              {options.length === 0 && <option value="">{pieces.etat === "loading" ? "Chargement des pièces…" : "Aucune pièce"}</option>}
              {options.map((p) => (
                <option key={p.id} value={p.id}>{p.designation} — {p.reference}</option>
              ))}
            </select>
          </label>
          <button onClick={() => setModale("fournisseur")}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 10, background: "var(--c-primary)", color: "#fff", fontSize: 13, fontWeight: 700 }}>
            <span aria-hidden="true">+</span>
            <span>Ajouter un fournisseur</span>
          </button>
        </div>
        {pieces.error && <Alerte>{pieces.error.message}</Alerte>}

        <section style={{ ...carte, gap: 11 }} aria-label="Comparaison des offres">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>Offres pour {libellePiece || "—"}</h3>
            <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span data-muted="1" style={{ fontSize: 12, color: "oklch(0.48 0.02 255)" }}>prix unitaire HT · {offres.length} fournisseurs référencés</span>
              <button onClick={() => setModale("offre")} disabled={!pieceId}
                style={{ fontSize: 12, fontWeight: 700, color: "var(--c-primary)", padding: "2px 4px", borderRadius: 6 }}>
                + Ajouter une offre
              </button>
            </span>
          </div>

          {cmp.etat === "loading" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))", gap: 11 }}>
              {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 200, borderRadius: 13 }} />)}
            </div>
          )}
          {cmp.error && cmp.etat !== "loading" && (
            <Alerte>
              {cmp.error.message}{" "}
              <button onClick={() => void cmp.reload()} style={{ textDecoration: "underline", fontWeight: 700 }}>Réessayer</button>
            </Alerte>
          )}
          {cmp.data && offres.length === 0 && (
            <div data-muted="1" style={{ padding: "22px 14px", textAlign: "center", fontSize: 13, color: "var(--c-muted)", border: "1px dashed var(--c-border-7)", borderRadius: 12 }}>
              Aucune offre référencée pour cette pièce. Ajoutez une offre fournisseur pour pouvoir comparer.
            </div>
          )}
          {offres.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))", gap: 11 }}>
              {offres.map((o) => (
                <CarteOffre key={o.fournisseur_id} o={o} qte={Math.max(qteReco, o.minimum_commande)} busy={commande === o.fournisseur_id}
                  disabled={commande !== null} onCommander={() => void commander(o)} />
              ))}
            </div>
          )}
          {errCmd && <Alerte>{errCmd}</Alerte>}

          {cmp.data && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 13px", borderRadius: 11, background: "var(--c-ia-bg-2)", border: "1px solid oklch(0.88 0.03 195)" }}>
              <span aria-hidden="true" style={{ color: "oklch(0.42 0.08 195)" }}>🧠</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, lineHeight: 1.55, color: "oklch(0.34 0.05 195)" }}>
                <span>
                  <strong>Recommandation d'achat.</strong> {texteReco || "Aucune offre référencée."}
                  {cmp.data.economie_pct !== null && cmp.data.economie_pct > 0 && !texteReco.includes("Économie") && <> Économie de {pct(cmp.data.economie_pct, 1)} vs l'offre la plus chère.</>}
                </span>
                {reco.data && reco.data.fournisseur && (
                  <span>
                    <strong>Prévision IA :</strong> {reco.data.justification}
                    {reco.data.prevision.quantite_a_commander > 0 && reco.data.cout_total_ht && (
                      <> Quantité conseillée <strong className="mono">{reco.data.prevision.quantite_a_commander}</strong> · coût total <strong className="mono">{eur(reco.data.cout_total_ht)} HT</strong>.</>
                    )}
                  </span>
                )}
                {reco.error && offres.length > 0 && <span style={{ color: "var(--c-danger-text)" }}>Prévision IA indisponible : {reco.error.message}</span>}
              </span>
            </div>
          )}
        </section>

        <div data-table="1" style={tableWrap}>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "oklch(0.965 0.005 258)", borderBottom: "1px solid var(--c-border)" }}>
                <th scope="col" style={th("left")}>Fournisseur</th>
                <th scope="col" style={th("left")}>Localisation</th>
                <th scope="col" style={th("right")}>Délai (j)</th>
                <th scope="col" style={th("right")}>Références</th>
                <th scope="col" style={th("left")}>Fiabilité</th>
              </tr>
            </thead>
            <tbody>
              {(four.data ?? []).length === 0 && (
                <tr><td colSpan={5} data-muted="1" style={{ padding: "24px 14px", textAlign: "center", color: "var(--c-muted)" }}>Aucun fournisseur référencé.</td></tr>
              )}
              {(four.data ?? []).map((f) => {
                const m = paletteFiabilite(f.fiabilite_libelle);
                return (
                  <tr key={f.id} style={{ borderBottom: "1px solid oklch(0.955 0.006 258)" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{f.nom}</span>
                        <span data-tiny="1" style={{ fontSize: 11, color: "var(--c-muted)" }}>{f.contact ?? "—"}</span>
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: "var(--c-text-6)" }}>{f.ville ?? "—"}</td>
                    <td className="mono" style={{ padding: "12px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{f.delai_jours}</td>
                    <td className="mono" style={{ padding: "12px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{f.references}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span title={`Fiabilité ${Math.round(f.fiabilite * 100)} %`}><Badge m={m} icon={m.icon}>{f.fiabilite_libelle}</Badge></span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modale === "fournisseur" && (
        <ModaleFournisseur pieceId={pieceId} pieceLabel={libellePiece} onClose={() => setModale(null)}
          onChange={() => { void four.reload(); void cmp.reload(); void reco.reload(); }} />
      )}
      {modale === "offre" && pieceId && (
        <Modal titre="Ajouter une offre" onClose={() => setModale(null)}>
          <FormOffre fournisseurs={four.data ?? []} pieceId={pieceId} pieceLabel={libellePiece} onCancel={() => setModale(null)}
            onOk={() => { setModale(null); toast("Offre enregistrée.", "ok"); void four.reload(); void cmp.reload(); void reco.reload(); }} />
        </Modal>
      )}
    </Etat>
  );
}

function CarteOffre({ o, qte, busy, disabled, onCommander }: { o: Offre; qte: number; busy: boolean; disabled: boolean; onCommander: () => void }) {
  const rupture = o.disponibilite === "rupture";
  const best = o.recommande && !rupture;
  const prenom = o.fournisseur.split(" ")[0];
  const lignes = [
    { k: "Délai de livraison", v: jours(o.delai_jours), color: o.plus_rapide ? TEAL.fg : "oklch(0.30 0.02 255)" },
    { k: "Disponibilité", v: rupture ? "Rupture" : "Disponible", color: rupture ? "oklch(0.44 0.14 25)" : "oklch(0.30 0.02 255)" },
    { k: "Quantité mini", v: String(o.minimum_commande), color: "oklch(0.30 0.02 255)" },
    { k: "Fiabilité", v: `${o.fiabilite_libelle} · ${Math.round(o.fiabilite * 100)} %`, color: "oklch(0.30 0.02 255)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11, padding: 15, borderRadius: 13, opacity: rupture ? 0.6 : 1,
      background: best ? "oklch(0.985 0.012 152)" : "var(--c-surface-2)", border: `1.5px solid ${best ? GREEN.bd : "var(--c-border-5)"}` }}>
      <span style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "oklch(0.24 0.02 255)" }}>{o.fournisseur}</span>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
          {rupture && <Badge m={RED}>Indisponible</Badge>}
          {!rupture && o.recommande && <Badge m={GREEN} icon="★">Recommandé</Badge>}
          {!rupture && o.moins_cher && <Badge m={GREEN}>Moins cher</Badge>}
          {!rupture && o.plus_rapide && <Badge m={TEAL}>Plus rapide</Badge>}
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: o.moins_cher ? "oklch(0.34 0.10 152)" : "oklch(0.24 0.02 255)" }}>{eur(o.prix_ht)}</span>
        <span data-tiny="1" style={{ fontSize: 11, color: "var(--c-muted)" }}>/ unité</span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {lignes.map((l) => (
          <span key={l.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 9, fontSize: 11.5 }}>
            <span data-muted="1" style={{ color: "oklch(0.48 0.02 255)" }}>{l.k}</span>
            <span style={{ fontWeight: 600, color: l.color }}>{l.v}</span>
          </span>
        ))}
      </span>
      <button disabled={rupture || disabled} onClick={onCommander}
        aria-label={rupture ? `${o.fournisseur} : indisponible` : `Commander ${qte} unité(s) chez ${o.fournisseur}`}
        style={{ padding: 10, borderRadius: 9, fontSize: 12.5, fontWeight: 700,
          ...(rupture ? { background: "oklch(0.97 0.004 258)", color: "oklch(0.68 0.01 258)", border: "1px solid oklch(0.93 0.008 258)" }
            : best ? { background: "oklch(0.44 0.11 152)", color: "#fff" }
              : { background: "#fff", border: "1px solid var(--c-border-3)", color: "var(--c-text-4)" }) }}>
        {rupture ? "Indisponible" : busy ? "Commande…" : `Commander chez ${prenom}${qte > 1 ? ` (× ${qte})` : ""}`}
      </button>
    </div>
  );
}

function ModaleFournisseur({ pieceId, pieceLabel, onClose, onChange }: { pieceId: number | null; pieceLabel: string; onClose: () => void; onChange: () => void }) {
  const toast = useToast();
  const [cree, setCree] = useState<S["FournisseurOut"] | null>(null);
  const [nom, setNom] = useState("");
  const [contact, setContact] = useState("");
  const [ville, setVille] = useState("");
  const [delai, setDelai] = useState("3");
  const [fiab, setFiab] = useState("0.8");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const d = Number(delai);
  const f = Number(fiab);
  const invalide = nom.trim().length < 2 || !Number.isInteger(d) || d < 0 || d > 60 || Number.isNaN(f) || f < 0 || f > 1 || fiab === "";

  const creer = async () => {
    if (invalide) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<S["FournisseurOut"]>("/fournisseurs", { nom: nom.trim(), contact: contact.trim() || null, ville: ville.trim() || null, delai_jours: d, fiabilite: f });
      setCree(r.data);
      toast(`Fournisseur « ${r.data.nom} » ajouté.`, "ok");
      onChange();
    } catch (e) {
      setErr(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal titre={cree ? "Ajouter une offre" : "Ajouter un fournisseur"} onClose={onClose}>
      {!cree ? (
        <form onSubmit={(e) => { e.preventDefault(); void creer(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nom" required>
            <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field label="Contact (e-mail)">
            <input className="input" type="email" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="commandes@fournisseur.fr" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
            <Field label="Ville">
              <input className="input" value={ville} onChange={(e) => setVille(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Délai (j)" required>
              <input className="input mono" type="number" min={0} max={60} step={1} value={delai} onChange={(e) => setDelai(e.target.value)} />
            </Field>
            <Field label="Fiabilité" required hint="de 0 à 1">
              <input className="input mono" type="number" min={0} max={1} step={0.01} value={fiab} onChange={(e) => setFiab(e.target.value)} />
            </Field>
          </div>
          {err && <Alerte>{err}</Alerte>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={busy || invalide}>
              <span aria-hidden="true">+</span>
              <span>{busy ? "Enregistrement…" : "Ajouter le fournisseur"}</span>
            </button>
          </div>
        </form>
      ) : pieceId ? (
        <>
          <Alerte ton="ok">« {cree.nom} » est référencé. Vous pouvez dès maintenant saisir son offre pour la pièce comparée.</Alerte>
          <FormOffre fournisseurs={[cree]} fournisseurFixe={cree} pieceId={pieceId} pieceLabel={pieceLabel} onCancel={onClose} libelleAnnuler="Plus tard"
            onOk={() => { toast("Offre enregistrée.", "ok"); onChange(); onClose(); }} />
        </>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      )}
    </Modal>
  );
}

function FormOffre({ fournisseurs, fournisseurFixe, pieceId, pieceLabel, onOk, onCancel, libelleAnnuler = "Annuler" }: {
  fournisseurs: S["FournisseurOut"][]; fournisseurFixe?: S["FournisseurOut"]; pieceId: number; pieceLabel: string;
  onOk: () => void; onCancel: () => void; libelleAnnuler?: string;
}) {
  const [fid, setFid] = useState<number | "">(fournisseurFixe?.id ?? fournisseurs[0]?.id ?? "");
  const fSel = fournisseurs.find((x) => x.id === fid);
  const [prix, setPrix] = useState("");
  const [delai, setDelai] = useState(String(fSel?.delai_jours ?? 2));
  const [dispo, setDispo] = useState<S["Disponibilite"]>("dispo");
  const [mini, setMini] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const p = Number(prix.replace(",", "."));
  const d = Number(delai);
  const m = Number(mini);
  const invalide = fid === "" || !(p > 0) || p > 5000 || !Number.isInteger(d) || d < 0 || d > 60 || !Number.isInteger(m) || m < 1 || m > 500;

  const valider = async () => {
    if (invalide) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post<S["ComparaisonOut"]>("/offres", { fournisseur_id: fid, piece_id: pieceId, prix_ht: p, delai_jours: d, disponibilite: dispo, minimum_commande: m });
      onOk();
    } catch (e) {
      setErr(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void valider(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <span data-muted="1" style={{ fontSize: 12.5, color: "var(--c-text-7)" }}>Pièce : <strong>{pieceLabel}</strong></span>
      {!fournisseurFixe && (
        <Field label="Fournisseur" required>
          <select className="input" value={fid} onChange={(e) => {
            const id = Number(e.target.value);
            setFid(id);
            const f = fournisseurs.find((x) => x.id === id);
            if (f) setDelai(String(f.delai_jours));
          }}>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </Field>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Prix unitaire HT (€)" required>
          <input className="input mono" inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="0,00" autoFocus />
        </Field>
        <Field label="Délai (j)" required>
          <input className="input mono" type="number" min={0} max={60} step={1} value={delai} onChange={(e) => setDelai(e.target.value)} />
        </Field>
        <Field label="Disponibilité" required>
          <select className="input" value={dispo} onChange={(e) => setDispo(e.target.value as S["Disponibilite"])}>
            <option value="dispo">Disponible</option>
            <option value="rupture">Rupture</option>
          </select>
        </Field>
        <Field label="Quantité mini" required>
          <input className="input mono" type="number" min={1} max={500} step={1} value={mini} onChange={(e) => setMini(e.target.value)} />
        </Field>
      </div>
      {err && <Alerte>{err}</Alerte>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>{libelleAnnuler}</button>
        <button type="submit" className="btn btn-primary" disabled={busy || invalide}>
          <span aria-hidden="true">✓</span>
          <span>{busy ? "Enregistrement…" : "Enregistrer l'offre"}</span>
        </button>
      </div>
    </form>
  );
}
