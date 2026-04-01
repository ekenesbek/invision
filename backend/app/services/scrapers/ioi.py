"""IOI (International Olympiad in Informatics) results scraper."""

from __future__ import annotations

import re

import httpx

from .base import BaseScraper, ScrapedTalent


class IOIScraper(BaseScraper):
    source_name = "ioi"

    BASE_URL = "https://stats.ioinformatics.org/results"

    async def scrape(
        self,
        country_code: str = "KAZ",
        min_year: int = 2018,
        **kwargs,
    ) -> list[ScrapedTalent]:
        """Scrape IOI results for Kazakhstan."""
        url = f"{self.BASE_URL}/{country_code}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        html = resp.text
        talents_map: dict[str, ScrapedTalent] = {}

        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL)

        for row in rows:
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
            if len(cells) < 5:
                continue

            year_text = re.sub(r"<[^>]+>", "", cells[0]).strip()
            if not year_text.isdigit():
                continue
            year = int(year_text)
            if year < min_year:
                continue

            # Name with link to /people/ID
            name_match = re.search(r'href="/people/(\d+)"[^>]*>([^<]+)', cells[1])
            if not name_match:
                name = re.sub(r"<[^>]+>", "", cells[1]).strip()
                pid = name.replace(" ", "_")
            else:
                pid = name_match.group(1)
                name = name_match.group(2).strip()

            if not name:
                continue

            # Try to get score and medal from remaining cells
            # Structure varies by year, but typically: tasks..., abs_score, rel_score, abs_rank, rel_rank, medal
            all_text = re.sub(r"<[^>]+>", " ", row).strip()

            # Extract medal
            award = ""
            for medal in ["Gold", "Silver", "Bronze"]:
                if medal.lower() in all_text.lower():
                    award = medal
                    break
            # Also check images
            award_img = re.search(r'alt="(gold|silver|bronze)"', row, re.I)
            if award_img:
                award = award_img.group(1).capitalize()

            # Extract score (look for decimal numbers)
            scores = re.findall(r"(\d+\.\d+)", all_text)
            total_score = float(scores[0]) if scores else 0

            # Extract rank
            rank_match = re.search(r"(\d+)\s*/\s*\d+", all_text)
            rank_text = rank_match.group(0) if rank_match else ""

            achievement = {
                "type": "medal" if award else "participation",
                "competition": f"IOI {year}",
                "result": award or "Participant",
                "score": total_score,
                "rank": rank_text,
                "year": year,
            }

            if not award:
                continue

            key = pid
            if key in talents_map:
                talents_map[key].achievements.append(achievement)
            else:
                talents_map[key] = ScrapedTalent(
                    source="ioi",
                    external_id=f"ioi_{pid}",
                    full_name=name,
                    country="Kazakhstan",
                    achievements=[achievement],
                    profile_url=f"https://stats.ioinformatics.org/people/{pid}",
                    raw_data={"person_id": pid},
                )

        return list(talents_map.values())
