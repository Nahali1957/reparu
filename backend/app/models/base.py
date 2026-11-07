from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Montants en euros HT, deux décimales.
MONEY = Numeric(10, 2)
# BIGINT en MySQL ; INTEGER en SQLite (tests) pour garder l'auto-incrément.
ID = BigInteger().with_variant(Integer, "sqlite")


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    id: Mapped[int] = mapped_column(ID, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


def fk(target: str, *, nullable: bool = False, ondelete: str = "RESTRICT", index: bool = True, primary_key: bool = False) -> Mapped:
    return mapped_column(
        ID, ForeignKey(target, ondelete=ondelete), nullable=nullable, index=index, primary_key=primary_key
    )
