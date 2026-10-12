"""The search engine: query processing -> retrieval model -> filters -> top-k results."""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from pgs_ir.corpus import DATA_DIR, Document, load_geography
from pgs_ir.index import INDEX_FILE, InvertedIndex, make_segmenter
from pgs_ir.models import BM25FModel, TfIdfModel, boolean_search, reciprocal_rank_fusion
from pgs_ir.query import ProcessedQuery, QueryProcessor

MODELS = ("boolean", "tfidf", "bm25", "hybrid")


@dataclass
class Result:
    rank: int
    score: float
    doc: Document


@dataclass
class SearchResponse:
    query: ProcessedQuery
    model: str
    total_hits: int
    results: list[Result]
    took_ms: float


class SearchEngine:
    def __init__(self, index: InvertedIndex, *, use_segmentation: bool = True,
                 data_dir: Path = DATA_DIR):
        self.index = index
        self.geo = load_geography(data_dir)
        self.segmenter = make_segmenter(self.geo) if use_segmentation else None
        self.query_processor = QueryProcessor(index, self.geo, self.segmenter)
        self.tfidf = TfIdfModel(index)
        self.bm25 = BM25FModel(index)

    @classmethod
    def from_disk(cls, path: Path = INDEX_FILE) -> "SearchEngine":
        return cls(InvertedIndex.load(path))

    def _passes(self, doc: Document, filters: dict[str, str]) -> bool:
        if "district" in filters and doc.district != filters["district"]:
            return False
        if "province" in filters and doc.province != filters["province"]:
            return False
        if "category" in filters and doc.category != filters["category"]:
            return False
        if "kind" in filters and doc.kind != filters["kind"]:
            return False
        return True

    def rank(self, query: ProcessedQuery, model: str) -> list[tuple[int, float]]:
        if model == "boolean":
            # Boolean uses only the query's own words (no weights, no expansion).
            ranked = boolean_search(self.index, query.terms, query.operator, query.exclude)
        elif model == "tfidf":
            ranked = self.tfidf.search(query.weights)
        elif model == "bm25":
            ranked = self.bm25.search(query.weights)
        elif model == "hybrid":
            # Filter each list before fusing, so filtered-out documents don't use up
            # the fusion depth.
            return reciprocal_rank_fusion(self._filter(self.bm25.search(query.weights), query),
                                          self._filter(self.tfidf.search(query.weights), query))
        else:
            raise ValueError(f"unknown model {model!r}; choose from {', '.join(MODELS)}")
        return self._filter(ranked, query)

    def _filter(self, ranked: list[tuple[int, float]], query: ProcessedQuery):
        if not query.filters:
            return ranked
        return [(d, s) for d, s in ranked if self._passes(self.index.docs[d], query.filters)]

    def search(self, text: str, *, model: str = "bm25", k: int = 10,
               expand: bool = True) -> SearchResponse:
        started = time.perf_counter()
        query = self.query_processor.process(text, expand=expand)
        ranked = self.rank(query, model)
        results = [Result(rank=i + 1, score=s, doc=self.index.docs[d])
                   for i, (d, s) in enumerate(ranked[:k])]
        took = (time.perf_counter() - started) * 1000
        return SearchResponse(query=query, model=model, total_hits=len(ranked),
                              results=results, took_ms=took)
