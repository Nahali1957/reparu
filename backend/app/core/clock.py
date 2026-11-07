from datetime import datetime


def maintenant() -> datetime:
    """Heure locale de l'atelier, naïve (conteneurs en TZ=Europe/Paris, comme MySQL)."""
    return datetime.now().replace(microsecond=0)
