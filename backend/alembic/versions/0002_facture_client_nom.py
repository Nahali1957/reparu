"""identité du client figée sur la facture (obligation légale de conservation vs anonymisation RGPD)

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("factures", sa.Column("client_nom", sa.String(length=120), nullable=True))
    op.execute("UPDATE factures f JOIN reparations r ON r.id = f.reparation_id JOIN clients c ON c.id = r.client_id "
               "SET f.client_nom = c.nom WHERE f.client_nom IS NULL")


def downgrade() -> None:
    op.drop_column("factures", "client_nom")
