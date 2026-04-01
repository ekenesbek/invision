"""IZhO (Zhautykov International Olympiad) results scraper."""

from __future__ import annotations

import re

import httpx

from .base import BaseScraper, ScrapedTalent


class IZhOScraper(BaseScraper):
    source_name = "izho"

    RESULTS_URLS = {
        2026: "https://izho.kz/contest/results-izho-2026/",
        2025: "https://izho.kz/contest/results-izho-2025/",
        2024: "https://izho.kz/contest/results-izho-2024/",
        2023: "https://izho.kz/contest/results-izho-2023/",
        2022: "https://izho.kz/contest/results-izho-2022/",
        2021: "https://izho.kz/contest/results-izho-2021/",
        2020: "https://izho.kz/results-izho-2020/",
    }

    async def scrape(self, min_year: int = 2020, **kwargs) -> list[ScrapedTalent]:
        talents_map: dict[str, ScrapedTalent] = {}

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            for year, url in self.RESULTS_URLS.items():
                if year < min_year:
                    continue
                try:
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        continue
                    self._parse_year(resp.text, year, talents_map)
                except Exception:
                    continue

        return list(talents_map.values())

    def _parse_year(self, html: str, year: int, talents_map: dict):
        """Parse all tables from a year's results page.

        Table format (2026): №, Full name, Code, P1..Pn, Total, Medal
        Code column contains country code like '32KAZ18', '99RUS11'.
        """
        tables = re.findall(r"<table[^>]*>(.*?)</table>", html, re.DOTALL)

        # Detect subject from headings before each table
        subjects = re.findall(r"<h[23][^>]*>(.*?)</h[23]>", html, re.DOTALL)
        subject_names = []
        for s in subjects:
            text = re.sub(r"<[^>]+>", "", s).strip().lower()
            if "math" in text:
                subject_names.append("Math")
            elif "phys" in text or "физик" in text:
                subject_names.append("Physics")
            elif "comput" in text or "informatic" in text or "cs" in text:
                subject_names.append("CS")
            else:
                subject_names.append(text[:20])

        for idx, table in enumerate(tables):
            subject = subject_names[idx] if idx < len(subject_names) else f"Subject {idx + 1}"
            rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.DOTALL)

            for row in rows:
                cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
                if len(cells) < 4:
                    continue

                texts = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]

                # Last cell is medal
                medal_text = texts[-1].upper().strip()
                if medal_text not in ("GOLD", "SILVER", "BRONZE"):
                    continue

                medal = medal_text.capitalize()

                # Name is in column 1 (index 1), Code in column 2 (index 2)
                # First column (index 0) is rank number
                name = texts[1].replace("\xa0", " ").strip() if len(texts) > 1 else ""
                code = texts[2] if len(texts) > 2 else ""

                if not name or len(name) < 3:
                    continue

                # Check if participant is from Kazakhstan via code
                if "KAZ" not in code.upper():
                    continue

                # Total score is second-to-last column
                score = texts[-2] if len(texts) > 3 else ""

                achievement = {
                    "type": "medal",
                    "competition": f"IZhO {year} ({subject})",
                    "result": f"{medal} Medal",
                    "score": score,
                    "year": year,
                }

                key = name.lower().replace(" ", "_")
                if key in talents_map:
                    existing_comps = {a["competition"] for a in talents_map[key].achievements}
                    if achievement["competition"] not in existing_comps:
                        talents_map[key].achievements.append(achievement)
                else:
                    talents_map[key] = ScrapedTalent(
                        source="izho",
                        external_id=f"izho_{key}",
                        full_name=name,
                        country="Kazakhstan",
                        achievements=[achievement],
                        profile_url=self.RESULTS_URLS.get(year, "https://izho.kz/contest/"),
                    )
