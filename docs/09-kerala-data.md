# Kerala Location Data

Sahaya launches in Kerala only. Location is a two-level cascade — **district → town** — plus an
optional free-text landmark.

## Why this shape

A full Indian gazetteer (village-level, ~1,000+ entries for Kerala) is not needed to launch and
would make the filter unusable. Two levels give a hirer a usable search ("cooks in Kakkanad")
while `landmark` lets a helper add "near Infopark" without us maintaining that data.

Both levels carry Malayalam names, because the audience reads Malayalam and place names are
frequently written in it.

## The 14 districts

| # | Slug | English | Malayalam |
|---|---|---|---|
| 1 | `thiruvananthapuram` | Thiruvananthapuram | തിരുവനന്തപുരം |
| 2 | `kollam` | Kollam | കൊല്ലം |
| 3 | `pathanamthitta` | Pathanamthitta | പത്തനംതിട്ട |
| 4 | `alappuzha` | Alappuzha | ആലപ്പുഴ |
| 5 | `kottayam` | Kottayam | കോട്ടയം |
| 6 | `idukki` | Idukki | ഇടുക്കി |
| 7 | `ernakulam` | Ernakulam | എറണാകുളം |
| 8 | `thrissur` | Thrissur | തൃശ്ശൂർ |
| 9 | `palakkad` | Palakkad | പാലക്കാട് |
| 10 | `malappuram` | Malappuram | മലപ്പുറം |
| 11 | `kozhikode` | Kozhikode | കോഴിക്കോട് |
| 12 | `wayanad` | Wayanad | വയനാട് |
| 13 | `kannur` | Kannur | കണ്ണൂർ |
| 14 | `kasaragod` | Kasaragod | കാസർഗോഡ് |

## Towns

Seeded in `backend/app/db/seeds/kerala.py`. Each district gets its principal town plus the
municipalities and suburbs where domestic hiring actually concentrates. `is_major` marks the
handful shown before "Show all" in the filter.

Density is deliberately uneven and follows demand, not administrative tidiness: Ernakulam,
Thiruvananthapuram and Kozhikode carry the most entries because that is where the hiring is.

Examples of the intended granularity:

- **Ernakulam** — Kochi, Ernakulam Town, Kakkanad, Edappally, Aluva, Perumbavoor, Thrippunithura,
  Kalamassery, Fort Kochi, Vyttila, Angamaly, Muvattupuzha, Kothamangalam, Paravur, Piravom
- **Thiruvananthapuram** — Thiruvananthapuram City, Kazhakoottam, Technopark, Neyyattinkara,
  Attingal, Varkala, Nedumangad, Kovalam, Balaramapuram, Vattiyoorkavu
- **Kozhikode** — Kozhikode City, Vadakara, Koyilandy, Feroke, Ramanattukara, Mukkam, Beypore
- **Wayanad** — Kalpetta, Sulthan Bathery, Mananthavady, Meppadi, Panamaram

## API

```
GET /api/v1/geo/districts              → all 14, with Malayalam names
GET /api/v1/geo/towns?district=<slug>  → towns in that district
```

Both are public, cacheable, and consumed identically by web, Android and iOS. Adding a town is a
seed change that appears everywhere with no app release.

## Filtering

Browse accepts `district` and `town` slugs. District alone returns everything in the district;
adding a town narrows it. `landmark` is display-only — it is shown on the profile, never filtered
on, because free text makes a poor filter.

## When Sahaya leaves Kerala

`districts` is not Kerala-specific in shape — it is a flat region table with a slug. Expanding
means adding a `states` table above it and a `state_id` on `districts`. Nothing else in the
schema assumes Kerala.
