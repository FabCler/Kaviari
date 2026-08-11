#!/usr/bin/env python3
"""Extract the Kaviari product catalog + weekly consumption history from the
Thammachart 'Import Review' workbook (one sheet per weekly review).

Usage:  python3 data/extract_kaviari.py <path-to-Import_Review_Kaviari.xlsx>

Outputs (written next to this script):
  - kaviari_products.json      product catalog used by prisma/seed.ts
  - consumption_history.json   per-SKU weekly consumption (tins/week, oldest -> newest)

Unit costs are NOT present in the source workbook; they are estimated from
typical Kaviari wholesale EUR price points (per-kg rates below) and flagged
with "costIsEstimate": true so they are easy to spot and replace.
"""
import json
import re
import sys
import warnings
from pathlib import Path

import openpyxl

warnings.filterwarnings("ignore")

OUT_DIR = Path(__file__).parent

# Sheets ordered oldest -> newest. The very first review (11.06.26) reports
# month-to-date figures rather than weekly ones, so it is excluded.
WEEKLY_SHEETS = [
    "17.06.26", "23.06.26", "30.06.26", "07.07.26",
    "14.07.26", "21.07.26", "28.07.26", "04.08.26", "10.08.26",
]

# Marketing material / packaging rows are not stock the app manages.
EXCLUDE_KEYWORDS = [
    "empty tin", "rafraichissoir", "rafraishissoir", "spoon", "bag", "logo",
    "kits", "lid", "bottom", "cool pocket", "holder", "shopping", "flashlight",
    "posm", "opener", "board", "partage set", "mkt mat", "marketing material",
]

# Estimated wholesale EUR/kg by caviar line (source file has no prices).
EUR_PER_KG = {
    "beluga imperial": 3400,
    "oscietra gold": 1800,
    "daurikus": 1500,
    "oscietra": 1250,          # Oscietra Prestige / En-K Oscietra / Villa
    "kristal": 1050,
    "transmontanus": 1000,
    "baeri royal": 850,
    "baenki": 850,
    "baeri": 750,
}

# name-keyword -> (species, grade). First match wins, so more specific first.
SPECIES = [
    ("beluga imperial", ("Huso huso", "Beluga Impérial")),
    ("oscietra gold", ("Acipenser gueldenstaedtii", "Oscietra Gold")),
    ("daurikus", ("Huso dauricus", "Daurikus")),
    ("oscietra", ("Acipenser gueldenstaedtii", "Oscietra Prestige")),
    ("kristal", ("Acipenser schrenckii × Huso dauricus", "Kristal®")),
    ("transmontanus", ("Acipenser transmontanus", "Transmontanus")),
    ("baenki", ("Acipenser baerii", "Baeri En-K")),
    ("baeri royal", ("Acipenser baerii", "Baeri Royal")),
    ("baeri", ("Acipenser baerii", "Baeri")),
]

# Non-caviar Kaviari products: (keyword, unit grams, EUR / unit estimate).
OTHER_PRODUCTS = [
    ("trout roe", 50, 12.0),
    ("whitefish roe", 50, 9.0),
    ("smoked salmon", 600, 38.0),
    ("smoked eel", 1000, 90.0),
    ("king crab", 1000, 85.0),
    ("k-en barre", 55, 95.0),
    ("condiment and mini blinis", 30, 78.0),
]

TIN_SIZE_RE = re.compile(r"\((\d+)\s*g\s*/\s*tin\)", re.IGNORECASE)
GM_TIN_RE = re.compile(r"(\d+)\s*g(?:m|r)?\s*/\s*tin", re.IGNORECASE)


def tin_size_from_name(name: str) -> int | None:
    m = TIN_SIZE_RE.search(name) or GM_TIN_RE.search(name)
    return int(m.group(1)) if m else None


def classify(name: str):
    """Return (category, species, grade, tinSizeGrams, unitCost) or None to skip."""
    n = name.lower()
    if any(k in n for k in EXCLUDE_KEYWORDS):
        return None
    is_caviar_tin = "caviar" in n and tin_size_from_name(name) is not None
    if is_caviar_tin and "blinis" not in n:
        grams = tin_size_from_name(name)
        for key, (species, grade) in SPECIES:
            if key in n:
                per_kg = EUR_PER_KG[key if key in EUR_PER_KG else "oscietra"]
                cost = round(per_kg * grams / 1000, 2)
                return ("caviar", species, grade, grams, cost)
        return None  # caviar tin of unknown line -> skip rather than guess
    for key, grams, cost in OTHER_PRODUCTS:
        if key in n:
            return ("other", None, None, grams, cost)
    return None


def main(path: str) -> None:
    wb = openpyxl.load_workbook(path, data_only=True)
    sheets = {ws.title: ws for ws in wb.worksheets}
    latest = WEEKLY_SHEETS[-1]

    products: dict[str, dict] = {}
    history: dict[str, list[float]] = {}

    for sheet_name in WEEKLY_SHEETS:
        ws = sheets[sheet_name]
        rows = list(ws.iter_rows(min_row=3, values_only=True))
        for r in rows:
            if not r or r[5] != "Kaviari Paris":
                continue
            sap, name = r[1], r[3]
            if not sap or not name or str(sap).startswith("FOC"):
                continue
            name = str(name).strip()
            cls = classify(name)
            if cls is None:
                continue
            category, species, grade, grams, cost = cls
            if sap not in products:
                products[sap] = {
                    "kaviariCode": str(sap),
                    "name": name,
                    "species": species,
                    "grade": grade,
                    "tinSizeGrams": grams,
                    "unitCost": cost,
                    "costIsEstimate": True,
                    "currency": "EUR",
                    "category": category,
                    "active": (r[7] == "active"),
                    "isPlaceholder": False,
                    "uom": r[19],
                }
                history[sap] = [0.0] * len(WEEKLY_SHEETS)
            idx = WEEKLY_SHEETS.index(sheet_name)
            history[sap][idx] = float(r[18] or 0)
            if sheet_name == latest:
                products[sap]["stockOnHandTins"] = float(r[16] or 0)
                products[sap]["pendingPoTins"] = float(r[15] or 0)

    # Drop duplicate names with zero movement & zero stock (label variants of
    # the same tin kept in SAP for other business units).
    by_name: dict[str, list[str]] = {}
    for sap, p in products.items():
        by_name.setdefault(p["name"], []).append(sap)
    for name, saps in by_name.items():
        if len(saps) > 1:
            saps.sort(key=lambda s: (sum(history[s]), products[s].get("stockOnHandTins", 0)), reverse=True)
            for dup in saps[1:]:
                del products[dup]
                del history[dup]

    catalog = sorted(products.values(), key=lambda p: (p["category"], p["name"]))
    (OUT_DIR / "kaviari_products.json").write_text(json.dumps(catalog, indent=2, ensure_ascii=False))
    hist_out = {
        "weeks": WEEKLY_SHEETS,
        "unit": "tins/week",
        "consumption": {sap: history[sap] for sap in products},
    }
    (OUT_DIR / "consumption_history.json").write_text(json.dumps(hist_out, indent=2, ensure_ascii=False))

    active_with_movement = [p for p in catalog if sum(history[p["kaviariCode"]]) > 0]
    print(f"{len(catalog)} products ({sum(1 for p in catalog if p['category'] == 'caviar')} caviar), "
          f"{len(active_with_movement)} with recent movement")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(OUT_DIR / "Import_Review_Kaviari.xlsx"))
