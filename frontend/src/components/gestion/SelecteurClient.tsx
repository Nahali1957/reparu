import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { api, type S } from "../../api/client";
import { Champ, styleSaisie, useDebounce } from "./commun";

export interface ClientChoisi { id: number; nom: string; telephone?: string }

const libelle = (c: ClientChoisi) => (c.telephone ? `${c.nom} — ${c.telephone}` : c.nom);

/** Sélecteur de client avec recherche (GET /clients?q=), au gabarit du <select> de la maquette 5.7. */
export default function SelecteurClient({ valeur, onChange, erreur }: {
  valeur: ClientChoisi | null; onChange: (c: ClientChoisi | null) => void; erreur?: string;
}) {
  const idListe = useId();
  const [texte, setTexte] = useState(valeur ? libelle(valeur) : "");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const [resultats, setResultats] = useState<S["ClientLigneOut"][]>([]);
  const [charge, setCharge] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);
  const q = useDebounce(texte.trim(), 250);

  useEffect(() => {
    if (valeur) setTexte(libelle(valeur));
  }, [valeur]);

  useEffect(() => {
    if (!ouvert) return;
    let annule = false;
    setCharge(true);
    setEchec(null);
    const recherche = valeur && q === libelle(valeur).trim() ? "" : q;
    api.get<S["Page_ClientLigneOut_"]>("/clients", { params: { q: recherche || undefined, taille: 8 } })
      .then((r) => { if (!annule) { setResultats(r.data.items); setActif(0); } })
      .catch(() => { if (!annule) setEchec("Recherche des clients indisponible."); })
      .finally(() => { if (!annule) setCharge(false); });
    return () => { annule = true; };
  }, [q, ouvert, valeur]);

  const choisir = (c: S["ClientLigneOut"]) => {
    onChange({ id: c.id, nom: c.nom, telephone: c.telephone });
    setOuvert(false);
  };

  const clavier = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOuvert(true); setActif((i) => Math.min(i + 1, resultats.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && ouvert && resultats[actif]) { e.preventDefault(); choisir(resultats[actif]); }
    else if (e.key === "Escape" && ouvert) { e.stopPropagation(); setOuvert(false); setTexte(valeur ? libelle(valeur) : ""); }
  };

  return (
    <div style={{ position: "relative" }}>
      <Champ label="Client" requis erreur={erreur} aide={valeur ? undefined : "Recherchez par nom, téléphone ou ville."}>
        <input className="input" role="combobox" aria-expanded={ouvert} aria-controls={idListe} aria-autocomplete="list" aria-required="true"
          aria-invalid={!!erreur} aria-activedescendant={ouvert && resultats[actif] ? `${idListe}-${resultats[actif].id}` : undefined}
          value={texte} placeholder="Rechercher un client…" autoComplete="off"
          onChange={(e) => { setTexte(e.target.value); setOuvert(true); if (valeur) onChange(null); }}
          onFocus={() => setOuvert(true)} onBlur={() => setTimeout(() => setOuvert(false), 150)} onKeyDown={clavier}
          style={{ ...styleSaisie(!!erreur), background: "#fff" }} />
      </Champ>
      {ouvert && (
        <ul id={idListe} role="listbox" aria-label="Clients"
          style={{ position: "absolute", top: 66, left: 0, right: 0, zIndex: 20, margin: 0, padding: 4, listStyle: "none", background: "#fff", border: "1px solid oklch(0.88 0.008 258)", borderRadius: 10, boxShadow: "var(--sh-modal)", maxHeight: 280, overflow: "auto" }}>
          {charge && resultats.length === 0 && <li style={{ padding: "9px 10px", fontSize: 12.5, color: "oklch(0.52 0.02 255)" }}>Recherche…</li>}
          {echec && <li role="alert" style={{ padding: "9px 10px", fontSize: 12.5, color: "oklch(0.48 0.16 25)", fontWeight: 600 }}>{echec}</li>}
          {!charge && !echec && resultats.length === 0 && <li style={{ padding: "9px 10px", fontSize: 12.5, color: "oklch(0.52 0.02 255)" }}>Aucun client ne correspond.</li>}
          {resultats.map((c, i) => (
            <li key={c.id} id={`${idListe}-${c.id}`} role="option" aria-selected={valeur?.id === c.id}
              onMouseDown={(e) => { e.preventDefault(); choisir(c); }} onMouseEnter={() => setActif(i)}
              style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, background: i === actif ? "oklch(0.96 0.02 258)" : "transparent" }}>
              <span style={{ fontWeight: 600 }}>{c.nom}</span>
              <span className="mono" style={{ fontSize: 12, color: "oklch(0.48 0.02 255)" }}>{c.telephone}{c.ville ? ` · ${c.ville}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
