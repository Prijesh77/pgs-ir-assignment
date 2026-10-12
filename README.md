# PGS Mini Search: a basic information retrieval system for Nepal's public web

A small, self-contained version of the search pipeline in the
[PGS Search Engine](https://github.com/tekraj/pgs-search-engine) project. It searches
Nepal's places and websites in **English and Nepali**, using the project's own public
seed data. It is written in plain Python, with no libraries needed to run it.

```text
                 ┌──────────────────── indexing (once) ─────────────────────┐
 data/*.json ──► documents ──► preprocessing ──► inverted index ──► index/pgs_index.json
 (PGS seed data)  (9,842)      normalise, tokenise,   term -> {doc: [tf per field]}
                               segment, stop words,
                               stem (EN Porter / NE)
                 └──────────────────────────────────────────────────────────┘
 query ──► validate ──► filters ──► same preprocessing ──► expansion ──► model ──► top-k
           1..512 chars  district:   (language: en/ne)     EN<->NE places  Boolean
                         province:                          word list       TF-IDF (cosine)
                         category:                          spelling fix    BM25F
                                                                            Hybrid (RRF)
```

## Report

[report/Week6-IR-Report-Simple.docx](report/Week6-IR-Report-Simple.docx) (8 pages) and the detailed
[report/PGS-IR-Report.docx](report/PGS-IR-Report.docx) (24 pages): design, implementation, screenshots
and evaluation. Figures are made by `python report/make_figures.py`, the document by
`node report/build_simple_report.js` / `node report/build_report.js` (needs `npm install docx` in `report/build/`).

## Dataset

| Documents | Count | Fields |
| --- | ---: | --- |
| Provinces | 7 | name (EN + NE), list of districts |
| Districts | 77 | name, province, list of local governments |
| Local governments | 753 | name, type (metropolitan / municipality / rural municipality), district, province, wards, official website |
| Websites | 9,005 | web address, category (news, government, education, NGO, finance, commercial, other), place when the address names one |
| **Total** | **9,842** | |

Sources: see [data/ATTRIBUTION.md](data/ATTRIBUTION.md).

## Run it

Python 3.10 or newer.

```bash
python -m pgs_ir build                         # build the index (under a second)
python -m pgs_ir search "pokhara news"         # BM25F, top 10
python -m pgs_ir search "कास्कीको स्थानीय तह"     # Nepali query
python -m pgs_ir search "pokhra"               # typo -> corrected to pokhara
python -m pgs_ir search "news district:kaski" -m hybrid
python -m pgs_ir search "pokhara OR chitwan NOT district" -m boolean
python -m pgs_ir interactive                   # type queries one after another
python -m pgs_ir evaluate                      # all models on 461 test queries -> results/
python -m pytest -q                            # unit tests
```

Models: `boolean`, `tfidf`, `bm25` (default), `hybrid`. Add `--no-expand` to turn off
query expansion.

## Code

| File | What it does |
| --- | --- |
| [pgs_ir/corpus.py](pgs_ir/corpus.py) | turns the seed data into documents with title / place / body fields |
| [pgs_ir/preprocess.py](pgs_ir/preprocess.py) | normalisation, tokenising, word segmentation, stop words, stemming |
| [pgs_ir/porter.py](pgs_ir/porter.py) | the Porter stemmer |
| [pgs_ir/index.py](pgs_ir/index.py) | inverted index with per-field counts; geo-tagging; fuzzy term lookup |
| [pgs_ir/query.py](pgs_ir/query.py) | query validation, filters, Boolean operators, expansion |
| [pgs_ir/models.py](pgs_ir/models.py) | Boolean, TF-IDF cosine, BM25F, Reciprocal Rank Fusion |
| [pgs_ir/engine.py](pgs_ir/engine.py) | ties it together: query -> model -> filters -> results |
| [pgs_ir/evaluate.py](pgs_ir/evaluate.py) | test queries with known answers; P@10, R@10, MAP, MRR, nDCG@10 |
| [tests/](tests/) | unit tests |

## Results (461 test queries)

| Run | P@10 | R@10 | MAP | MRR | nDCG@10 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Boolean (AND) | 0.341 | 0.742 | 0.623 | 0.616 | 0.659 |
| TF-IDF | 0.293 | 0.723 | 0.652 | 0.637 | 0.669 |
| BM25F | 0.296 | 0.729 | 0.643 | 0.583 | 0.657 |
| TF-IDF + expansion | 0.299 | 0.861 | 0.789 | 0.763 | 0.804 |
| BM25F + expansion | 0.313 | **0.876** | 0.803 | 0.738 | 0.814 |
| Hybrid RRF + expansion | 0.296 | 0.858 | **0.811** | **0.816** | **0.824** |

Per query group, and the ablation without word segmentation:
[results/evaluation.md](results/evaluation.md).

## How it relates to PGS

| Step | PGS Search Engine | This project |
| --- | --- | --- |
| Store / index | OpenSearch (Lucene inverted index) + pgvector | own inverted index in Python, saved as JSON |
| Preprocessing | NFC, lowercase, language detection, NLTK Porter, Nepali HMM lemmatiser | NFC, lowercase, language detection, own Porter, Nepali postposition stripping |
| Ranking | BM25, fields `title^3 description^2 keywords^2 text` | BM25F, fields `title x3 place x2 body x1` |
| Second retriever | LaBSE sentence vectors (dense) | TF-IDF cosine |
| Fusion | Reciprocal Rank Fusion, k = 60 | Reciprocal Rank Fusion, k = 60 |
| Query expansion | EN<->NE place names, NLLB-200 translation, fuzziness | EN<->NE place names, word list, trigram spelling correction |
| Filters | province / district / local body / category | province / district / category / kind |
