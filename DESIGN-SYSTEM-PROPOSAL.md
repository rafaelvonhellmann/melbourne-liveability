# Festra Design System Proposal

Synthesized from 13 references (Antalik beam/metal/image/portfolio, transitions.dev,
Aave glass essay, Meng To anti-slop gist, impeccable.style, tasteskill.dev,
getdesign.md, designsystems.surf article + directory, landchecker.com.au).

Brand idea: fenestra - a window. A clean, bright opening onto the data behind a
six-figure decision. The design must deliver clarity, confidence, peace of mind.
Posture: GOV.UK for high-stakes services ("simplicity is the most scalable choice")
executed with Antalik-grade chrome craft. Professional, never playful. Light theme,
high contrast, map is the hero.

---

## 1. Principles

1. The map is the hero. Chrome floats over it; chrome never competes with it.
2. Legibility over decoration. Any translucency or effect is tuned until the
   underlying map data stays readable, or it is removed (Aave principle).
3. One signature ease, one duration scale, everywhere. Smoothness = consistency.
4. Data resolves, it does not pop. Arriving information is choreographed
   (shimmer -> blur-up reveal) so waiting reads as working, not broken.
5. Motion is for hierarchy and attention, never decoration (Fluent 2).
6. Single accent over a neutral canvas. Never two competing accents (getdesign.md).
7. Product register, not brand register: app chrome gets no editorial scaffolding,
   no kicker pills, no marketing flourishes (impeccable.style).

---

## 2. Palette

All three directions are cool/neutral: they exit the warm cream-to-coral spectrum
entirely. Landchecker owns cream #FEFCF8-#F8ECDC + coral #FF5E38 (marketing) and
dark-teal #1b272a + green-zone chrome (product). Festra's old cream + terracotta
#AD4F2E sits in Landchecker's marketing family AND is impeccable.style rule-22 slop
("cream/beige is the default tasteful AI surface"). All directions below clear both.

### Direction A - "Surveyor" (RECOMMENDED)

Cool violet-gray neutrals (Antalik beam light theme) + a daylight cobalt accent.
On-metaphor: blue is sky through a window; cartographic/blueprint lineage.

| Token              | Hex      | Role                                  | Contrast on bg |
|--------------------|----------|---------------------------------------|----------------|
| --bg               | #FDFDFD  | app/page background                   | -              |
| --ink              | #1A1A22  | primary text, icons, pins             | 17.0:1         |
| --ink-2            | #5C5C6E  | secondary text, captions              | 6.4:1          |
| --surface          | #F6F6F8  | panel/app-shell tint level 1          | -              |
| --surface-2        | #F4F4F7  | tint level 2 (alternating sections)   | -              |
| --hairline         | #E3E3EC  | borders, dividers, rings              | -              |
| --accent           | #2052CC  | CTAs, links, selected pins, focus     | 6.6:1          |
| --accent-hover     | #1A43A8  | hover/pressed accent                  | 8.6:1 (approx) |
| --accent-tint      | #EDF3FC  | selected rows, pin halo, active tab   | -              |
| --on-accent        | #FFFFFF  | text on accent fills                  | 6.7:1 on accent|

WCAG: ink 17.0:1 (AAA), secondary 6.4:1 (AA+), accent text and white-on-accent
both clear 4.5:1 AA for body text. Zero green, zero teal, zero warm orange.

### Direction B - "Deed"

Blue-gray neutrals + deep navy accent. More institutional/legal-trust; quieter
brand, maximum gravitas. Best if owner wants Festra to feel like infrastructure.

- --bg #FCFCFC, --ink #16181D (17.3:1), --ink-2 #4F5663 (7.2:1)
- --surface #F3F5F8, --hairline #E1E5EB
- --accent #1E3A8A navy (10.1:1 on bg; white on navy 10.4:1), tint #E8EEF9
- Risk: navy CTAs read conservative; hover states need the tint to feel alive.

### Direction C - "Archival mono"

designsystems.surf model: near-monochrome, identity carried by type and spacing.
- Surfaces #FFFFFF -> #F5F5F5 -> #F0F0F0 (elevation by tint, Carbon-style)
- Ink #191919 (17.6:1), secondary #5A5A5A
- CTAs are ink-filled buttons; one functional blue #2563EB for links/focus only;
  all other color lives in map data.
- Risk: brand-anonymous; hardest to own. Keep as fallback aesthetic, not identity.

### Semantic colors (all directions; data voice, not brand voice)

- Risk/blocker: #B42318 (6.6:1 on white); tint row bg #FDECEA
- Caution: #B54708 (5.4:1); tint #FCF1E6 - dark amber, NOT terracotta/coral
- Clear/pass: #067647 - semantic only, never in chrome, never as brand accent
  (keeps distance from Landchecker green)
- Info: accent family
Caveat/risk rows: tinted bg + full-strength semantic ink text. Never white text
on pastel.

### Basemap

Commission/configure a desaturated light-gray basemap so neutrals match chrome and
parcel/overlay colors carry all hue. Test the accent against VIC planning-zone
shading (several zones are blue-family) before locking #2052CC vs #1E3A8A.

---

## 3. Typography

Strategy (impeccable rules 15-16): distinctive display + refined workhorse + mono
for data. Never Inter alone as the identity.

- Display/brand: PP Neue Montreal (Pangram Pangram, affordable commercial license).
  Free alternative: General Sans (Fontshare, free commercial). Used for the
  wordmark, marketing headings, report H1/H2. Weight 500-600 only.
- UI/body: Inter variable (OFL). Weights 400/500/600. No 300, no 700+.
- Data/mono: IBM Plex Mono (OFL) 400/500 for lot/plan numbers, areas, prices,
  coordinates, counts - every number a buyer will compare.

Scale (1.25 ratio, 16px anchor; impeccable floor: ratio >= 1.25, body >= 16px):

| Step | Size/line       | Use                                  |
|------|-----------------|--------------------------------------|
| xs   | 12/16 mono      | chart labels, footnotes              |
| sm   | 13/18           | dense map chrome, popup data rows    |
| ui   | 14/20           | default control/menu text            |
| body | 16/26 (1.6)     | report prose - anxious-reader floor  |
| h4   | 20/28           | panel titles                         |
| h3   | 25/32           | report section heads                 |
| h2   | 32/40           | page heads                           |
| h1   | 40/46 display   | marketing/report hero                |

Rules: measure 65-75ch in report reading mode (single column, max 760px);
mandatory hand letter-spacing pass on every display setting (slight negative
tracking, checked by eye - default tracking is the #1 AI giveaway); body tracking
<= 0.05em; mobile bumps UI text to 15px and touch targets to 44px (Spectrum 1.25x).

---

## 4. Spacing, radii, elevation

- Spacing: 4px base grid; component padding >= 12px; panel padding 16-20px;
  map-edge gutter for floating controls 12px.
- Radii: 6px (inputs, menu items), 8px (buttons, menus), 10px (floating map
  controls), 12px (cards, popups), 16px (bottom-sheet top corners), 9999px
  (search pill, count chips). Hard cap 16px - 24px+ blob cards are slop.
- Elevation (hybrid Carbon + Atlassian): hierarchy primarily by surface tint
  alternation (#FDFDFD / #F6F6F8 / #F4F4F7); floating-over-map elements add the
  hairline-ring shadow recipe:
  `inset 0 0 0 1px rgba(26,26,34,0.08), 0 1px 3px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.05)`
  No soft blob shadows (0 4px 20px class). No colored shadows ever.
- Glass: backdrop-filter blur(12px) allowed ONLY on chrome floating over the map
  (search pill, legend, zoom cluster), always with >= 90% white fill so contrast
  holds. Solid panels everywhere else. No refraction/displacement effects.

---

## 5. Motion

Token system (five dimensions per transitions.dev: duration, easing, distance,
blur, scale; transform + opacity only; asymmetric enter/exit).

Easings:
- --ease-festra: cubic-bezier(0.22, 1, 0.36, 1) - signature; ALL entrances and movement
- --ease-sheet:  cubic-bezier(0.32, 0.72, 0, 1) - bottom sheet only (learned iOS curve)
- --ease-exit:   cubic-bezier(0.4, 0, 1, 1) at --dur-1, or instant for tooltips
- Banned: CSS built-in `ease`, any bounce/elastic/overshoot, `transition: all`

Durations (ceiling 500ms; mass at 180-300ms):
- --dur-1: 120ms  micro (hover fills, exits, fades)
- --dur-2: 180ms  menus, tooltips enter, backdrop fades
- --dur-3: 240ms  popups, pin drop, panel content, sheet snap
- --dur-4: 300ms  panel slide, sheet open, blur-up data reveal
- --dur-5: 500ms  reserved: ONE hero settle (first report reveal). Nothing else.

Choreography:
- Bottom sheet: open translateY 300ms --ease-sheet; drag tracks finger 1:1;
  release snaps 240ms; close 240ms; scrim fades 180ms. Snap points 25/60/92%.
- Pin drop: opacity + translateY(-8px -> 0) + scale(0.92 -> 1), 240ms
  --ease-festra; stagger 20ms/pin, capped at 10 pins. No bounce on landing.
- Popup: origin-aware - transform-origin at the pin anchor; scale(0.96 -> 1) +
  opacity + 4px rise, 200ms enter; exit 120ms opacity-only. Grounded to its pin.
- Panel slide (parcel info / layers): translateX(16px -> 0) + opacity +
  blur(3px -> 0), 280ms --ease-festra; report rows stagger 25ms.
- Hover/press: background alpha-ladder swap at 120ms; never scale images/cards.
- Page/route transitions: opacity + 8px translate + blur(3px -> 0), 200ms.
- Icon swaps (layer toggles, pin states): 300ms crossfade with blur(4px) and
  scale-from-0.25, --ease-festra.
- Tab/lens switcher: sliding indicator (transform), 200ms.
- Loading: skeleton shimmer 2s linear (#ECECF1 <-> #F6F6F8); data resolves via
  blur-up (blur 4px -> 0 + opacity, 300ms). Gov-data fetches shimmer-then-reveal:
  wait reads as working; arrival reads as an event.
- Performance: animate transform/opacity only; blur only during enter/exit of
  chrome, never while dragging, never applied over the live map canvas; expensive
  visuals recompute on shape change only (Aave perf rule). WebGL budget belongs
  to the map.

prefers-reduced-motion: all durations -> 1ms; movement/blur/scale replaced by
opacity-only crossfade; shimmer becomes a static placeholder block; sheet and
panels snap; map camera flyTo replaced by jumpTo/short easeTo. Stagger removed.

Theme/scheme is stamped on <html> pre-paint; Festra never flashes a wrong-theme
frame.

---

## 6. Map chrome components

- Interactive-state alpha ladder (every control, one law): ink at 3% rest-tint /
  6% hover / 8% press / 10% active, as component-scoped vars
  (--btn-hover-bg, --tab-active-bg ...) so pins, menus, chips never drift.
- Floating controls (zoom, locate, layers trigger): 40px hit area, 10px radius,
  92% white fill + blur(12px), hairline-ring shadow recipe, 12px from map edge.
- Search pill: 44px height, pill radius, leading icon, results list with mono
  lot/plan identifiers; combobox ARIA preserved.
- Layout IA: keep category convention (left layer/lens controls, right parcel
  info panel) - differentiate on palette, type, motion quality, not on IA.
- Parcel info panel: solid #FFFFFF on #F6F6F8 shell; sections alternate white /
  surface tint (Carbon elevation); 12px-radius cards, 16-20px padding; sticky
  header with address in display face + lot/plan in mono.
- Pins: ink (#1A1A22) glyph with 1.5px white halo for legibility over any tile;
  selected: accent fill + 4px --accent-tint ring; clusters: white pill, mono
  ink count, hairline ring.
- Popups: 12px radius, hairline ring, caret to anchor, max-width 320px; title
  14/600, data rows 13 mono; one action max; everything else goes to the panel.
- Menus/dropdowns: 8px radius, alpha-ladder states, origin-aware scale from
  trigger; tooltips enter after 300ms delay, exit instantly.
- Buttons: primary accent-fill/white text; secondary white + hairline ring;
  ghost alpha-ladder only. Focus: 2px accent ring, 2px offset, always visible.
- Legend: glass panel bottom-left, 12px swatches with hairline strokes.
- Report reading mode: single 760px column, 16/26 body, mono data chips
  (area, zone code, distances) inline; caveat rows per semantic spec.
- Copy voice: short, declarative, zero hedging in controls; plain, calm,
  evidence-linked in caveats ("Flood overlay applies to 40% of this parcel.
  Source: VicPlan.") - Spectrum-style writing guidance for bad news.

---

## 7. Logo concepts (fenestra = window)

1. "Casement F" (primary recommendation). A 2px-stroke rounded rect (the frame)
   with one vertical mullion offset left of center and one horizontal transom
   offset above center: four unequal panes whose left-column + top-bar negative
   space reads as a letter F. Pure geometry, no gradient. Favicon: the glyph
   alone, 3px strokes at 16px, ink on white; accent variant for active/pinned.
2. "Light through". Solid ink rounded square (the room) with a tall rectangular
   window knocked out; through it, a flat accent-blue pane and a skewed
   parallelogram of light falling inward (accent at 12% tint). At favicon scale
   the parallelogram drops and only knockout + accent pane remain. Conveys
   "window into the data" most literally.
3. "Open casement". Frame outline plus one pane swung open: a rect stroke with a
   parallelogram (the opened sash, flat accent fill) hinged on its left edge.
   Doubles as a subtle forward chevron - disclosure, opening, transparency.
   Strongest motion-logo potential (sash opens 300ms --ease-festra on load).

Wordmark: FESTRA set in the display face, 600, hand-kerned, ink; mark sits left
at cap height. No gradient, no glow, no container shape behind the lockup.

---

## 8. Anti-slop rules (hard bans)

Palette
1. No cream/beige surfaces anywhere (#FAF4E8/#F8ECDC class, incl. old Festra cream).
2. No warm orange spectrum accents: terracotta #AD4F2E through coral #FF5E38 -
   the entire family is Landchecker-adjacent and AI-default.
3. No dark-teal chrome (#1b272a class), no green accents in chrome - Landchecker's
   owned product aesthetic. Green appears only as a semantic pass state in data.
4. No purple/violet gradients, no cyan-on-dark, no dark-mode-with-glow. No dark
   theme at all.
5. No gradients in UI chrome, period. Flat fills + hairlines. (Map data ramps
   and the basemap are exempt.)
6. No glows: no colored shadows, no inset glow washes, no neon focus rings.

Type
7. Never Space Grotesk; never Basis Grotesque or near neighbours (Landchecker);
   never Inter/Geist as the sole identity; no distressed/novelty display faces.
8. No display type ships with default tracking - mandatory hand kerning pass.
9. Floors: report body >= 16px, chrome >= 13px, line-height 1.5-1.7, measure
   65-75ch, WCAG AA 4.5:1 body / 3:1 large - enforced, not aspirational.

Surface and layout
10. Radii cap 16px; no 24px+ blob cards; no glassmorphism as decoration -
    backdrop-blur only where chrome floats over the map.
11. No icon-tile-above-heading card grids, no eyebrow/kicker pills, no
    side-stripe cards, no gradient text, no emoji in UI.
12. No soft blob shadows (0 4px 20px class); hairline ring + tight ambient only.

Motion
13. No bounce/elastic/spring overshoot easings; no error-shake; no playful
    flourishes. Calm only.
14. No `transition: all`; no CSS built-in `ease`; no animating
    width/height/padding; no motion blur during movement over the map.
15. Nothing over 500ms; no ambient/looping animation as page furniture; no
    always-running shaders or shimmer outside loading states.

Content and process
16. No AI-generated imagery anywhere - real map screenshots, real Melbourne
    parcels and streetscapes only. Fabricated visuals poison trust in a data
    product.
17. No user-facing theming/customization. One tuned system.
18. Every screen passes the impeccable.style 46-rule detector + a tasteskill
    S14-style pre-flight checklist before ship; every AI-assisted screen gets a
    human finishing pass (80/20 rule).
19. This file's tokens are the contract: commit a machine-readable DESIGN.md
    derived from it so AI-assisted changes stay on-system, with these
    anti-references named: Landchecker green-on-dark-teal, cream/terracotta,
    purple gradients, glow accents.

---

## 9. Open questions

1. Accent final call: cobalt #2052CC (Surveyor) vs navy #1E3A8A (Deed) - decide
   after testing both against VIC planning-zone shading on the real basemap
   (several zone fills are blue-family; the selected-parcel accent must win).
2. Display face budget: PP Neue Montreal license vs free General Sans - audition
   both in-context (report H1 + wordmark) before the rebrand commit.
3. Custom light basemap style: build/configure now or after chrome retoken?
   Chrome neutrals assume a desaturated gray basemap.
4. Logo: pick one of the three concepts for refinement; does the owner want the
   animated "open casement" treatment on app load or static-only?
5. Existing bottom-sheet implementation: confirm snap points (25/60/92%) and
   that drag uses transform (not height) so the sheet curve applies cleanly.
