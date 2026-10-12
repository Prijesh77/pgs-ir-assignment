"""Query processing: raw query text -> weighted index terms + filters.

    "pokara news district:kaski"
      1. validate     1..512 characters (PGS uses the same limit)
      2. filters      district:kaski / province:gandaki / category:news / kind:website
                      Boolean operators: AND (default), OR, NOT word  (capital letters)
      3. language     en / ne / mixed (from the scripts used)
      4. analyse      the same pipeline as the documents (preprocess.analyse)
      5. expand       a) English <-> Nepali place names  (Pokhara <-> पोखरा)
                      b) English <-> Nepali common words (news <-> समाचार, khabar -> news)
                      c) fuzzy: misspelt words -> close vocabulary words (pokara -> pokhara);
                         done first, so a corrected name is translated too
      6. weights      original terms 1.0, translations 0.7, spelling corrections 0.9

PGS expands queries the same way (search-engine/src/pgs_search/query/): Porter stems,
an EN<->NE place-name map, NLLB machine translation, and OpenSearch's fuzziness.
Here a small bilingual word list stands in for the translation model.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from pgs_ir.corpus import Geography
from pgs_ir.index import InvertedIndex
from pgs_ir.preprocess import Segmenter, analyse, detect_language, tokenise

MAX_QUERY_CHARS = 512
TRANSLATION_WEIGHT = 0.7
FUZZY_WEIGHT = 0.9

# A small English <-> Nepali glossary (and romanised Nepali -> English) for the words
# people search with. Each pair is expanded in both directions.
GLOSSARY = [
    ("news", "समाचार"), ("khabar", "news"), ("samachar", "news"), ("government", "सरकार"),
    ("sarkar", "government"), ("office", "कार्यालय"), ("municipality", "नगरपालिका"),
    ("nagarpalika", "municipality"), ("rural municipality", "गाउँपालिका"),
    ("gaupalika", "rural municipality"), ("metropolitan city", "महानगरपालिका"),
    ("mahanagarpalika", "metropolitan city"), ("sub-metropolitan city", "उपमहानगरपालिका"),
    ("district", "जिल्ला"), ("jilla", "district"), ("province", "प्रदेश"),
    ("pradesh", "province"), ("local government", "स्थानीय तह"), ("local level", "स्थानीय तह"),
    ("palika", "local government"), ("ward", "वडा"), ("education", "शिक्षा"),
    ("school", "education"), ("university", "education"), ("bank", "बैंक"),
    ("finance", "वित्त"), ("organisation", "संस्था"), ("organization", "organisation"),
    ("ngo", "संस्था"), ("business", "व्यापार"),
]

_FILTER = re.compile(r"\b(district|province|category|kind):(\S+)", re.IGNORECASE)
_NOT = re.compile(r"\bNOT\s+(\S+)")
_OPERATOR = re.compile(r"\b(AND|OR)\b")


class QueryError(ValueError):
    pass


@dataclass
class ProcessedQuery:
    text: str
    language: str
    terms: list[str]  # the query's own terms (after preprocessing)
    weights: dict[str, float]  # all terms to search with, including expansions
    expansions: list[tuple[str, str, str]] = field(default_factory=list)  # (from, to, why)
    filters: dict[str, str] = field(default_factory=dict)
    operator: str = "AND"  # for the Boolean model
    exclude: list[str] = field(default_factory=list)  # NOT terms, for the Boolean model


class QueryProcessor:
    def __init__(self, index: InvertedIndex, geo: Geography, segmenter: Segmenter | None):
        self.index = index
        self.geo = geo
        self.segmenter = segmenter
        self.translations = self._build_translations()
        self.place_codes = self._build_place_codes()

    def _build_translations(self) -> dict[tuple[str, ...], list[tuple[str, str]]]:
        """phrase (as raw tokens) -> [(translation, reason)], both directions."""
        table: dict[tuple[str, ...], list[tuple[str, str]]] = {}

        def add(a: str, b: str, why: str) -> None:
            table.setdefault(tuple(tokenise(a)), []).append((b, why))
            table.setdefault(tuple(tokenise(b)), []).append((a, why))

        for p in self.geo.provinces.values():
            add(p["name_en"], p["name_ne"], "place name")
        for d in self.geo.districts.values():
            add(d["name_en"], d["name_ne"], "place name")
        for b in self.geo.local_bodies.values():
            add(b["name_en"], b["name_ne"], "place name")
        for a, b in GLOSSARY:
            add(a, b, "word list")
        return table

    def _build_place_codes(self) -> dict[str, dict[str, str]]:
        """'kaski' -> D38, 'गण्डकी' -> P4, for district:/province: filters."""
        out: dict[str, dict[str, str]] = {"district": {}, "province": {}}
        for code, d in self.geo.districts.items():
            out["district"]["".join(tokenise(d["name_en"]))] = code
            out["district"][d["name_ne"]] = code
            out["district"][code.lower()] = code
        for code, p in self.geo.provinces.items():
            out["province"]["".join(tokenise(p["name_en"]))] = code
            out["province"][p["name_ne"]] = code
            out["province"][code.lower()] = code
        return out

    def _analyse(self, text: str) -> list[str]:
        return analyse(text, self.segmenter)

    def process(self, text: str, *, expand: bool = True) -> ProcessedQuery:
        if not text or not text.strip():
            raise QueryError("The query is empty.")
        if len(text) > MAX_QUERY_CHARS:
            raise QueryError(f"The query is longer than {MAX_QUERY_CHARS} characters.")

        filters: dict[str, str] = {}
        for name, value in _FILTER.findall(text):
            name = name.lower()
            key = "".join(tokenise(value))
            if name in self.place_codes:
                code = self.place_codes[name].get(key) or self.place_codes[name].get(value)
                if code is None:
                    raise QueryError(f"Unknown {name}: {value}")
                filters[name] = code
            else:
                filters[name] = value.upper() if name == "category" else value.lower()
        text = _FILTER.sub(" ", text).strip()

        # Boolean operators (only the Boolean model uses them; ranked models ignore them).
        exclude = [t for word in _NOT.findall(text) for t in self._analyse(word)]
        operator = "OR" if "OR" in _OPERATOR.findall(text) else "AND"
        text = " ".join(_OPERATOR.sub(" ", _NOT.sub(" ", text)).split())
        if not text:
            raise QueryError("The query has no search words, only filters or operators.")

        terms = self._analyse(text)
        weights: dict[str, float] = {}
        for t in terms:
            weights[t] = weights.get(t, 0.0) + 1.0
        processed = ProcessedQuery(text=text, language=detect_language(text), terms=terms,
                                   weights=weights, filters=filters, operator=operator,
                                   exclude=exclude)
        if not expand:
            return processed

        # c) fuzzy, first: a word the index has never seen is probably misspelt, so add
        # the closest vocabulary words ('pokhra' -> 'pokhara'). The corrected spelling is
        # also used for the translation step below ('pokhra' -> 'pokhara' -> 'पोखरा').
        tokens = tokenise(text)
        corrected_tokens = list(tokens)
        for i, token in enumerate(tokens):
            for t in self._analyse(token):
                if self.index.df(t) > 0:
                    continue
                for n, (similar, sim) in enumerate(self.index.similar_terms(t)):
                    if n == 0:
                        corrected_tokens[i] = similar
                    if similar not in weights:
                        weights[similar] = FUZZY_WEIGHT
                        processed.expansions.append((t, similar, f"spelling ({sim:.2f})"))

        # a) + b) translations: look for phrases of 1-3 tokens in the table.
        for token_list in (tokens, corrected_tokens):
            for size in (3, 2, 1):
                for start in range(len(token_list) - size + 1):
                    phrase = tuple(token_list[start:start + size])
                    for translation, why in self.translations.get(phrase, []):
                        for t in self._analyse(translation):
                            if t not in weights:
                                weights[t] = TRANSLATION_WEIGHT
                                processed.expansions.append((" ".join(phrase), t, why))
        return processed
