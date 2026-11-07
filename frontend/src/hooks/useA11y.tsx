import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "reparu.a11y";
const Ctx = createContext<{ a11y: boolean; toggle: () => void }>({ a11y: false, toggle: () => {} });

/** Mode accessibilité de la maquette : contraste renforcé, tailles plus grandes. Préférence du poste. */
export function A11yProvider({ children }: { children: ReactNode }) {
  const [a11y, setA11y] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-a11y", a11y ? "1" : "0");
    try {
      localStorage.setItem(KEY, a11y ? "1" : "0");
    } catch {
      /* préférence non persistée */
    }
  }, [a11y]);
  return <Ctx.Provider value={{ a11y, toggle: () => setA11y((v) => !v) }}>{children}</Ctx.Provider>;
}

export const useA11y = () => useContext(Ctx);
