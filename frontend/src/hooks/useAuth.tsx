import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken, setUnauthorizedHandler, type S } from "../api/client";

type Me = S["MeOut"];

interface AuthValue {
  user: Me | null;
  ready: boolean;
  can: (permission: string) => boolean;
  login: (email: string, password: string, remember: boolean) => Promise<Me>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const LIBELLES_ROLE: Record<string, string> = { admin: "Administrateur", responsable: "Responsable", technicien: "Technicien" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
    if (!getToken()) {
      setReady(true);
      return;
    }
    api.get<Me>("/auth/me").then((r) => setUser(r.data)).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const r = await api.post<S["LoginOut"]>("/auth/login", { email, password, se_souvenir: remember });
    setToken(r.data.access_token, remember);
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setToken(null);
      setUser(null);
    }
  }, []);

  const can = useCallback((p: string) => !!user?.permissions.includes(p), [user]);
  const value = useMemo(() => ({ user, ready, can, login, logout }), [user, ready, can, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth hors AuthProvider");
  return v;
}
