"""Matrice de droits unique de l'application.

Chaque permission liste les rôles autorisés. `responsable` = droits `admin`
sauf la gestion des comptes et le journal d'audit (DECISIONS D-A1).
"""

from app.models.enums import Role

ADMIN, RESP, TECH = Role.admin, Role.responsable, Role.technicien
TOUS = frozenset({ADMIN, RESP, TECH})
PILOTAGE = frozenset({ADMIN, RESP})

# permission -> (libellé affiché dans le message de refus, rôles autorisés)
MATRICE: dict[str, tuple[str, frozenset[Role]]] = {
    "dashboard": ("Tableau de bord", PILOTAGE),
    "reparations": ("Réparations", TOUS),
    "planning": ("Affectation & planning", PILOTAGE),
    "facturation": ("Devis & facturation", TOUS),
    "clients": ("Clients", TOUS),
    "stocks.lire": ("Inventaire", TOUS),
    "stocks.ecrire": ("Corrections de stock", PILOTAGE),
    "fournisseurs": ("Fournisseurs", PILOTAGE),
    "iot": ("Capteurs IoT", PILOTAGE),
    "rapports": ("Rapports & exports", PILOTAGE),
    "ia": ("Diagnostic assisté", TOUS),
    "ia.fiabilite": ("Fiabilité des modèles", PILOTAGE),
    "comptes": ("Gestion des comptes", frozenset({ADMIN})),
    "audit": ("Journal des accès sensibles", frozenset({ADMIN})),
}

LIBELLES_ROLES = {ADMIN: "Administrateur", RESP: "Responsable", TECH: "Technicien"}


def autorise(role: Role, permission: str) -> bool:
    return role in MATRICE[permission][1]


def permissions_du_role(role: Role) -> list[str]:
    return [p for p, (_, roles) in MATRICE.items() if role in roles]
