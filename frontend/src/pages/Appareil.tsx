import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type S } from "../api/client";
import Etat from "../components/Etat";
import { Alerte } from "../components/ui";
import { btnPrimaire, btnSecondaire, Champ, erreurAction, luhnValide, styleSaisie, type ErreurAction } from "../components/gestion/commun";
import SelecteurClient, { type ClientChoisi } from "../components/gestion/SelecteurClient";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";

interface Saisie { marque: string; modele: string; imei: string; couleur: string }

/** 5.7 Ajout / édition appareil (/appareils/nouveau?client=<id> et /appareils/:id). */
export default function Appareil() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const edition = !!id && id !== "nouveau";
  const navigate = useNavigate();
  const toast = useToast();

  const existant = useApi<S["AppareilOut"]>(edition ? `/appareils/${id}` : null);
  const preClient = params.get("client");
  const pre = useApi<S["ClientFicheOut"]>(!edition && preClient ? `/clients/${preClient}` : null);
  const modeles = useApi<S["ModeleOut"][]>("/modeles");
  const frequents = useApi<string[]>("/modeles/frequents");

  const [client, setClient] = useState<ClientChoisi | null>(null);
  const [dev, setDev] = useState<Saisie>({ marque: "", modele: "", imei: "", couleur: "" });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ErreurAction | null>(null);

  useEffect(() => {
    const a = existant.data;
    if (!a) return;
    setClient({ id: a.client_id, nom: a.client_nom });
    setDev({ marque: a.marque, modele: a.modele, imei: a.imei, couleur: a.couleur ?? "" });
  }, [existant.data]);
  useEffect(() => {
    if (pre.data) setClient({ id: pre.data.id, nom: pre.data.nom, telephone: pre.data.telephone });
  }, [pre.data]);

  const maj = (patch: Partial<Saisie>) => {
    setDev((d) => ({ ...d, ...patch }));
    setErr(null);
  };

  const marques = useMemo(() => [...new Set((modeles.data ?? []).map((m) => m.marque))], [modeles.data]);
  const modelesMarque = useMemo(
    () => (modeles.data ?? []).filter((m) => !dev.marque.trim() || m.marque.toLowerCase() === dev.marque.trim().toLowerCase()),
    [modeles.data, dev.marque],
  );
  const rapides = useMemo(
    () => (frequents.data ?? []).map((nom) => ({ modele: nom, marque: (modeles.data ?? []).find((m) => m.modele === nom)?.marque ?? "" })),
    [frequents.data, modeles.data],
  );

  const imei = dev.imei.replace(/\s/g, "");
  const imeiComplet = /^\d{15}$/.test(imei);
  const luhnOk = imeiComplet && luhnValide(imei);

  const erreursLocales: Record<string, string> = {};
  if (!client) erreursLocales.client_id = "Choisissez le client propriétaire de l'appareil.";
  if (dev.marque.trim().length < 2) erreursLocales.marque = "La marque est obligatoire.";
  if (!dev.modele.trim()) erreursLocales.modele = "Le modèle est obligatoire.";
  if (!imeiComplet) erreursLocales.imei = "L'IMEI doit comporter exactement 15 chiffres.";
  else if (!luhnOk) erreursLocales.imei = "IMEI invalide : la clé de contrôle (algorithme de Luhn) ne correspond pas.";

  // erreurs affichées : après une tentative d'envoi, ou en direct dès que l'IMEI a 15 chiffres
  const erreurs: Record<string, string> = { ...(touched ? erreursLocales : {}) };
  if (imeiComplet && !luhnOk) erreurs.imei = erreursLocales.imei;
  if (err) {
    Object.assign(erreurs, err.champs);
    if (err.status === 409 || /IMEI/i.test(err.message)) erreurs.imei = err.message;
  }
  const erreurGlobale = err && Object.keys(err.champs).length === 0 && !(err.status === 409 || /IMEI/i.test(err.message)) ? err.message : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setErr(null);
    if (Object.keys(erreursLocales).length || !client) return;
    setBusy(true);
    const body: S["AppareilIn"] = { client_id: client.id, marque: dev.marque.trim(), modele: dev.modele.trim(), imei, couleur: dev.couleur.trim() || null };
    try {
      const r = edition ? await api.put<S["AppareilOut"]>(`/appareils/${id}`, body) : await api.post<S["AppareilOut"]>("/appareils", body);
      toast(edition ? "Appareil mis à jour." : "Appareil enregistré et rattaché au client.", "ok");
      navigate(`/clients/${r.data.client_id}`);
    } catch (ex) {
      setErr(erreurAction(ex));
    } finally {
      setBusy(false);
    }
  };

  const annuler = () => {
    if (client) navigate(`/clients/${client.id}`);
    else navigate("/clients");
  };

  const etat = existant.error?.status === 404 ? "empty" : existant.etat;

  return (
    <Etat etat={etat} meta={SCREENS.appareil} error={existant.error} onRetry={existant.reload}
      emptyTitle="Appareil introuvable" emptyBody="Cet appareil a peut-être été supprimé. Revenez à la liste des clients pour retrouver la bonne fiche."
      emptyCta="Revenir à la liste" onEmptyCta={() => navigate("/clients")}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, alignItems: "start" }}>
        <form onSubmit={submit} noValidate aria-label={edition ? "Modifier l'appareil" : "Rattacher un appareil"}
          style={{ display: "flex", flexDirection: "column", gap: 14, padding: 18, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.91 0.008 258)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{edition ? "Modifier l'appareil" : "Rattacher un appareil"}</h3>
            <span data-muted="1" style={{ fontSize: 12.5, color: "oklch(0.48 0.02 255)" }}>Un appareil appartient obligatoirement à un client (intégrité référentielle).</span>
          </div>

          <SelecteurClient valeur={client} onChange={(c) => { setClient(c); setErr(null); }} erreur={erreurs.client_id} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11 }}>
            <Champ label="Marque" requis aide="Apple, Samsung, Xiaomi, Google…" erreur={erreurs.marque}>
              <input className="input" list="reparu-marques" value={dev.marque} placeholder="Apple" aria-required="true" aria-invalid={!!erreurs.marque}
                autoComplete="off" onChange={(e) => maj({ marque: e.target.value })} style={styleSaisie(!!erreurs.marque)} />
            </Champ>
            <Champ label="Modèle" requis aide="Tel qu'indiqué par le constructeur." erreur={erreurs.modele}>
              <input className="input" list="reparu-modeles" value={dev.modele} placeholder="iPhone 14 Pro" aria-required="true" aria-invalid={!!erreurs.modele}
                autoComplete="off" onChange={(e) => maj({ modele: e.target.value })} style={styleSaisie(!!erreurs.modele)} />
            </Champ>
            <Champ label="IMEI" requis aide="15 chiffres — *#06# sur l'appareil." erreur={erreurs.imei}
              succes={luhnOk && !erreurs.imei ? "✓ 15 chiffres · clé de Luhn valide" : null}>
              <input className="input mono" inputMode="numeric" maxLength={19} value={dev.imei} placeholder="356938035643809" aria-required="true"
                aria-invalid={!!erreurs.imei} autoComplete="off" onChange={(e) => maj({ imei: e.target.value.replace(/[^\d\s]/g, "") })}
                style={{ ...styleSaisie(!!erreurs.imei), fontFamily: "var(--f-mono)", ...(luhnOk && !erreurs.imei ? { borderColor: "oklch(0.70 0.10 152)" } : {}) }} />
            </Champ>
            <Champ label="Couleur" aide="Facultatif, aide à l'identification.">
              <input className="input" value={dev.couleur} placeholder="Noir" autoComplete="off" onChange={(e) => maj({ couleur: e.target.value })} style={styleSaisie(false)} />
            </Champ>
          </div>
          <datalist id="reparu-marques">{marques.map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="reparu-modeles">{modelesMarque.map((m) => <option key={m.id} value={m.modele}>{m.marque}</option>)}</datalist>

          {erreurGlobale && <Alerte>{erreurGlobale}</Alerte>}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 9, paddingTop: 4 }}>
            <button type="submit" disabled={busy} style={{ ...btnPrimaire, padding: "12px 18px", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Enregistrement…" : "Enregistrer l'appareil"}
            </button>
            <button type="button" onClick={annuler} style={{ ...btnSecondaire, padding: "12px 15px" }}>Annuler</button>
          </div>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 18, borderRadius: 14, background: "oklch(0.975 0.004 258)", border: "1px solid oklch(0.91 0.008 258)" }}>
            <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "oklch(0.50 0.02 255)" }}>Aperçu de la fiche</span>
            <div style={{ display: "flex", gap: 14, alignItems: "center", padding: 15, borderRadius: 12, background: "#fff", border: "1px solid oklch(0.92 0.008 258)" }}>
              <span aria-hidden="true" style={{ width: 44, height: 58, borderRadius: 8, border: "2px solid oklch(0.70 0.02 258)", background: "oklch(0.93 0.008 258)", flex: "0 0 auto" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{dev.marque || "Marque"} {dev.modele || "modèle"}</span>
                <span data-tiny="1" className="mono" style={{ fontSize: 11.5, color: "oklch(0.48 0.02 255)" }}>IMEI {imei || "—"}</span>
                <span data-tiny="1" style={{ fontSize: 11.5, color: "oklch(0.48 0.02 255)" }}>Propriétaire : {client?.nom ?? "—"}</span>
              </span>
            </div>
            <span data-tiny="1" style={{ fontSize: 11, lineHeight: 1.55, color: "oklch(0.50 0.02 255)" }}>
              L'IMEI est unique et sert de clé de rapprochement avec l'historique des interventions. Il est vérifié par l'algorithme de Luhn côté serveur.
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 16, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.91 0.008 258)" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Modèles fréquents</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {rapides.map((m) => (
                <button key={m.modele} type="button" onClick={() => maj({ marque: m.marque || dev.marque, modele: m.modele })}
                  aria-label={`Remplir ${m.marque} ${m.modele}`}
                  style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid oklch(0.90 0.008 258)", background: "oklch(0.985 0.003 258)", fontSize: 12.5, fontWeight: 600, color: "oklch(0.34 0.02 255)" }}>
                  {m.modele}
                </button>
              ))}
              {frequents.data && rapides.length === 0 && <span data-muted="1" style={{ fontSize: 12, color: "oklch(0.55 0.02 255)" }}>Aucun historique de réparation.</span>}
              {frequents.error && <span data-muted="1" style={{ fontSize: 12, color: "oklch(0.55 0.02 255)" }}>Suggestions indisponibles.</span>}
            </div>
          </div>
        </div>
      </div>
    </Etat>
  );
}
