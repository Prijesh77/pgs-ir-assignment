"""Unit tests:  python -m pytest -q"""

import pytest

from pgs_ir.engine import SearchEngine
from pgs_ir.evaluate import average_precision, ndcg_at, precision_at, reciprocal_rank
from pgs_ir.index import InvertedIndex
from pgs_ir.porter import stem
from pgs_ir.preprocess import Segmenter, analyse, detect_language, nepali_stem, tokenise
from pgs_ir.query import QueryError


@pytest.fixture(scope="module")
def engine() -> SearchEngine:
    index, _ = InvertedIndex.build()
    return SearchEngine(index)


# ---- preprocessing -----------------------------------------------------------------

@pytest.mark.parametrize("word, expected", [
    ("caresses", "caress"), ("ponies", "poni"), ("running", "run"), ("hopping", "hop"),
    ("relational", "relat"), ("municipalities", "municip"), ("government", "govern"),
])
def test_porter_stemmer(word, expected):
    assert stem(word) == expected


def test_tokenise_handles_both_scripts_and_punctuation():
    assert tokenise("Pokhara-News.com, काठमाडौंको समाचार।") == [
        "pokhara", "news", "com", "काठमाडौंको", "समाचार"]


def test_devanagari_digits_become_ascii():
    assert tokenise("वडा ३३") == ["वडा", "33"]


def test_language_detection():
    assert detect_language("pokhara news") == "en"
    assert detect_language("पोखरा समाचार") == "ne"
    assert detect_language("pokhara समाचार") == "mixed"


def test_nepali_postpositions_are_stripped():
    assert nepali_stem("काठमाडौंको") == "काठमाडौं"
    assert nepali_stem("जिल्लाहरू") == "जिल्ला"
    assert nepali_stem("मा") == "मा"  # too short to strip


def test_segmenter_splits_joined_words():
    seg = Segmenter(["pokhara", "news", "online", "khabar"])
    assert seg.split("pokharanews") == ("pokhara", "news")
    assert seg.split("onlinekhabar") == ("online", "khabar")
    assert seg.split("xyzxyzxyz") == ()


def test_stopwords_removed():
    assert analyse("the news of Pokhara") == ["new", "pokhara"]


# ---- retrieval ---------------------------------------------------------------------

def test_place_name_finds_the_local_government(engine):
    top = engine.search("Pokhara Metropolitan City").results[0].doc
    assert top.doc_id == "MUN414"


def test_nepali_query_is_translated(engine):
    # "पोखरा" is expanded to "pokhara", so English-only websites match too.
    response = engine.search("पोखरा")
    assert ("पोखरा", "pokhara", "place name") in response.query.expansions
    assert any(r.doc.kind == "website" for r in response.results)


def test_misspelt_query_is_corrected(engine):
    response = engine.search("pokhra")
    assert any(to == "pokhara" for _, to, _ in response.query.expansions)
    assert response.results and "pokhara" in response.results[0].doc.title.lower()


def test_district_filter(engine):
    response = engine.search("news district:kaski", k=20)
    assert response.results
    assert all(r.doc.district == "D38" for r in response.results)


def test_boolean_operators(engine):
    both = {r.doc.doc_id for r in engine.search("pokhara news", model="boolean", k=1000).results}
    either = {r.doc.doc_id for r in engine.search("pokhara OR news", model="boolean", k=10000).results}
    assert both and both < either
    without = engine.search("pokhara NOT news", model="boolean", k=1000).results
    assert all(r.doc.doc_id not in both for r in without)


def test_every_model_returns_results(engine):
    for model in ("boolean", "tfidf", "bm25", "hybrid"):
        assert engine.search("kaski", model=model).results


def test_invalid_queries(engine):
    with pytest.raises(QueryError):
        engine.search("   ")
    with pytest.raises(QueryError):
        engine.search("x" * 513)
    with pytest.raises(QueryError):
        engine.search("news district:atlantis")


# ---- measures ----------------------------------------------------------------------

def test_measures():
    ranked = ["a", "x", "b", "y"]
    relevant = {"a", "b"}
    assert precision_at(ranked, relevant, 2) == 0.5
    assert reciprocal_rank(ranked, relevant) == 1.0
    assert average_precision(ranked, relevant) == pytest.approx((1 / 1 + 2 / 3) / 2)
    assert ndcg_at(["a", "b"], relevant, 10) == pytest.approx(1.0)
