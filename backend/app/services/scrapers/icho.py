"""IChO (International Chemistry Olympiad) results scraper."""

from __future__ import annotations

import re

import httpx

from .base import BaseScraper, ScrapedTalent


class IChOScraper(BaseScraper):
    source_name = "icho"

    BASE_URL = "https://www.icho-official.org/results/country_info.php"

    async def scrape(self, min_year: int = 2018, **kwargs) -> list[ScrapedTalent]:
        url = f"{self.BASE_URL}?country=Kazakhstan"

        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        html = resp.text
        talents_map: dict[str, ScrapedTalent] = {}

        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL)

        for row in rows:
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
            if len(cells) < 4:
                continue

            year_text = re.sub(r"<[^>]+>", "", cells[0]).strip()
            if not year_text.isdigit():
                continue
            year = int(year_text)
            if year < min_year:
                continue

            # Contestant name (column 1)
            name = re.sub(r"<[^>]+>", "", cells[1]).strip()
            if not name:
                continue

            # Column 2 is original script name, skip
            # Rank (column 3)
            rank_text = re.sub(r"<[^>]+>", "", cells[3]).strip()

            # Award (column 4 or from images in row)
            award = ""
            for medal in ["Gold", "Silver", "Bronze", "Honourable"]:
                if medal.lower() in row.lower():
                    award = medal
                    break

            achievement = {
                "type": "medal" if award and award != "Honourable" else "participation",
                "competition": f"IChO {year}",
                "result": award + " medal" if award else "Participant",
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
                    source="icho",
                    external_id=f"icho_{key}",
                    full_name=name,
                    country="Kazakhstan",
                    achievements=[achievement],
                    profile_url=url,
                )

        return list(talents_map.values())
