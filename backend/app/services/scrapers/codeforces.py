"""Codeforces API scraper — find top-rated KZ participants."""

from __future__ import annotations

import httpx

from .base import BaseScraper, ScrapedTalent


class CodeforcesScraper(BaseScraper):
    source_name = "codeforces"

    RATED_LIST_URL = "https://codeforces.com/api/user.ratedList?activeOnly=true"
    USER_INFO_URL = "https://codeforces.com/api/user.info"

    async def scrape(
        self,
        country: str = "Kazakhstan",
        min_rating: int = 1200,
        max_results: int = 100,
        **kwargs,
    ) -> list[ScrapedTalent]:
        """Fetch all rated KZ users above min_rating."""
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(self.RATED_LIST_URL)
            resp.raise_for_status()
            data = resp.json()

        if data.get("status") != "OK":
            return []

        talents = []
        for user in data["result"]:
            if user.get("country") != country:
                continue
            if user.get("rating", 0) < min_rating:
                continue

            first = user.get("firstName", "")
            last = user.get("lastName", "")
            name = f"{first} {last}".strip() or user["handle"]

            talents.append(ScrapedTalent(
                source="codeforces",
                external_id=user["handle"],
                full_name=name,
                country=country,
                city=user.get("city", ""),
                organization=user.get("organization", ""),
                achievements=[{
                    "type": "rating",
                    "competition": "Codeforces",
                    "result": user.get("rank", ""),
                    "score": user.get("rating", 0),
                    "max_score": user.get("maxRating", 0),
                    "max_rank": user.get("maxRank", ""),
                }],
                profile_url=f"https://codeforces.com/profile/{user['handle']}",
                raw_data=user,
            ))

        # Sort by rating descending
        talents.sort(key=lambda t: t.achievements[0]["score"], reverse=True)
        return talents[:max_results]
