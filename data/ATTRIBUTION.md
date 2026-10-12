# Data sources

Both files are copied unchanged from the PGS Search Engine project
(`database/data/` in tekraj/pgs-search-engine), where they are the seed data for its database.

| File | Contents | Original source |
| --- | --- | --- |
| `nepal_geography.json` | 7 provinces, 77 districts, 753 local governments (English + Nepali names, type, wards, official website) | [sagautam5/local-states-nepal](https://github.com/sagautam5/local-states-nepal) |
| `domains.json` | 9,761 Nepali websites with a category, the crawl list of PGS | PGS's crawler seed list plus the local-government websites above (`database/scripts/build_domains.py`) |
