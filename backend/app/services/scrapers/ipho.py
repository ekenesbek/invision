"""IPhO (International Physics Olympiad) results scraper."""

from __future__ import annotations

import re

import httpx

from .base import BaseScraper, ScrapedTalent


class IPhOScraper(BaseScraper):
    source_name = "ipho"

    BASE_URL = "https://ipho-unofficial.org/countries/KAZ/individual"

    async def scrape(self, min_year: int = 2018, **kwargs) -> list[ScrapedTalent]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(self.BASE_URL)
            resp.raise_for_status()

        html = resp.text
        talents_map: dict[str, ScrapedTalent] = {}

        # Parse table rows: Year, Contestant, Rank, Award
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL)

        for row in rows:
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
            if len(cells) < 3:
                continue

            # Year might be in first cell or inherited from previous row
            year_text = re.sub(r"<[^>]+>", "", cells[0]).strip()
            if year_text.isdigit():
                year = int(year_text)
            else:
                continue

            if year < min_year:
                continue

            # Contestant name
            name = re.sub(r"<[^>]+>", "", cells[1]).strip()
            if not name:
                continue

            # Rank
            rank_text = re.sub(r"<[^>]+>", "", cells[2]).strip() if len(cells) > 2 else ""

            # Award — check for medal images or text
            award = ""
            if len(cells) > 3:
                award_cell = cells[3]
                for medal in ["Gold", "Silver", "Bronze", "Honourable"]:
                    if medal.lower() in award_cell.lower():
                        award = medal
                        break
            if not award:
                for medal in ["gold", "silver", "bronze", "honourable"]:
                    if medal in row.lower():
                        award = medal.capitalize()
                        break

            achievement = {
                "type": "medal" if award and award != "Honourable" else "participation",
                "competition": f"IPhO {year}",
                "result": award + " Medal" if award else "Participant",
                "rank": rank_text,
                "year": year,
            }

            if not award or award == "Honourable":
                continue

            key = name.lower().replace(" ", "_")
            if key in talents_map:
                talents_map[key].achievements.append(achievement)
            else:
                talents_map[key] = ScrapedTalent(
                    source="ipho",
                    external_id=f"ipho_{key}",
                    full_name=name,
                    country="Kazakhstan",
                    achievements=[achievement],
                    profile_url=self.BASE_URL,
                )

        return list(talents_map.values())
