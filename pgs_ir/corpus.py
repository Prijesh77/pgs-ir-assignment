"""Builds the document collection from the PGS project's public seed data.

Two files from the PGS repository (copied into data/):

* nepal_geography.json  7 provinces, 77 districts and 753 local governments, each with
                        its English and Nepali name (and, for local governments, the type,
                        ward count and official website).
* domains.json          the 9,761 Nepali websites PGS crawls, each with a category
                        (NEWS, GOVERNMENT, EDUCATION, NGO, FINANCE, COMMERCIAL, OTHER) and,
                        for local-government sites, the local government it belongs to.

Every document has three fields, weighted like PGS's OpenSearch query
(title^3, description^2, text):

    title  the name (English + Nepali)            weight 3
    place  where it is: district / province names  weight 2
    body   everything else (web address, type, category, lists of places)  weight 1
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

FIELD_WEIGHTS = {"title": 3.0, "place": 2.0, "body": 1.0}

CATEGORY_LABELS = {
    "NEWS": "news media समाचार",
    "GOVERNMENT": "government office सरकार कार्यालय",
    "EDUCATION": "education school college शिक्षा",
    "NGO": "ngo non-profit organisation संस्था",
    "FINANCE": "finance bank वित्त बैंक",
    "COMMERCIAL": "business company व्यापार",
    "OTHER": "website",
}

LOCAL_BODY_TYPES = {
    "METROPOLITAN_CITY": ("Metropolitan City", "महानगरपालिका"),
    "SUB_METROPOLITAN_CITY": ("Sub-Metropolitan City", "उपमहानगरपालिका"),
    "MUNICIPALITY": ("Municipality", "नगरपालिका"),
    "RURAL_MUNICIPALITY": ("Rural Municipality", "गाउँपालिका"),
}

# Words that often appear joined together in Nepali web addresses. With the place names
# they form the vocabulary the segmenter uses to split addresses into words.
WEB_WORDS = """news khabar online nepal nepali nepalese times post daily dainik radio media
today sandesh samachar patrika express live update bank school college campus university
academy foundation society sangh palika gaupalika nagarpalika sanchar network info portal
group hospital health insurance finance capital microfinance cooperative sahakari bikas
development education digital youth mahila kisan krishi awaj aawaj awaaz voice ekta sewa
seva janata jana rastriya rastra sathi saathi aaja bichar khoj weekly saptahik monthly report
television film music sports khel artha arthik economy economic business market bazar bazaar
rajniti kanoon law himal himalaya himalayan sagar sagarmatha mountain everest pradesh
mahanagar city valley tourism travel trek hotel tech technology science institute
international national global world star new nari prabhat sanjal khabarpatra mail page
desk hub center centre service services trust council federation association club""".split()


@dataclass
class Document:
    doc_id: str
    kind: str  # province | district | local_government | website
    title: str
    url: str
    category: str
    fields: dict[str, str]
    province: str | None = None  # province code, e.g. P4
    district: str | None = None  # district code, e.g. D38
    local_body: str | None = None  # local body code, e.g. MUN414
    extra: dict[str, str] = field(default_factory=dict)


@dataclass
class Geography:
    provinces: dict[str, dict]
    districts: dict[str, dict]
    local_bodies: dict[str, dict]

    def place_names(self) -> list[tuple[str, str, str]]:
        """(kind, code, english name) for every place, used for the place dictionary."""
        out = [("province", c, p["name_en"]) for c, p in self.provinces.items()]
        out += [("district", c, d["name_en"]) for c, d in self.districts.items()]
        out += [("local_body", c, l["name_en"]) for c, l in self.local_bodies.items()]
        return out


def load_geography(data_dir: Path = DATA_DIR) -> Geography:
    with (data_dir / "nepal_geography.json").open(encoding="utf-8") as f:
        raw = json.load(f)
    return Geography(
        provinces={p["code"]: p for p in raw["provinces"]},
        districts={d["code"]: d for d in raw["districts"]},
        local_bodies={l["code"]: l for l in raw["local_bodies"]},
    )


def load_domains(data_dir: Path = DATA_DIR) -> list[dict]:
    with (data_dir / "domains.json").open(encoding="utf-8") as f:
        return json.load(f)["domains"]


def _domain_words(domain: str) -> str:
    """'news.pokharamun.gov.np' -> 'news pokharamun gov np' (the segmenter splits further)."""
    return domain.replace(".", " ").replace("-", " ")


def _place_text(geo: Geography, district_code: str | None, province_code: str | None) -> str:
    parts = []
    if district_code:
        d = geo.districts[district_code]
        parts += [d["name_en"], "district", d["name_ne"], "जिल्ला"]
        province_code = province_code or d["province_code"]
    if province_code:
        p = geo.provinces[province_code]
        parts += [p["name_en"], "province", p["name_ne"], "प्रदेश"]
    return " ".join(parts)


def build_documents(geo: Geography, domains: list[dict], geotagger=None) -> list[Document]:
    """All documents: 7 provinces, 77 districts, 753 local governments, and the websites.

    A local government's website is merged into its local-government document (so each
    municipality is one result, like a knowledge-panel entry), the other websites are
    their own documents. `geotagger(domain) -> (district, province, local_body)` tags
    websites whose address names a place, like PGS's ETL geo-tagging.
    """
    docs: list[Document] = []

    bodies_by_district: dict[str, list[dict]] = {}
    for body in geo.local_bodies.values():
        bodies_by_district.setdefault(body["district_code"], []).append(body)
    districts_by_province: dict[str, list[dict]] = {}
    for dist in geo.districts.values():
        districts_by_province.setdefault(dist["province_code"], []).append(dist)

    for code, p in geo.provinces.items():
        dists = districts_by_province.get(code, [])
        docs.append(Document(
            doc_id=code, kind="province", url="", category="PLACE",
            title=f"{p['name_en']} Province",
            fields={
                "title": f"{p['name_en']} Province {p['name_ne']} प्रदेश",
                "place": "",
                "body": f"province of Nepal with {len(dists)} districts: "
                        + " ".join(f"{d['name_en']} {d['name_ne']}" for d in dists),
            },
            province=code,
        ))

    for code, d in geo.districts.items():
        bodies = bodies_by_district.get(code, [])
        docs.append(Document(
            doc_id=code, kind="district", url="", category="PLACE",
            title=f"{d['name_en']} District",
            fields={
                "title": f"{d['name_en']} District {d['name_ne']} जिल्ला",
                "place": _place_text(geo, None, d["province_code"]),
                "body": f"district with {len(bodies)} local levels: "
                        + " ".join(f"{b['name_en']} {b['name_ne']}" for b in bodies),
            },
            district=code, province=d["province_code"],
        ))

    domains_by_body: dict[str, list[str]] = {}
    for row in domains:
        if row.get("local_body_code"):
            domains_by_body.setdefault(row["local_body_code"], []).append(row["domain"])

    for code, b in geo.local_bodies.items():
        type_en, type_ne = LOCAL_BODY_TYPES[b["type"]]
        dist = geo.districts[b["district_code"]]
        sites = domains_by_body.get(code, [])
        url = b.get("website") or (f"https://{sites[0]}" if sites else "")
        docs.append(Document(
            doc_id=code, kind="local_government", url=url, category="GOVERNMENT",
            title=f"{b['name_en']} {type_en}",
            fields={
                "title": f"{b['name_en']} {type_en} {b['name_ne']} {type_ne}",
                "place": _place_text(geo, b["district_code"], None),
                "body": " ".join(
                    ["local government local level स्थानीय तह", CATEGORY_LABELS["GOVERNMENT"],
                     f"{b.get('wards', '')} wards वडा"]
                    + [_domain_words(s) for s in sites]
                ),
            },
            local_body=code, district=b["district_code"], province=dist["province_code"],
            extra={"type": b["type"], "wards": str(b.get("wards", ""))},
        ))

    for row in domains:
        if row.get("local_body_code"):
            continue  # already part of its local-government document
        domain = row["domain"]
        category = row["category"]
        district = province = local_body = None
        place = ""
        if geotagger is not None:
            district, province, local_body = geotagger(domain)
            if local_body:
                b = geo.local_bodies[local_body]
                place = f"{b['name_en']} {b['name_ne']} "
            if district or province:
                place += _place_text(geo, district, province)
        docs.append(Document(
            doc_id=domain, kind="website", url=f"https://{domain}", category=category,
            title=row.get("website_name") or domain,
            fields={
                "title": f"{row.get('website_name') or ''} {_domain_words(domain)}".strip(),
                "place": place.strip(),
                "body": f"{category.lower()} website {CATEGORY_LABELS.get(category, '')}",
            },
            district=district, province=province, local_body=local_body,
        ))

    return docs
