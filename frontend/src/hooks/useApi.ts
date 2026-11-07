import { useCallback, useEffect, useRef, useState } from "react";
import { api, toApiError, type ApiError } from "../api/client";

export type EtatEcran = "loading" | "error" | "locked" | "empty" | "nominal";

/**
 * Charge une ressource GET et expose l'état d'écran de la maquette :
 * loading (squelette), error (504, réseau…), locked (403 RBAC), empty, nominal.
 */
export function useApi<T>(url: string | null, estVide?: (d: T) => boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const vide = useRef(estVide);
  vide.current = estVide;

  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<T>(url);
      setData(r.data);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  let etat: EtatEcran = "nominal";
  if (loading && data === null) etat = "loading";
  else if (error?.status === 403) etat = "locked";
  else if (error && data === null) etat = "error";
  else if (data !== null && vide.current?.(data)) etat = "empty";

  return { data, setData, error, loading, etat, reload };
}

/** Exécute une action (POST/PATCH…) et renvoie [lancer, enCours, erreur]. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(toApiError(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );
  return { run, busy, error, setError };
}
