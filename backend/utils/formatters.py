"""Data formatting utilities."""
from typing import Optional
from datetime import date, datetime


def normalize_position(pos: Optional[str]) -> str:
    """Normalize vote position to standard format."""
    t = (pos or "").strip().lower()
    if t in ("yea", "yes", "aye", "y"):
        return "Yea"
    if t in ("nay", "no", "n"):
        return "Nay"
    if t == "present":
        return "Present"
    if t in ("not voting", "notvoting", "nv", "n/v", "absent"):
        return "Not Voting"
    return (pos or "").strip() or "—"


def to_iso(v: Optional[date | datetime | str]) -> Optional[str]:
    """Convert date/datetime to ISO string."""
    if v is None:
        return None
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return str(v)


def to_date(v) -> Optional[date]:
    """Parse 'YYYY-MM-DD' or ISO datetime strings into a date."""
    if not v:
        return None
    s = str(v).strip()
    try:
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            return date.fromisoformat(s)
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s).date()
    except Exception:
        return None
