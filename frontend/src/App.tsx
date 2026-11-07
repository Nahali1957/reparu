import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Shell, { Ecran } from "./components/Shell";
import { useAuth } from "./hooks/useAuth";
import Appareil from "./pages/Appareil";
import Capteurs from "./pages/Capteurs";
import Clients from "./pages/Clients";
import Comptes from "./pages/Comptes";
import Connexion from "./pages/Connexion";
import Dossier from "./pages/Dossier";
import Facturation from "./pages/Facturation";
import FicheClient from "./pages/FicheClient";
import Fournisseurs from "./pages/Fournisseurs";
import Introuvable from "./pages/Introuvable";
import Inventaire from "./pages/Inventaire";
import Kanban from "./pages/Kanban";
import Planning from "./pages/Planning";
import Rapports from "./pages/Rapports";
import TableauDeBord from "./pages/TableauDeBord";
import { SCREENS } from "./screens";

function Protege({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/connexion" replace state={{ depuis: location.pathname }} />;
  return <>{children}</>;
}

function Accueil() {
  const { can } = useAuth();
  return <Navigate to={can("dashboard") ? "/tableau-de-bord" : "/reparations"} replace />;
}

const e = (key: string, page: ReactNode) => <Ecran meta={SCREENS[key]}>{page}</Ecran>;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/connexion" element={<Connexion />} />
        <Route element={<Protege><Shell /></Protege>}>
          <Route index element={<Accueil />} />
          <Route path="/tableau-de-bord" element={e("dashboard", <TableauDeBord />)} />
          <Route path="/reparations" element={e("kanban", <Kanban />)} />
          <Route path="/reparations/:numero" element={e("dossier", <Dossier />)} />
          <Route path="/reparations/:numero/facture" element={e("facturation", <Facturation />)} />
          <Route path="/facturation" element={e("facturation", <Facturation />)} />
          <Route path="/planning" element={e("affectation", <Planning />)} />
          <Route path="/clients" element={e("clients", <Clients />)} />
          <Route path="/clients/:id" element={e("client", <FicheClient />)} />
          <Route path="/appareils/nouveau" element={e("appareil", <Appareil />)} />
          <Route path="/appareils/:id" element={e("appareil", <Appareil />)} />
          <Route path="/stocks" element={e("inventaire", <Inventaire />)} />
          <Route path="/stocks/capteurs" element={e("iot", <Capteurs />)} />
          <Route path="/fournisseurs" element={e("fournisseurs", <Fournisseurs />)} />
          <Route path="/rapports" element={e("rapports", <Rapports />)} />
          <Route path="/administration/comptes" element={e("comptes", <Comptes />)} />
          <Route path="*" element={<Introuvable />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
