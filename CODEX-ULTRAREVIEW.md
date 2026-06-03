# CODEX ULTRAREVIEW - liveable.melbourne / Buyer Check

Date: 2026-06-03  
Scope: read-only code, content, data, and UX audit of the current repo.  
Constraint observed: no source files modified. Only this report file was created/edited.

## Status - addressed in follow-up commits (2026-06-03)

 DONE:
- P0 report summary count -> priority: added `report.priorityChecks` + a "Before
  you offer, check these first" ranked block; headline reframed to task language.
- P1 a11y contrast: `--accent` -> #AD4F2E, `--focus` -> #9C4221 (clears WCAG AA).
- P1 sub-path share links: new `shareHref()` prepends the base path (map + compare).
- P1 heritage "coming soon" inconsistency: split into shipped vs not-yet.
- P1 agent voice: "Your deal-breakers" -> "Client-specific checks" in agent mode.
- P3 em-dashes: 367 sentence em-dashes stripped from product copy (ASCII standard).
- Durability: data-refresh.yml now fetches heritage/POI/proxy layers before the
  rebuild (the 2026-06 auto-refresh regression that dropped those layers is fixed).

STILL OPEN (bigger / founder calls): P0 per-finding source freshness badge; P1
profile field wiring (schools/safety/walkability) + agent-mode depth decision; P1
specific proxy source labels; P2 "Known gaps" block, inline jargon definitions,
44px touch targets, ARIA (search listbox / map role), adjacency real-boundary;
P3 flatten nested cards; axe-in-CI.

## Executive Summary

The product is directionally strong: static export discipline is mostly intact, Buyer Mode is kept as a lens rather than folded into the scored composite, and the report architecture is explicitly deterministic and source-backed. The main weakness is not lack of information. It is delivery: the report gives many honest facts, but it does not yet guide a buyer quickly enough from "what did you find?" to "what should I do before I inspect or offer?"

Highest-impact information-delivery problems:

1. The report headline counts positives and checks instead of prioritising the buyer's next decision. `lib/buyer-report.ts:932-965` produces "positive signals / things to verify", while the panel puts all verify items in one list at `components/buyer/BuyerReportPanel.tsx:204-212`. This satisfies transparency, but not decision support. A buyer needs a top 3 "check these before offering" stack ordered by risk and materiality.

2. Individual finding cards do not show full source freshness. The requirement says every finding must show source + freshness + caveat. The card shows caveat and source names, but not period/fetched date/licence at `components/buyer/BuyerReportPanel.tsx:465-470`. Freshness is only available later in the Sources section at `components/buyer/BuyerReportPanel.tsx:367-389`, using `formatSourceDate` from `lib/source-manifest.ts:88-94`. That is too far away for trust-at-the-point-of-claim.

3. Always-on caveats dilute the serious checks. School zones and price-unavailable findings are always added at `lib/buyer-report.ts:888-915`, even when the profile does not signal children/schools and even though price is deliberately out of scope. They should move to a "known gaps" block unless relevant to the selected profile.

4. Personalisation currently over-promises. The form captures intent, household, schools, safety, transport, quiet, and walkability at `components/buyer/BuyerProfilePanel.tsx:28-35`, but `evaluateFit` only materially uses deal-breakers plus a few transport/quiet notes at `lib/buyer-fit.ts:110-174`. The agent variant changes labels but remains thin, and the report still says "Your deal-breakers" in agent mode at `components/buyer/BuyerReportPanel.tsx:166-199`.

5. Some proxy/geography phrasing remains easy to overread as parcel-level. Noise and nuisance caveats are good, but source labels are generic OSM amenities rather than the specific proxy datasets at `lib/buyer-report.ts:563-565` and `lib/buyer-report.ts:592-594`. The adjacency nudge uses neighbouring SA2 centre-points, not actual boundaries, at `lib/buyer-report.ts:623-655`.

6. The copy has a visible "AI-slop" tell: sentence em dashes appear throughout product copy despite the project standard being ASCII. Examples include `app/buyer/page.tsx:65`, `components/buyer/BuyerReportPanel.tsx:153`, and `lib/buyer-report.ts:708`. The issue is not typography alone; it contributes to a polished-but-generic voice.

7. Trust is harmed by a concrete inconsistency: the Buyer landing page says "Zoning, heritage & planning-scheme overlays" are "coming soon" at `app/buyer/page.tsx:15-21`, while heritage overlay findings are already implemented at `lib/buyer-report.ts:838-860`.

8. The journey fixes requested by the Pixel user are mostly real: Escape clears selection, click-again deselects, Layers auto-collapse on selection, compare has a council dropdown, and the mobile area card has Close. The remaining journey-level bug is copied compare links missing the GitHub Pages sub-path because `buildCompareUrl` returns `/compare` and `ShareViewButton` prepends only the origin.

## Method And Standards

Review model:

- gotalab/uxaudit dimensions: information architecture, interaction flow, visual design, accessibility, content quality.
- impeccable.style/slop checklist: AI-ish visual tropes, generic SaaS cards, over-rounded UI, glow/glass, vague contrast copy, numbered section markers, icon-above-heading cards, palette monotony, and copy tells.
- Usability claims are grounded in Nielsen Norman Group / Nielsen heuristics: visibility of system status, match between system and real world, user control and freedom, recognition rather than recall, error prevention, and aesthetic/minimalist design.
- Plain-language and task-fit claims are grounded in Krug's "do not make me think" principle and ISO 9241-110 principles: suitability for the task, self-descriptiveness, controllability, conformity with expectations, and error tolerance.
- Accessibility claims are grounded in WCAG 2.2 AA, especially 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast, 2.4.7 Focus Visible, 2.5.8 Target Size (Minimum), and 4.1.2 Name, Role, Value.
- Comparison and mobile-touch claims are also informed by Baymard guidance on structured comparison, visible missing data, and forgiving touch interactions.

I did not browse the live site. I reviewed the repo code, copy, tests, and generated source metadata only.

## Verification Log

Commands run:

- `node node_modules/typescript/bin/tsc --noEmit` - passed.
- `npx eslint .` - passed.
- `npx vitest run` - blocked before test discovery by the known OneDrive/esbuild spawn issue:
  - `failed to load config from ...\vitest.config.ts`
  - `Error: spawn EPERM`
- `npx vitest run --configLoader runner` - also blocked before test discovery by Vite/esbuild:
  - `Error: spawn EPERM`

Interpretation: TypeScript and ESLint are clean. Vitest did not produce failing assertions; it could not start in this environment. Treat the expected ~222 green tests as unverified locally in this run.

## Prioritised Findings

| Priority | Finding | Evidence | Concrete fix | Standard / source |
|---|---|---|---|---|
| P0 | Finding cards do not show freshness at the point of claim. This breaks the hard rule that every finding must show source + freshness + caveat. | `components/buyer/BuyerReportPanel.tsx:465-470` shows caveat/geography/confidence and source names only. Full source dates appear later at `components/buyer/BuyerReportPanel.tsx:367-389`; formatter at `lib/source-manifest.ts:88-94`. | Add a compact footer per finding: `Source`, `Period`, `Updated`, `Geography`, `Confidence`, `Caveat`. Keep the Sources section as the audit trail, but do not make users cross-reference it. | Nielsen visibility of system status; ISO 9241-110 self-descriptiveness; transparency constraint. |
| P0 | The executive summary is a count, not a decision guide. | `lib/buyer-report.ts:932-965` builds "positive signals / things to verify"; panel renders one undifferentiated verify list at `components/buyer/BuyerReportPanel.tsx:204-212`. | Replace with "Before you offer, check these first" ranked by materiality: hazards, planning/heritage, safety/proxy flags, commute, school catchment if relevant. Keep positives secondary. | Krug: do not make me think; ISO suitability for the task; Nielsen visibility and prioritisation. |
| P1 | Personalisation over-promises because most profile fields do not affect fit. | Profile fields at `components/buyer/BuyerProfilePanel.tsx:28-35`; fit logic mainly uses deal-breakers plus transport/quiet at `lib/buyer-fit.ts:110-174`. | Either remove unused fields or wire them into report ordering and fit notes. Add unit tests proving each visible field changes a relevant output or is marked "saved for future". | Nielsen match with real world; ISO suitability for the task. |
| P1 | Agent mode is thin and internally inconsistent. | Mode selector at `components/buyer/BuyerProfilePanel.tsx:90-95`; report title switches at `components/buyer/BuyerReportPanel.tsx:166`, but body still says "Your deal-breakers" at `components/buyer/BuyerReportPanel.tsx:170`. `evaluateFit` only returns mode at `lib/buyer-fit.ts:176`. | Remove agent mode until it has agent-specific copy, export/share framing, and client-safe caveats, or rename it to "Prepare for a client discussion" and rewrite all first-person strings. | Nielsen consistency; ISO conformity with expectations. |
| P1 | Copied compare links are not sub-path safe for GitHub Pages. | `lib/share-url.ts:96-101` returns `/compare?...`; `components/ShareViewButton.tsx:27-29` builds `window.location.origin + getUrl()`. Used by `app/compare/page.tsx:130-135` and `components/ShortlistPanel.tsx:79-82`. | Make `buildCompareUrl` accept/use `withBase("/compare")`, or make `ShareViewButton` resolve against `window.location.href` and require callers to pass base-safe paths. Add a test with `/melbourne-liveability`. | Hard constraint: sub-path safe; Nielsen error prevention. |
| P1 | CSS accent variable fails normal-text contrast even though Tailwind accent was corrected. | `tailwind.config.ts:23-30` uses `#AD4F2E`; `app/globals.css:15-17` still sets `--accent: #d97757`. Popup links use it at `app/globals.css:136-139`. Measured `#D97757` on `#FAF9F5` at about 2.96:1. | Align CSS vars to the darker accessible palette. Use at least `#AD4F2E` for text links and a stronger focus color such as `#9C4221`. | WCAG 2.2 AA 1.4.3 Contrast; 2.4.7 Focus Visible. |
| P1 | Landing page says heritage/planning overlays are coming soon even though heritage is in the report. | "Zoning, heritage & planning-scheme overlays" marked soon at `app/buyer/page.tsx:15-21`; heritage finding implemented at `lib/buyer-report.ts:838-860`. | Split into "Included now: heritage overlay area share" and "Not yet: zoning parcel matching, permits, building approvals". | Nielsen consistency; ISO self-descriptiveness. |
| P1 | Proxy source labels are too generic. | Noise and nuisance findings reference `osm-amenities` at `lib/buyer-report.ts:563-565` and `lib/buyer-report.ts:592-594`; train station also uses `osm-amenities` at `lib/buyer-report.ts:616-618`. Manifest has OSM amenities at `data/generated/sources.json:175-181`, but no distinct proxy extract IDs. | Add source manifest IDs for OSM noise lines, nuisance points, and rail/station extracts with fetched dates and licences, or rename the source label to match the actual extract. | Transparency constraint; ISO self-descriptiveness. |
| P2 | Adjacency nudge uses SA2 centre-points as a rough boundary proxy. | `lib/buyer-report.ts:623-655` says "within roughly a 15-minute walk of the centre of..." and then asks users to check if near a boundary. | Compute distance to actual SA2 polygon boundaries, or move this to a low-confidence exploratory note with a title that says "near another area's centre-point". | Nielsen match with real world; data honesty. |
| P2 | Always-on school-zone and price-unavailable findings create low-value clutter. | School and price findings always appended at `lib/buyer-report.ts:888-915`. | Put both under "Known gaps in this free report". Elevate school checks only when the profile has family/schools relevance. | Nielsen aesthetic/minimalist design; Krug omit needless words. |
| P2 | Search results use listbox semantics without option semantics. | `components/SearchBox.tsx:131-166` uses `role="listbox"` while result rows are buttons at `components/SearchBox.tsx:171-235`. | Implement a proper combobox/listbox with `role="option"`, active descendant, and arrow-key handling, or remove `listbox` and use a plain semantic list of buttons. | WCAG 4.1.2 Name, Role, Value. |
| P2 | Map container uses `role="application"` without equivalent keyboard map controls. | `components/MelbourneMap.tsx:596-602`. | Prefer `role="region"` with an accessible name and nearby keyboard alternatives for search, selected area, and buyer pin state. Only use `application` if full keyboard map interaction is implemented. | WCAG 4.1.2; Nielsen user control and freedom. |
| P2 | Several touch targets are smaller than the product target of 44px. | Examples: profile close button at `components/buyer/BuyerProfilePanel.tsx:79-85`; compare remove button at `app/compare/page.tsx:248-254`; report action buttons at `components/buyer/BuyerReportPanel.tsx:104-145`; small pills at `app/(map)/page.tsx:590-628`. | Set `min-h-11 min-w-11` for icon buttons on touch surfaces, or provide larger row-level hit areas. | WCAG 2.5.8 Target Size (Minimum); mobile usability guidance. |
| P2 | E2E still has a canvas-visible map smoke check, which is weak under the MapLibre rAF automation caveat. | `tests/e2e/smoke.spec.ts:79-83`. DOM buyer restore checks exist at `tests/e2e/smoke.spec.ts:94-101`. | Keep the canvas check only as load smoke. Add DOM/data assertions for selected area, layer state, buyer pin restore, and report content. | Test reliability; hard instruction to verify map features through DOM/data/CI. |
| P3 | Sentence em dashes are widespread despite ASCII/no-em-dash standard. | Examples: `app/layout.tsx:24-28`, `app/buyer/page.tsx:65`, `components/buyer/BuyerReportPanel.tsx:153`, `lib/buyer-report.ts:708`, `components/ContextPanels.tsx:13`. Repository grep found hundreds of U+2014 occurrences in app/components/lib, including copy and missing-value placeholders. | Replace sentence em dashes with periods, colons, or ASCII hyphens. For missing data, use "No data" where clarity beats a glyph. | impeccable.style/slop checklist; project ASCII standard. |
| P3 | Buyer report visual hierarchy is card-heavy inside a side panel. | `FindingCard` uses rounded bordered cards at `components/buyer/BuyerReportPanel.tsx:449`; `Section` creates more rounded bordered cards at `components/buyer/BuyerReportPanel.tsx:491`; the report sits in another panel context from `app/(map)/page.tsx:693-701`. | Flatten inner sections into headings, dividers, and compact rows. Reserve cards for repeated findings only, or use one card level but not both. | impeccable.style/slop checklist; Nielsen aesthetic/minimalist design. |
| P3 | Buyer landing page leans on generic SaaS patterns. | Icon-above-heading cards at `app/buyer/page.tsx:95-121`; numbered process cards at `app/buyer/page.tsx:133-147`; "second opinion" language at `app/buyer/page.tsx:63-71`. | Replace with a small real sample report excerpt and a single call to drop a pin. Reduce feature-card marketing copy. | Krug; impeccable.style/slop checklist. |

## Information Delivery / Content / Writing

What works:

- `lib/buyer-report.ts:1-16` sets the right contract: deterministic, sourced, no AI/network/randomness, no invented data, every finding gets geography/confidence/verify metadata, and context lens does not affect the score.
- The individual finding shape is useful: `summary`, `whyItMatters`, `verifyAction`, `caveat`, `sourceRefs`, and `geography` are present at `lib/buyer-report.ts:95-124`.
- Good examples of plain-English caveats exist:
  - Noise proxy caveat: `lib/buyer-report.ts:541-567`.
  - Nuisance proxy caveat: `lib/buyer-report.ts:570-595`.
  - Heritage area-share caveat: `lib/buyer-report.ts:838-860`.
  - Safety percentile caveat: `lib/buyer-report.ts:863-886`.

What needs improvement:

- The report has the ingredients of trust, but it hides the strongest trust signal in a separate Sources section. A buyer reading a red flag should see date and geography immediately, not after scrolling.
- The headline is at the wrong altitude. "Excellent / Strong / Average / Weak" works for map scanning in `lib/colors.ts:159-170`, but a pin-level buyer report needs "material / routine / unknown" or "check before offer / check at inspection / background context".
- Several `whyItMatters` and `verifyAction` strings are genuinely useful, especially hazards and heritage. The weaker ones are generic "inspect the area" or always-on limitations. Those belong in known gaps, not the main risk list.
- The voice sometimes slides into manufactured contrast: "not agent spin", "hidden liveability", "second opinion". The founder's stated worry is delivery; the answer is less positioning copy and more buyer-task language.
- Jargon needs just-in-time framing. `SA2`, `percentile`, `overlay share`, and `straight-line distance` are used honestly, but should be explained inline the first time they appear in the report panel, not only in caveats.

Highest-value content change:

- Add a structured opening block:
  - `Check before offer`: 1-3 material items.
  - `Check at inspection`: sensory/parcel checks such as noise, sun, street feel.
  - `Known gaps`: price, school catchments, parcel planning certificate, measured noise.
  - `Positive signals`: amenities, parks, transit, health, liveability domains.

This keeps transparency while matching the buyer's decision sequence.

## UX / Usability

Journey review:

- Land -> understand in 5 seconds: partly works. The Buyer page makes the product purpose visible, but it still reads like a feature page rather than the tool itself. `app/buyer/page.tsx:63-71` should move faster to "drop a pin, see known / approximate / verify".
- Explore map -> click area -> get back to map: the Pixel user's reported issue appears fixed. Escape clears selected area at `app/(map)/page.tsx:116-129`; click-again deselects at `app/(map)/page.tsx:782-790`; mobile Close exists at `components/SelectedSummaryCard.tsx:80-85`.
- Layers confusion: the auto-collapse fix is real at `app/(map)/page.tsx:131-135`, and the layer explainer says recolouring does not change ranking at `components/LayerToggle.tsx:78-80`.
- Compare needing names: the council dropdown fix is real at `app/compare/page.tsx:272-327`.
- Drop buyer pin -> read report: the map preserves context and shows the report, but the report itself is long and not strongly prioritised.
- Personalise profile: the UI is understandable, but the form does not yet have enough functional payoff. This risks making the user feel the control is decorative.
- Compare: visible flow is stronger than before, but copied share links are not base-path safe.

Concrete UX changes:

- Keep the selected area panel and buyer report as two different modes with explicit state labels: "Area view" and "Buyer pin view".
- After a buyer pin is dropped, make the first visible content a 3-item action list, not a report title plus generic summary.
- On Compare, add "Browse by council" as the primary add affordance and keep search as secondary.
- Fix copied compare links before promoting sharing.

## Visual Craft / AI-Slop

Strengths:

- The app mostly avoids the obvious purple/cyan AI palette, gradient-orb backgrounds, and empty decorative illustration.
- The map-first structure is appropriate for the domain.
- Tailwind has an intentional warmer civic palette, and `tailwind.config.ts:23-30` documents the accessibility correction for accent.

Issues:

- The CSS variables drifted from the corrected palette. `app/globals.css:15-17` still uses the lower-contrast accent. This is both an accessibility and craft problem.
- The report uses card-in-card structure. `Section` and `FindingCard` both add rounded borders/shadows at `components/buyer/BuyerReportPanel.tsx:449` and `components/buyer/BuyerReportPanel.tsx:491`. In a dense decision report, dividers and compact rows will feel more credible than stacked cards.
- The Buyer landing page uses common AI-generated SaaS patterns: icon-above-heading cards and numbered mini-cards at `app/buyer/page.tsx:95-147`.
- Sentence em dashes are everywhere. Replace them with tighter sentence structure. This will immediately make the product voice feel more deliberate.
- There are many tiny chips and buttons. They look dense, but on mobile they risk feeling fiddly.

Keep:

- Restrained map-first layout.
- Percentile verbal labels in the selected summary card.
- Source drawer and caveat discipline.

Remove or reduce:

- Feature-card marketing on the Buyer landing page.
- Nested cards inside the report.
- Decorative shadows in utility panels.
- Repetitive "not advice / not spin" phrasing once the report itself proves the point.

## Accessibility

Confirmed issues:

- Contrast: `--accent: #d97757` on `--paper: #faf9f5` is about 2.96:1, below WCAG 2.2 AA 1.4.3 for normal text. Popup links use this variable at `app/globals.css:136-139`. Tailwind's `#AD4F2E` is acceptable at about 5.07:1 on the same background.
- Focus visible: global focus exists at `app/globals.css:52-56`, but the focus color should move away from borderline `#B65A3C` toward the darker accent for more reliable contrast.
- Touch targets: several controls are smaller than the requested 44px product target. Examples are listed in the findings table.
- ARIA semantics: `components/SearchBox.tsx:131-166` uses listbox without option semantics; `components/MelbourneMap.tsx:596-602` uses `role="application"` for a MapLibre canvas without full keyboard map controls.
- Line length/body type: most report content is compact; no obvious hero-scale text inside dense controls. Keep report body line length constrained to around 70-80ch when the panel expands.

Recommended CI:

- Add an axe pass against the static `out/` build once the local environment is clean. The current deploy workflow at `.github/workflows/deploy-pages.yml:21-32` builds but does not run `tsc`, lint, tests, or axe. The data-refresh workflow does run `npm test` at `.github/workflows/data-refresh.yml:43-44`, but deploy should block on the same basics.

## Data Quality / Honesty

Strong honesty patterns:

- `lib/noise.ts:1-10` explicitly says transport noise is a proximity proxy, not measured noise.
- `lib/nuisance.ts:1-12` explicitly says industry/waste/sewage/quarry checks are proximity proxies.
- `lib/transit.ts:1-5` says nearest station distance is straight-line, not walking.
- `components/ContextPanels.tsx:9-14` says context layers are for transparency only and never rank a place.
- `components/ContextPanels.tsx:80-99` handles social housing respectfully as supply mix, not a statement about people.
- Planning/heritage context at `components/ContextPanels.tsx:124-136` says area share is not a parcel-level planning certificate.

Where honesty should improve:

- Source manifest freshness is strong, but not surfaced per finding. Examples: VCSA period/fetched at `data/generated/sources.json:49-55`, PTV GTFS at `data/generated/sources.json:58-64`, OSM health at `data/generated/sources.json:85-90`, heritage at `data/generated/sources.json:209-214`.
- Some source IDs are too broad for the claim. OSM amenities is not a precise label for road/rail noise lines, nuisance points, or train-station extracts.
- "No significant bushfire or flood overlay mapped here" at `lib/buyer-report.ts:806-819` is caveated, but the headline could still be misread. Safer: "Low mapped overlay share in current SA2-level planning data".
- Safety findings are appropriately caveated as suburb/LGA level at `lib/buyer-report.ts:863-886`, but they should not visually sit next to parcel-sensitive findings without a clear geography badge.
- Health access at `lib/buyer-report.ts:779-791` is positive but lacks the same caveat strength as noise/transit. Add "based on mapped nearby services, not appointment availability, quality, bulk billing, or suitability".

Data recommendation:

- Treat `geography` as a first-class visible badge: `parcel`, `walk proxy`, `SA2`, `LGA`, `statewide`, `unknown`.
- Treat `confidence` as a sorting input, not just a label.
- Do not use "risk" for overlay share unless the sentence also says "mapped overlay share". `components/LayerToggle.tsx:244-255` labels bushfire/flood as risk; the legend should keep saying overlay share.

## Profiles: Buyer And Agent

Buyer profile:

- The concept is useful: buyers do not all care about the same checks, and the code correctly keeps the profile separate from the composite score.
- The panel is transparent about local-only storage and no score mutation at `components/buyer/BuyerProfilePanel.tsx:71-76`.
- The problem is weak mapping. Visible fields include household, schools, safety, transport, quiet, and walkability, but only transport, quiet, and explicit deal-breakers meaningfully affect `evaluateFit` at `lib/buyer-fit.ts:110-174`.

Concrete buyer-profile fixes:

- `schools`: promote school-zone gap and nearby school context only for families or high schools priority.
- `safety`: rank safety-context finding higher and add "walk the street at night / check local crime table" actions.
- `walkability`: rank amenities, parks, health, and transit positives higher.
- `intent`: for buy-to-live, rank hazards/planning/heritage higher; for invest, include rental-stress/tenure context only with caveats.
- `household`: families get schools/parks/health; downsizers get health/transit/steepness if available; first-home buyers get planning/maintenance/insurance checks.
- Add tests showing each field changes ordering, wording, or an explicit "not used yet" label.

Agent profile:

- Current agent mode is not worth keeping in its present form. It changes some labels but does not produce a coherent agent workflow.
- If retained, it should produce client-safe language: "For your client to verify" instead of "Your deal-breakers", and a share/export framing that avoids advice overreach.
- If not retained, remove the mode selector now. A thin agent variant dilutes trust.

Thresholds:

- The deal-breaker thresholds are plausible as screening defaults: flood/bushfire >=10%, heritage >=25%, transport below 30th percentile, plus noise/industry flags at `lib/buyer-fit.ts:68-71`.
- They should be explained as conservative screening thresholds, not objective pass/fail truths.
- Add threshold tests around exact boundaries: 9.99%, 10%, 24.99%, 25%, 29.99, 30.

## Stress / Edge Cases

What is already handled or partially handled:

- Pin outside SA2 coverage: buyer-report tests cover no SA2 at `tests/buyer-report.test.ts:269-275`; share URL bbox rejection is covered at `tests/share-url.test.ts:63-68`.
- Share URL restore: parser/builder tests cover buyer/pin state at `tests/share-url.test.ts:54-68`; Playwright has a DOM restore smoke at `tests/e2e/smoke.spec.ts:94-101`.
- Precise-walk paid path: the UI is env-gated at `app/(map)/page.tsx:652-691`. This is consistent with static/free constraints when no key is configured.
- Buyer Mode is not folded into the composite: `components/MobileSheet.tsx:23-26` hides weighting tabs in Buyer Mode, and `lib/home-buyer.ts:4-21` frames the buyer lens separately.
- Static export/sub-path is mostly designed in: `next.config.ts:5-10` sets `output: "export"` and optional base path; `lib/asset-path.ts:12-17` provides `withBase`.

Gaps to add:

- Null crime/hazard: add tests for an SA2 with null crime and null hazard values, not just outside coverage.
- Empty profile vs all-deal-breakers-on: test the no-profile output, then all deal-breakers true with mixed hazard/heritage/noise/industry inputs.
- Dense vs zero-population areas: verify population/density text avoids divide-by-zero weirdness and does not over-describe non-residential areas.
- Compare copied URL under base path: add a unit test or DOM test for `/melbourne-liveability/compare?...`.
- Map automation: keep canvas smoke only as load proof. Verify selection, layer collapse, buyer pin, and report content through DOM/data, not screenshots.
- CI: deploy workflow should run `tsc`, lint, tests, and axe against static output before publishing.

## REMOVE / ADD / CHANGE

REMOVE:

- Remove the always-on price-unavailable card from the main "Things to verify" list. Put it in "Known gaps".
- Remove the always-on school-zone check unless profile or context makes it relevant. Keep it in known gaps by default.
- Remove or hide agent mode until it has a distinct, coherent workflow.
- Remove the Buyer landing claim that heritage/planning overlays are all "coming soon".
- Remove sentence em dashes from product copy and generated report strings. Replace with periods, colons, or ASCII hyphens.
- Reduce nested report cards and shadows.
- Remove "hidden" from marketing copy unless the claim is specifically backed by "public data that buyers rarely see in listing pages".

ADD:

- Add per-finding source freshness: period, fetched/updated date, source label, licence, geography, confidence.
- Add a top "Before you offer" action list.
- Add a "Known gaps" block separate from risk findings.
- Add inline definitions for SA2, percentile, overlay share, and straight-line distance.
- Add explicit source IDs for noise lines, nuisance points, and station extracts.
- Add axe CI against `out/`.
- Add tests for profile field mappings and threshold boundaries.
- Add a base-path test for copied compare links.

CHANGE:

- Change report summary from count-based to priority-based.
- Change "No significant bushfire or flood overlay mapped here" to "Low mapped overlay share in current planning data for this area".
- Change health-service positive copy to include access caveats.
- Change adjacency nudge to real boundary distance, or label it as centre-point proximity.
- Change `buildCompareUrl` / `ShareViewButton` so copied links include `/melbourne-liveability`.
- Change CSS variables to the same accessible palette as Tailwind.
- Change Buyer page feature cards into a compact sample report excerpt.

## Before / After Rewrites

### Rewrite 1 - Report opening summary

Before, current pattern (`lib/buyer-report.ts:932-965`):

> `{Area}: {n} positive signals, {n} things to verify.`  
> The detail, sources and caveats are below - use the checklist before inspecting, bidding or signing.

After:

> Check these first before you inspect or offer: flood and bushfire overlay share, any heritage/planning constraint, and the real peak-hour trip. Positives in the current open data: daily amenities, parks, and public transport are close. This is a screening report: every item below says what data was used, how fresh it is, what geography it applies to, and what to verify yourself.

Why: moves from counting to task order. Supports Nielsen visibility of status and ISO suitability for the task.

### Rewrite 2 - Sun/aspect finding

Before, current pattern (`lib/buyer-report.ts:697-718`, especially `lib/buyer-report.ts:708`):

> Sun and orientation can change comfort, winter warmth, garden usability and resale appeal; check north-facing living areas, overshadowing, balcony depth, tree cover and western summer exposure...

After:

> Sun/aspect: this report cannot see the dwelling orientation. At inspection, check whether the main living area gets northern light, whether neighbouring buildings or trees overshadow it, and whether west-facing rooms need summer shading.

Why: shorter, plain-English, and explicit about what the report cannot know.

### Rewrite 3 - Buyer landing hero

Before, current pattern (`app/buyer/page.tsx:63-71`):

> Found a place you might buy? Drop a pin and get a sourced screening report for the exact location...

After:

> Checking a specific address? Drop a pin to see what is known, what is approximate, and what you should verify before an inspection or offer.

Why: less marketing, more decision framing. It names the three trust states: known, approximate, verify.

### Rewrite 4 - Agent fit block

Before, current pattern (`components/buyer/BuyerReportPanel.tsx:166-199`):

> For your client  
> Your deal-breakers to verify here:

After:

> For your client  
> Client-specific checks to verify:

Then each item should say "Ask the client..." or "Check before advising..." only where the product can safely support that language.

Why: fixes voice mismatch and avoids implying the agent's preferences are the client's.

## Appendix: Evidence Index

Core report and content:

- `lib/buyer-report.ts:1-16` - deterministic, sourced report contract.
- `lib/buyer-report.ts:95-124` - report/finding schema.
- `lib/buyer-report.ts:147-154` - distance/disclaimer caveats.
- `lib/buyer-report.ts:496-537` - amenity/park findings.
- `lib/buyer-report.ts:541-595` - noise and nuisance proxy findings.
- `lib/buyer-report.ts:599-619` - nearest train station finding.
- `lib/buyer-report.ts:623-655` - adjacency nudge.
- `lib/buyer-report.ts:661-692` - major project finding.
- `lib/buyer-report.ts:697-718` - sun/aspect copy.
- `lib/buyer-report.ts:721-791` - liveability/transport/health findings.
- `lib/buyer-report.ts:794-860` - hazard and heritage findings.
- `lib/buyer-report.ts:863-915` - safety, schools, price unavailable.
- `lib/buyer-report.ts:932-965` - summary generation.

Buyer report UI:

- `components/buyer/BuyerReportPanel.tsx:71-79` - panel header.
- `components/buyer/BuyerReportPanel.tsx:151-156` - not-advice banner.
- `components/buyer/BuyerReportPanel.tsx:165-201` - profile fit block.
- `components/buyer/BuyerReportPanel.tsx:204-224` - verify/positive sections.
- `components/buyer/BuyerReportPanel.tsx:296-352` - snapshot and census context.
- `components/buyer/BuyerReportPanel.tsx:367-399` - sources and confidence.
- `components/buyer/BuyerReportPanel.tsx:429-477` - finding card rendering.

Journey and map:

- `app/(map)/page.tsx:116-135` - Escape deselect and layer auto-collapse.
- `app/(map)/page.tsx:476-487` - buyer share URL uses `withBase`.
- `app/(map)/page.tsx:541-586` - buyer pin prompt and personalisation.
- `app/(map)/page.tsx:652-691` - precise-walk env gate.
- `app/(map)/page.tsx:782-813` - click-again deselect and buyer toggle.
- `components/SelectedSummaryCard.tsx:80-85` - mobile Close affordance.
- `components/LayerToggle.tsx:78-80` - layer explainer.
- `app/compare/page.tsx:272-327` - council dropdown.

Profiles:

- `components/buyer/BuyerProfilePanel.tsx:28-35` - visible profile dimensions.
- `components/buyer/BuyerProfilePanel.tsx:71-76` - profile caveat.
- `components/buyer/BuyerProfilePanel.tsx:90-166` - mode, priorities, deal-breakers.
- `lib/buyer-fit.ts:68-71` - screening thresholds.
- `lib/buyer-fit.ts:110-174` - fit logic.

Static/base path and share:

- `next.config.ts:5-10` - static export and base path.
- `lib/asset-path.ts:12-17` - `withBase`.
- `lib/share-url.ts:72-101` - map and compare URL builders.
- `components/ShareViewButton.tsx:27-29` - copied URL construction.
- `components/ShortlistPanel.tsx:79-82` - compare share usage.

Accessibility and visual:

- `app/globals.css:15-17` - CSS color variables.
- `app/globals.css:52-56` - focus visible styles.
- `app/globals.css:136-139` - popup link accent.
- `tailwind.config.ts:23-30` - corrected accent palette.
- `components/SearchBox.tsx:131-166` - listbox semantics.
- `components/MelbourneMap.tsx:596-602` - map role.
- `app/buyer/page.tsx:95-147` - feature and numbered cards.

Sources and data:

- `data/generated/sources.json:49-55` - crime source freshness.
- `data/generated/sources.json:58-64` - PTV GTFS freshness.
- `data/generated/sources.json:85-90` - OSM health freshness.
- `data/generated/sources.json:121-136` - planning/bushfire/flood freshness.
- `data/generated/sources.json:166-181` - census and OSM amenities freshness.
- `data/generated/sources.json:209-214` - heritage freshness.
- `components/ContextPanels.tsx:9-14` - context transparency.
- `components/ContextPanels.tsx:80-136` - social housing, housing stress, planning caveats.
- `lib/noise.ts:1-23` - noise proxy caveat and thresholds.
- `lib/nuisance.ts:1-29` - nuisance proxy caveat and thresholds.
- `lib/transit.ts:1-33` - station distance caveat.

