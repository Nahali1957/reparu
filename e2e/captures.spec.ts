import { expect, test, type Page } from "@playwright/test";

/**
 * Une capture 1440 × 900 par écran de la maquette, en rôle Administrateur (état nominal),
 * plus les états « Verrouillé » (technicien) et le mode accessibilité.
 * Résultat : docs/screens/*.png, à comparer à docs/maquette/screens/*.png (écarts : docs/ECARTS_MAQUETTE.md).
 */
const MDP = process.env.DEMO_PASSWORD ?? "";
const API = (process.env.BASE_URL ?? "http://localhost:5180") + "/api";

async function jeton(page: Page, email: string): Promise<string> {
  const r = await page.request.post(`${API}/auth/login`, { data: { email, password: MDP } });
  expect(r.ok(), `connexion ${email}`).toBeTruthy();
  return (await r.json()).access_token;
}

async function connecter(page: Page, email: string): Promise<string> {
  const token = await jeton(page, email);
  await page.addInitScript((t) => window.sessionStorage.setItem("reparu.token", t), token);
  return token;
}

async function capturer(page: Page, route: string, nom: string) {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/^Chargement de/)).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(600); // animations Recharts
  await page.screenshot({ path: `docs/screens/${nom}.png` });
}

test("5.1 Connexion", async ({ page }) => {
  await capturer(page, "/connexion", "5.1");
});

test("écrans administrateur", async ({ page }) => {
  const token = await connecter(page, "c.vasseur@reparu.fr");
  const auth = { Authorization: `Bearer ${token}` };
  const cartes = await (await page.request.get(`${API}/reparations`, { headers: auth })).json();
  const dossier = (cartes.find((c: { statut: string }) => c.statut === "en_diagnostic") ?? cartes[0]).numero;
  const recents = await (await page.request.get(`${API}/facturation/recents`, { headers: auth })).json();
  const facture = recents[0]?.dossier ?? dossier;
  const ecrans: [string, string][] = [
    ["/tableau-de-bord", "5.2"],
    ["/reparations", "5.3"],
    [`/reparations/${dossier}`, "5.4"],
    ["/clients/1", "5.5"],
    ["/clients", "5.6"],
    ["/appareils/nouveau?client=1", "5.7"],
    ["/stocks", "5.8"],
    ["/fournisseurs", "5.9"],
    ["/stocks/capteurs", "5.10"],
    ["/rapports", "5.11"],
    ["/administration/comptes", "5.12"],
    ["/planning", "5.13"],
    [`/reparations/${facture}/facture`, "5.14"],
  ];
  for (const [route, nom] of ecrans) await capturer(page, route, nom);
});

test("états Verrouillé et mode accessibilité (technicien)", async ({ page }) => {
  await connecter(page, "l.marchand@reparu.fr");
  await capturer(page, "/tableau-de-bord", "etat-verrouille-5.2");
  await expect(page.getByText(/Accès non autorisé pour le rôle « Technicien »/)).toBeVisible();
  await page.addInitScript(() => window.localStorage.setItem("reparu.a11y", "1"));
  await capturer(page, "/reparations", "mode-accessibilite-5.3");
});
