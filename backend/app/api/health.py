from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["santé"])


class HealthOut(BaseModel):
    status: str


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut(status="ok")
