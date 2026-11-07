import axios, { AxiosError } from "axios";
import type { components } from "./schema";

/** Types de l'API, générés depuis l'OpenAPI du backend (`npm run api:types`). */
export type S = components["schemas"];

const TOKEN_KEY = "reparu.token";

export const api = axios.create({ baseURL: "/api", timeout: 15000 });

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** « Se souvenir de ce poste » : jeton conservé 30 j (localStorage), sinon pour la session de l'onglet. */
export function setToken(token: string | null, remember = false): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch {
    /* stockage indisponible : la session reste en mémoire le temps de l'onglet */
  }
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !error.config?.url?.startsWith("/auth/login")) onUnauthorized();
    return Promise.reject(error);
  },
);

export interface ApiError {
  status: number | null;
  message: string;
  method: string;
  url: string;
}

/** Normalise une erreur Axios en message lisible (les messages métier du backend sont déjà en français). */
export function toApiError(e: unknown): ApiError {
  const err = e as AxiosError<{ detail?: unknown }>;
  const status = err.response?.status ?? null;
  const detail = err.response?.data?.detail;
  let message: string;
  if (typeof detail === "string") message = detail;
  else if (Array.isArray(detail)) message = detail.map((d: { msg?: string }) => d.msg?.replace(/^Value error, /, "")).join(" · ");
  else if (status === null) message = "Le serveur n'a pas répondu dans le délai imparti.";
  else message = `Erreur ${status}`;
  return { status, message, method: (err.config?.method ?? "get").toUpperCase(), url: `/api${err.config?.url ?? ""}` };
}

/** Télécharge un fichier binaire authentifié (PDF, CSV) et l'ouvre ou l'enregistre. */
export async function telecharger(url: string, nom: string, ouvrir = false): Promise<void> {
  const r = await api.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(r.data as Blob);
  if (ouvrir) {
    window.open(href, "_blank", "noopener");
  } else {
    const a = document.createElement("a");
    a.href = href;
    a.download = nom;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
