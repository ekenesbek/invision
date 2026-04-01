"""Base scraper interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ScrapedTalent:
    """Raw talent data from an external source."""
    source: str  # codeforces / imo / ioi
    external_id: str
    full_name: str
    country: str = "Kazakhstan"
    city: str = ""
    organization: str = ""  # school / club / org
    achievements: list[dict] = field(default_factory=list)
    # e.g. [{"type": "medal", "competition": "IMO 2024", "result": "Gold", "score": 42}]
    profile_url: str = ""
    raw_data: dict = field(default_factory=dict)


class BaseScraper(ABC):
    """Abstract scraper for talent sources."""

    source_name: str = ""

    @abstractmethod
    async def scrape(self, **kwargs) -> list[ScrapedTalent]:
        """Fetch talents from source. Returns list of ScrapedTalent."""
        ...
