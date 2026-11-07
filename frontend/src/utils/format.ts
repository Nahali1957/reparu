/** Formats français utilisés dans toute l'interface. */
const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const EUR0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const eur = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? "—" : EUR.format(Number(v)));
export const eur0 = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? "—" : EUR0.format(Number(v)));
export const nombre = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "—" : `${nombre(v, d)} %`);

export const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("fr-FR") : "—");
export const dateCourte = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "—";
export const heure = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
export const dateHeure = (v: string | null | undefined) => (v ? `${dateCourte(v)} ${heure(v)}` : "—");
export const dateHeureLongue = (v: string | null | undefined) => (v ? `${date(v)} à ${heure(v)}` : "—");

/** « 0 h 32 » comme sur la maquette. */
export const duree = (minutes: number | null | undefined) =>
  minutes === null || minutes === undefined ? "—" : `${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, "0")}`;

export const delta = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${nombre(v, 1)} %`);
