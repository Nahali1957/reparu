import { useCallback, useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { api, toApiError, type ApiError, type S } from "../api/client";
import Etat from "../components/Etat";
import { Alerte, PrioriteChip, StatutChip } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";
import { SCREENS } from "../screens";
import { dateCourte, duree } from "../utils/format";

/* 5.13 Affectation & planning (maquette Repar-Extra, branche isPlanning). */

type Carte = S["CarteOut"];
type Tech = S["ChargeTechOut"];

const EN_ATELIER = ["recu", "en_diagnostic", "en_reparation"];

const GREEN = { bg: "oklch(0.965 0.03 152)", fg: "oklch(0.36 0.10 152)", bd: "oklch(0.84 0.06 152)" };
const ORANGE = { bg: "oklch(0.965 0.05 70)", fg: "oklch(0.42 0.11 62)", bd: "oklch(0.86 0.09 70)" };
const RED = { bg: "oklch(0.96 0.04 25)", fg: "oklch(0.42 0.15 25)", bd: "oklch(0.86 0.08 25)" };
const TEAL = { bg: "oklch(0.965 0.025 195)", fg: "oklch(0.36 0.08 195)", bd: "oklch(0.88 0.04 195)" };
type Teinte = typeof GREEN;

function Badge({ t, icon, children }: { t: Teinte; icon?: string; children: ReactNode }) {
  return (
    <span data-badge="1" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 7px", borderRadius: 7, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

const EQUILIBRE: Record<string, [Teinte, string]> = {
  "Charge équilibrée": [GREEN, "●"],
  "Écart modéré": [TEAL, "◐"],
  "Charge déséquilibrée": [ORANGE, "▲"],
};
const TEINTE_CHARGE: Record<string, Teinte> = { Disponible: GREEN, "Chargé": ORANGE, "Surchargé": RED };

const pluriel = (n: number, s: string, p: string) => `${n} ${n > 1 ? p : s}`;

const selectStyle: CSSProperties = {
  padding: "4px 6px", borderRadius: 7, border: "1px solid oklch(0.91 0.008 258)", background: "#fff", fontSize: 10.5, fontWeight: 600, color: "oklch(0.44 0.02 255)", maxWidth: 150,
};

/** Menu « Affecter à… » de chaque carte (alternative accessible à la sélection et au glisser-déposer). */
function MenuAffecter({ carte, techs, actuel, onAffecter, disabled }: {
  carte: Carte; techs: Tech[]; actuel: number | null; onAffecter: (numero: string, techId: number | null) => void; disabled: boolean;
}) {
  return (
    <select aria-label={`Affecter ${carte.numero} à un technicien`} value="" disabled={disabled} style={selectStyle}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") return;
        onAffecter(carte.numero, v === "retirer" ? null : Number(v));
      }}>
      <option value="">{actuel ? "Réaffecter à…" : "Affecter à…"}</option>
      {techs.filter((t) => t.id !== actuel).map((t) => <option key={t.id} value={t.id}>{t.nom} · {t.statut}</option>)}
      {actuel && <option value="retirer">Retirer (non affecté)</option>}
    </select>
  );
}

export default function Planning() {
  const navigate = useNavigate();
  const toast = useToast();
  const planning = useApi<S["PlanningOut"]>("/planning");
  const cartes = useApi<Carte[]>("/reparations");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [survol, setSurvol] = useState<number | null>(null);

  const reload = () => {
    void planning.reload();
    void cartes.reload();
  };

  const affecter = useCallback(async (numero: string, techId: number | null) => {
    setBusy(true);
    setErreur(null);
    try {
      await api.post(`/reparations/${numero}/affecter`, { tech_id: techId });
      setPicked(null);
      await Promise.all([planning.reload(), cartes.reload()]);
      const nom = planning.data?.techniciens.find((t) => t.id === techId)?.nom;
      toast(techId ? `${numero} affecté à ${nom ?? "ce technicien"}.` : `${numero} retiré : il retourne dans les non affectés.`, "ok");
    } catch (e) {
      setErreur(toApiError(e));
    } finally {
      setBusy(false);
    }
  }, [planning, cartes, toast]);

  const parTech = useMemo(() => {
    const m = new Map<number, Carte[]>();
    for (const c of cartes.data ?? []) {
      if (!c.technicien || !EN_ATELIER.includes(c.statut)) continue;
      m.set(c.technicien.id, [...(m.get(c.technicien.id) ?? []), c]);
    }
    return m;
  }, [cartes.data]);

  // l'état d'écran suit la requête principale ; un 403 sur l'une ou l'autre donne « Verrouillé »
  const etat = planning.etat === "nominal" && cartes.etat !== "nominal" ? cartes.etat : planning.etat;
  const error = planning.error ?? cartes.error;
  const d = planning.data;

  return (
    <Etat etat={etat === "empty" ? "nominal" : etat} meta={SCREENS.affectation} error={error} onRetry={reload}>
      {d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Bandeau n={d.non_affectes.length} equilibre={d.equilibre} />
          {erreur && <Alerte>{erreur.message}</Alerte>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 13, alignItems: "start" }}>
            <ColonneNonAffectes cartes={d.non_affectes} techs={d.techniciens} picked={picked} setPicked={setPicked} onAffecter={affecter} busy={busy}
              survol={survol === 0} setSurvol={(on) => setSurvol(on ? 0 : null)} />
            {d.techniciens.map((t) => (
              <ColonneTech key={t.id} tech={t} techs={d.techniciens} cartes={parTech.get(t.id) ?? []} picked={picked} busy={busy}
                onAffecter={affecter} onOpen={(n) => navigate(`/reparations/${n}`)}
                survol={survol === t.id} setSurvol={(on) => setSurvol(on ? t.id : null)} />
            ))}
          </div>

          <Capacite semaine={d.semaine} capacite={d.capacite_jour_h} seuil={d.seuil_alerte_pct} />
        </div>
      )}
    </Etat>
  );
}

function Bandeau({ n, equilibre }: { n: number; equilibre: string }) {
  const [t, icon] = EQUILIBRE[equilibre] ?? EQUILIBRE["Charge équilibrée"];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 11, alignItems: "center", padding: "13px 15px", borderRadius: 13, background: "oklch(0.96 0.02 258)", border: "1px solid oklch(0.90 0.03 258)" }}>
      <span aria-hidden="true" style={{ color: "oklch(0.40 0.11 258)", fontSize: 15 }}>⧉</span>
      <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, lineHeight: 1.5, color: "oklch(0.34 0.06 258)" }}>
        <strong>{n ? (n > 1 ? `${n} dossiers attendent une affectation` : "1 dossier attend une affectation") : "Aucun dossier en attente d'affectation"}</strong>
        {" "}— sélectionnez un dossier puis un technicien, ou utilisez le menu de chaque carte. La charge se recalcule immédiatement.
      </span>
      <Badge t={t} icon={icon}>{equilibre}</Badge>
    </div>
  );
}

const glisser = (numero: string) => (e: DragEvent) => {
  e.dataTransfer.setData("text/plain", numero);
  e.dataTransfer.effectAllowed = "move";
};
const zoneDepot = (setSurvol: (on: boolean) => void, onDrop: (numero: string) => void) => ({
  onDragOver: (e: DragEvent) => {
    e.preventDefault();
    setSurvol(true);
  },
  onDragLeave: () => setSurvol(false),
  onDrop: (e: DragEvent) => {
    e.preventDefault();
    setSurvol(false);
    const n = e.dataTransfer.getData("text/plain");
    if (n) onDrop(n);
  },
});

function ColonneNonAffectes({ cartes, techs, picked, setPicked, onAffecter, busy, survol, setSurvol }: {
  cartes: Carte[]; techs: Tech[]; picked: string | null; setPicked: (n: string | null) => void;
  onAffecter: (numero: string, techId: number | null) => void; busy: boolean; survol: boolean; setSurvol: (on: boolean) => void;
}) {
  return (
    <div {...zoneDepot(setSurvol, (n) => !cartes.some((c) => c.numero === n) && onAffecter(n, null))}
      style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 13, background: survol ? "oklch(0.95 0.02 258)" : "oklch(0.965 0.005 258)", border: `1.5px dashed ${survol ? "oklch(0.55 0.15 258)" : "oklch(0.84 0.01 258)"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ color: "oklch(0.48 0.02 255)" }}>◌</span>
        <h2 style={{ margin: 0, flex: 1, fontSize: 12.5, fontWeight: 700, color: "oklch(0.34 0.02 255)" }}>Non affectés</h2>
        <span style={{ minWidth: 22, padding: "2px 7px", borderRadius: 7, background: "oklch(0.50 0.02 255)", color: "#fff", fontSize: 11, fontWeight: 700, textAlign: "center" }}>{cartes.length}</span>
      </div>
      {cartes.map((c) => {
        const on = picked === c.numero;
        return (
          <div key={c.numero} draggable onDragStart={glisser(c.numero)}
            style={{ display: "flex", flexDirection: "column", gap: 8, padding: 11, borderRadius: 11, background: "#fff", border: `1.5px solid ${on ? "oklch(0.55 0.15 258)" : "oklch(0.92 0.008 258)"}`, boxShadow: on ? "0 0 0 3px oklch(0.55 0.15 258 / 0.16)" : "0 1px 2px oklch(0.22 0.02 255 / 0.05)" }}>
            <button aria-pressed={on} onClick={() => setPicked(on ? null : c.numero)} aria-label={`${on ? "Désélectionner" : "Sélectionner"} ${c.numero}, ${c.appareil}`}
              style={{ display: "flex", flexDirection: "column", gap: 6, padding: 0, textAlign: "left", cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, width: "100%" }}>
                <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.42 0.13 258)" }}>{c.numero}</span>
                <PrioriteChip priorite={c.priorite} />
                <span style={{ flex: 1 }} />
                {on && <span aria-hidden="true" style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.42 0.13 258)" }}>✓ sélectionné</span>}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.24 0.02 255)" }}>{c.appareil}</span>
              <span data-tiny="1" style={{ fontSize: 11, lineHeight: 1.4, color: "oklch(0.48 0.02 255)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {c.symptomes || "Diagnostic à réaliser"}
              </span>
            </button>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span data-tiny="1" data-muted="1" style={{ flex: 1, fontSize: 10.5, color: "oklch(0.50 0.02 255)" }}>
                reçu le {dateCourte(c.recu_le)}{c.duree_estimee_min ? ` · ${duree(c.duree_estimee_min)}` : ""}
              </span>
              <MenuAffecter carte={c} techs={techs} actuel={null} onAffecter={onAffecter} disabled={busy} />
            </span>
          </div>
        );
      })}
      {cartes.length === 0 && (
        <span data-tiny="1" style={{ display: "block", padding: "20px 10px", textAlign: "center", fontSize: 11.5, color: "oklch(0.55 0.02 255)" }}>Tous les dossiers sont affectés.</span>
      )}
    </div>
  );
}

function ColonneTech({ tech, techs, cartes, picked, busy, onAffecter, onOpen, survol, setSurvol }: {
  tech: Tech; techs: Tech[]; cartes: Carte[]; picked: string | null; busy: boolean;
  onAffecter: (numero: string, techId: number | null) => void; onOpen: (numero: string) => void; survol: boolean; setSurvol: (on: boolean) => void;
}) {
  const t = TEINTE_CHARGE[tech.statut] ?? GREEN;
  const n = tech.ouverts;
  return (
    <section aria-label={`${tech.nom}, ${tech.statut}`} {...zoneDepot(setSurvol, (num) => !cartes.some((c) => c.numero === num) && onAffecter(num, tech.id))}
      style={{ display: "flex", flexDirection: "column", gap: 9, padding: 13, borderRadius: 13, background: survol ? "oklch(0.95 0.02 258)" : "oklch(0.965 0.005 258)", border: `1.5px solid ${survol ? "oklch(0.55 0.15 258)" : picked ? "oklch(0.86 0.05 258)" : "oklch(0.92 0.008 258)"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", background: "oklch(0.95 0.02 258)", color: "oklch(0.40 0.10 258)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{tech.initiales}</span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
          <h2 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: "oklch(0.24 0.02 255)" }}>{tech.nom}</h2>
          <span data-tiny="1" style={{ fontSize: 10.5, color: "oklch(0.50 0.02 255)" }}>{tech.specialite ?? "Polyvalent"}</span>
        </span>
        <Badge t={t}>{pluriel(n, "dossier", "dossiers")}</Badge>
      </div>
      <span aria-hidden="true" style={{ height: 6, borderRadius: 99, background: "oklch(0.93 0.008 258)", overflow: "hidden", display: "block" }}>
        <span style={{ display: "block", height: "100%", borderRadius: 99, width: `${Math.min(100, n * 25)}%`, background: t.fg }} />
      </span>
      <span data-tiny="1" style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10.5, color: "oklch(0.50 0.02 255)" }}>
        <span style={{ fontWeight: 700, color: t.fg }}>{tech.statut}</span>
        <span className="mono">{duree(tech.charge_min)} de charge estimée</span>
      </span>
      {picked && (
        <button disabled={busy} onClick={() => onAffecter(picked, tech.id)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 10, borderRadius: 10, background: "oklch(0.52 0.15 258)", color: "#fff", fontSize: 12.5, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
          <span aria-hidden="true">↓</span>
          <span>Affecter {picked}</span>
        </button>
      )}
      {cartes.map((c) => (
        <div key={c.numero} draggable onDragStart={glisser(c.numero)}
          style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 11, background: "#fff", border: "1px solid oklch(0.92 0.008 258)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <button onClick={() => onOpen(c.numero)} data-underline="1" className="mono" aria-label={`Ouvrir le dossier ${c.numero}`}
              style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.42 0.13 258)", padding: 0 }}>{c.numero}</button>
            <span style={{ flex: 1 }} />
            <StatutChip statut={c.statut} />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "oklch(0.26 0.02 255)" }}>{c.appareil}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span data-tiny="1" style={{ flex: 1, fontSize: 10.5, color: "oklch(0.50 0.02 255)" }}>reçu le {dateCourte(c.recu_le)}</span>
            <MenuAffecter carte={c} techs={techs} actuel={tech.id} onAffecter={onAffecter} disabled={busy} />
            <button disabled={busy} onClick={() => onAffecter(c.numero, null)} aria-label={`Retirer ${c.numero} de ${tech.nom}`}
              style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid oklch(0.91 0.008 258)", fontSize: 10.5, fontWeight: 600, color: "oklch(0.44 0.02 255)" }}>Retirer</button>
          </span>
        </div>
      ))}
      {cartes.length === 0 && (
        <span data-tiny="1" style={{ display: "block", padding: "16px 10px", textAlign: "center", fontSize: 11.5, color: "oklch(0.58 0.02 255)", border: "1px dashed oklch(0.89 0.008 258)", borderRadius: 10 }}>Disponible</span>
      )}
    </section>
  );
}

function Capacite({ semaine, capacite, seuil }: { semaine: S["JourOut"][]; capacite: number; seuil: number }) {
  const auj = new Date().toLocaleDateString("sv-SE"); // AAAA-MM-JJ local
  const moyenne = semaine.length ? Math.round(semaine.reduce((s, j) => s + j.charge_pct, 0) / semaine.length) : 0;
  const max = Math.max(100, ...semaine.map((j) => j.charge_pct));
  const donnees = semaine.map((j) => ({ ...j, aujourdhui: j.jour === auj }));
  const h = (capacite % 1 === 0 ? String(capacite) : capacite.toLocaleString("fr-FR"));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 11, padding: 17, borderRadius: 14, background: "#fff", border: "1px solid oklch(0.91 0.008 258)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Capacité de la semaine</h3>
          <span className="mono" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: moyenne > seuil ? "oklch(0.44 0.13 62)" : "oklch(0.24 0.02 255)" }}>{moyenne} %</span>
          <span data-muted="1" data-tiny="1" style={{ fontSize: 11, color: "oklch(0.50 0.02 255)" }}>en moyenne</span>
        </span>
        <span data-muted="1" style={{ fontSize: 11.5, color: "oklch(0.50 0.02 255)" }}>{h} h de production nette par technicien et par jour</span>
      </div>
      <div style={{ height: 140 }} role="img" aria-label={`Charge par jour : ${semaine.map((j) => `${j.libelle} ${j.charge_pct} %${j.alerte ? " (alerte)" : ""}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={donnees} margin={{ top: 20, right: 0, bottom: 0, left: 0 }} barCategoryGap="12%">
            <YAxis hide domain={[0, max]} />
            <XAxis dataKey="libelle" axisLine={false} tickLine={false} interval={0}
              tick={(p: { x: number; y: number; index: number; payload: { value: string } }) => (
                <text x={p.x} y={p.y + 10} textAnchor="middle" fontSize={10.5} fontFamily="var(--f-sans)" fill="oklch(0.44 0.02 255)" fontWeight={donnees[p.index]?.aujourdhui ? 700 : 500}>
                  {p.payload.value}
                </text>
              )} />
            <Bar dataKey="charge_pct" maxBarSize={44} radius={[6, 6, 3, 3]} minPointSize={2} isAnimationActive={false}>
              {donnees.map((j) => <Cell key={j.jour} fill={j.alerte ? "oklch(0.66 0.13 62)" : "oklch(0.62 0.10 258)"} />)}
              <LabelList dataKey="charge_pct" content={(p) => {
                const i = Number(p.index);
                const x = Number(p.x) + Number(p.width) / 2;
                return (
                  <text x={x} y={Number(p.y) - 7} textAnchor="middle" fontSize={10.5} fontFamily="var(--f-mono)" fill={donnees[i]?.alerte ? "oklch(0.44 0.13 62)" : "oklch(0.44 0.02 255)"}>
                    {p.value} %
                  </text>
                );
              }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <span data-tiny="1" style={{ fontSize: 11, lineHeight: 1.5, color: "oklch(0.52 0.02 255)" }}>
        Au-delà de {seuil} % la file d'attente s'allonge mécaniquement : refuser ou reprogrammer les dépôts non urgents.
      </span>
    </section>
  );
}
