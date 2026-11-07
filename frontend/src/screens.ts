/** Les 14 écrans de la maquette : route, libellés, icône, type de squelette et permission RBAC requise. */
export type Kind = "form" | "dashboard" | "kanban" | "detail" | "table";

export interface ScreenMeta {
  key: string;
  num: string;
  label: string; // titre de l'en-tête
  nav?: string; // libellé raccourci de la barre latérale
  icon: string;
  kind: Kind;
  crumb: string;
  permission: string | null;
  /** Endpoint appelé quand l'accès est refusé côté client, pour que le refus soit journalisé côté serveur. */
  probe?: string;
  roles: string;
}

export const SCREENS: Record<string, ScreenMeta> = {
  login: { key: "login", num: "5.1", label: "Connexion", icon: "⏻", kind: "form", crumb: "Authentification", permission: null, roles: "tous" },
  dashboard: { key: "dashboard", num: "5.2", label: "Tableau de bord", icon: "◧", kind: "dashboard", crumb: "Pilotage", permission: "dashboard", probe: "/dashboard", roles: "Administrateur, Responsable" },
  kanban: { key: "kanban", num: "5.3", label: "Kanban des réparations", nav: "Kanban", icon: "🛠", kind: "kanban", crumb: "Réparations", permission: "reparations", roles: "Technicien, Responsable, Administrateur" },
  dossier: { key: "dossier", num: "5.4", label: "Dossier de réparation", icon: "◍", kind: "detail", crumb: "Réparations · dossier", permission: "reparations", roles: "Technicien, Responsable, Administrateur" },
  affectation: { key: "affectation", num: "5.13", label: "Affectation & planning", icon: "⧉", kind: "kanban", crumb: "Réparations · planning", permission: "planning", probe: "/planning", roles: "Administrateur, Responsable" },
  facturation: { key: "facturation", num: "5.14", label: "Devis & facturation", icon: "€", kind: "detail", crumb: "Réparations · facturation", permission: "facturation", roles: "Technicien, Responsable, Administrateur" },
  clients: { key: "clients", num: "5.6", label: "Liste des clients", icon: "👤", kind: "table", crumb: "Clients", permission: "clients", roles: "Technicien, Responsable, Administrateur" },
  client: { key: "client", num: "5.5", label: "Fiche client", icon: "▣", kind: "detail", crumb: "Clients · fiche", permission: "clients", roles: "Technicien, Responsable, Administrateur" },
  appareil: { key: "appareil", num: "5.7", label: "Ajout / édition appareil", icon: "📱", kind: "form", crumb: "Clients · appareil", permission: "clients", roles: "Technicien, Responsable, Administrateur" },
  inventaire: { key: "inventaire", num: "5.8", label: "Inventaire des pièces", nav: "Inventaire", icon: "📦", kind: "table", crumb: "Stocks", permission: "stocks.lire", roles: "Technicien, Responsable, Administrateur" },
  fournisseurs: { key: "fournisseurs", num: "5.9", label: "Fournisseurs & comparaison", nav: "Fournisseurs", icon: "🤝", kind: "table", crumb: "Stocks · fournisseurs", permission: "fournisseurs", probe: "/fournisseurs", roles: "Administrateur, Responsable" },
  iot: { key: "iot", num: "5.10", label: "Alertes capteurs IoT", nav: "IoT", icon: "◉", kind: "table", crumb: "Stocks · capteurs", permission: "iot", probe: "/iot", roles: "Administrateur, Responsable" },
  rapports: { key: "rapports", num: "5.11", label: "Rapports & exports", icon: "📊", kind: "dashboard", crumb: "Pilotage · rapports", permission: "rapports", probe: "/rapports", roles: "Administrateur, Responsable" },
  comptes: { key: "comptes", num: "5.12", label: "Gestion des comptes", nav: "Gestion", icon: "🛡", kind: "table", crumb: "Administration", permission: "comptes", probe: "/comptes", roles: "Administrateur" },
};

/** Ordre de la barre latérale (maquette). */
export const NAV = ["dashboard", "kanban", "affectation", "facturation", "clients", "inventaire", "fournisseurs", "iot", "rapports", "comptes"];

export const ROUTES: Record<string, string> = {
  dashboard: "/tableau-de-bord", kanban: "/reparations", affectation: "/planning", facturation: "/facturation", clients: "/clients",
  inventaire: "/stocks", fournisseurs: "/fournisseurs", iot: "/stocks/capteurs", rapports: "/rapports", comptes: "/administration/comptes",
};
