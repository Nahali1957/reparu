from typing import Any

from sqlalchemy.orm import Session

from app.models.tables import AuditLog


def audit(
    db: Session,
    action: str,
    *,
    user_id: int | None = None,
    email: str | None = None,
    ressource: str | None = None,
    ressource_id: Any = None,
    details: dict | None = None,
    ip: str | None = None,
    commit: bool = True,
) -> None:
    db.add(AuditLog(
        user_id=user_id, email_tente=email, action=action, ressource=ressource,
        ressource_id=None if ressource_id is None else str(ressource_id), details=details, ip=ip,
    ))
    if commit:
        db.commit()
