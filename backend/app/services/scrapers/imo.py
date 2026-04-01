"""IMO (International Mathematical Olympiad) results scraper."""

from __future__ import annotations

import re

import httpx

from .base import BaseScraper, ScrapedTalent


class IMOScraper(BaseScraper):
    source_name = "imo"

    BASE_URL = "https://www.imo-official.org/country_individual_r.aspx"

    async def scrape(
        self,
        country_code: str = "KAZ",
        min_year: int = 2018,
        **kwargs,
    ) -> list[ScrapedTalent]:
        """Scrape IMO results for Kazakhstan."""
        url = f"{self.BASE_URL}?code={country_code}&column=year&order=desc"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        html = resp.text
        talents_map: dict[str, ScrapedTalent] = {}

        # Parse HTML table rows — pattern: year, name(link), P1-P6, total, rank, award
        # Table rows between <tr> tags after the header
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL)

        for row in rows:
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
            if len(cells) < 10:
                continue

            year_text = re.sub(r"<[^>]+>", "", cells[0]).strip()
            if not year_text.isdigit():
                continue
            year = int(year_text)
            if year < min_year:
                continue

            # Extract name from link
            name_match = re.search(r">([^<]+)</a>", cells[1])
            name = name_match.group(1).strip() if name_match else cells[1].strip()
            name = re.sub(r"<[^>]+>", "", name).strip()
            if not name:
                continue

            # Extract participant ID from link
            id_match = re.search(r"id=(\d+)", cells[1])
            pid = id_match.group(1) if id_match else name.replace(" ", "_")

            # Scores P1-P6
            scores = []
            for i in range(2, 8):
                s = re.sub(r"<[^>]+>", "", cells[i]).strip()
                scores.append(int(s) if s.isdigit() else 0)

            total = re.sub(r"<[^>]+>", "", cells[8]).strip()
            total = int(total) if total.isdigit() else sum(scores)

            rank_text = re.sub(r"<[^>]+>", "", cells[9]).strip()

            award = ""
            # Check remaining cells for award text
            for ci in range(9, len(cells)):
                cell_text = re.sub(r"<[^>]+>", "", cells[ci]).strip()
                if cell_text in ("Gold Medal", "Silver Medal", "Bronze Medal", "Honourable Mention",
                                 "Gold", "Silver", "Bronze", "Honourable"):
                    award = cell_text.replace(" Medal", "")
                    break
            # Also check for award images/links
            if not award:
                award_match = re.search(r"(Gold|Silver|Bronze|Honourable)", row)
                if award_match:
                    award = award_match.group(1)

            achievement = {
                "type": "medal" if award else "participation",
                "competition": f"IMO {year}",
                "result": award or "Participant",
                "score": total,
                "rank": rank_text,
                "problem_scores": scores,
                "year": year,
            }

            if not award or award == "Honourable":
                continue

            key = pid
            if key in talents_map:
                talents_map[key].achievements.append(achievement)
            else:
                talents_map[key] = ScrapedTalent(
                    source="imo",
                    external_id=f"imo_{pid}",
                    full_name=name,
                    country="Kazakhstan",
                    achievements=[achievement],
                    profile_url=f"https://www.imo-official.org/participant_r.aspx?id={pid}",
                    raw_data={"participant_id": pid},
                )

        return list(talents_map.values())
