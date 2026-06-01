# Dignity & Sensitive-Data Standard

liveable.melbourne handles data that touches people's lives — crime, social
housing, tenure, income, demographics, First Nations population, renter share,
housing stress, hazards. How we present it is a product, legal **and ethical**
responsibility. This standard is binding on all copy, findings, labels and
future features. Reviewers (human or AI) must treat a breach as a P0 bug.

## Core principle
We describe **area-level context**, never a verdict on a place or the people who
live there. The user decides; we inform and point them to what to verify.

## Hard language rules

**Never** (about a suburb / SA2 / community):
- "unsafe", "dangerous", "bad area", "rough", "sketchy", "avoid"
- "good families" / "the wrong element" / any coded class or race language
- "gentrification opportunity", "up-and-coming" as a buy signal
- framing **social housing**, **renters**, **low income**, or **First Nations
  population** as a risk, warning, or red flag
- "this will flood / will burn / will lose value" (prediction)
- "insurance risk" / cost claims unless we hold actual insurance data (we don't)

**Always** use instead:
- "recorded-offence context" (with the LGA-level + recorded≠actual caveat)
- "community and housing mix" / "tenure mix" for renter/owner/social-housing
- "area-level context" / "trade-off" / "things to verify" / "data limitations"
- "planning-overlay share of the SA2" for hazards (not "this property floods")

## Data-specific rules
- **Crime:** recorded offences only, suburb/LGA level, with reporting-bias +
  recorded≠actual caveats. Never a "safety score" that brands a community.
- **Social housing / tenure:** neutral community context, never a buyer warning.
- **First Nations population:** area context only; never a buyer signal or a
  proxy for anything. Handle with extra care; prefer omission to misuse.
- **Income / SEIFA:** explain in plain language (see below); never "rich/poor".
- **Hazards:** SA2 overlay share + "verify the parcel"; never a parcel-level claim.

## Plain language (no unexplained jargon)
Every technical term gets a one-line plain explanation or tooltip. e.g.
**SEIFA IRSAD decile** → "relative socio-economic advantage/disadvantage, ranked
1 (most disadvantaged) to 10 (most advantaged) against all of Australia — area
context, not a judgement of residents."

## Provenance discipline
Every finding shows source + data period/freshness + geographic precision +
confidence + a caveat. Missing data is shown honestly as "not available yet" —
never invented, never overclaimed (e.g. do not promise "heritage" data we don't
hold). A unit test enforces that every finding carries a source or a caveat.

## Tone
Calm, factual, second-opinion. We reduce a buyer's uncertainty and tell them
what to check with council, conveyancer, insurer and inspection — we never tell
them to buy, avoid, or that a place or its people are good or bad.
