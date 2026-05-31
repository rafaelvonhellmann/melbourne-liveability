# Analisa.pt Information Architecture Extract

> Translated to English from the original PT/EN extraction.

Extraction date: 2026-05-31  
Target: https://analisa.pt/  
Purpose: understand how Analisa.pt organises maps, statistics, rankings, contracts, comparisons, and drill-downs so we can adapt the pattern for an Australian/Melbourne version.

## High-Level Product Shape

Analisa.pt is not a conventional landing page. It opens into a working geographic data product:

- A full-screen Portugal map with municipality/parish layers.
- A quality-of-life score as the default composite map layer.
- Floating panels for layers, weights, rankings, and chat.
- A top navigation bar for statistical exploration, migrations, public contracts, and comparison.
- Detail views that combine raw indicators, score breakdowns, historical context, and source/provenance metadata.
- Public procurement data is both its own workspace and an input into liveability/economy indicators.

Observed product claim from the site's `llms.txt`: 308 municipalities, 230+ indicators, 13 categories, official/open data sources, rankings, comparisons, historical trends, public contracts, and persona-based scoring.

Observed current UI/API extraction:

- The `Layers` drawer displayed 175 layers.
- The public `/api/municipality-dataset` endpoint returned 180 `layerDescriptors`.
- The UI groups the main statistical layers into 13 visible categories plus an `Other` group for procurement-derived metrics.

## Top Navigation

Top-level navigation:

- `Explorer`
- `Statistics`
- `Migration` with `New` badge
- `Contracts`
- `Compare`
- `Search`
- `Feedback`
- `Language`
- Theme controls: light/dark/system
- `Sign in`

The top navigation is supported by map-side actions rather than page reloads for most work. The visible product model is a persistent map shell with drawers and modals.

## Explorer / Home Map

Default surface:

- Main map of Portugal.
- Legend: `Quality of Life (QoL)`, from `Stress` to `Calm`.
- Visual mode buttons:
  - `Single Layer`
  - `Multi Layer`
- Floating cards:
  - `Latest updates`
  - `Recent INE datasets`
  - `Best QoL scores` or `Worst QoL scores`
  - `Biggest improvements` or `Biggest deteriorations`
  - `Key indicators`
  - `Did you know?`
- Right-side action rail:
  - `Layers`
  - `Weights`
  - `Rankings`
  - `Chat`

Map controls from the app labels:

- Show/hide layers.
- Show/hide filters/weights.
- Show/hide rankings.
- Show/hide comparison.
- Open/hide chat.
- Add selected municipality to comparison.
- Switch map mode between `Municipality` and `Parish`.

## Statistics Organisation

The top statistical navigation uses five broad buckets:

- `Economy & Housing`
- `Health & Education`
- `Mobility & Environment`
- `People & Society`
- `Composite`

The deeper statistical taxonomy uses these visible categories:

- `Safety`
- `Economy`
- `Housing`
- `Health`
- `Environment`
- `Infrastructure`
- `Education`
- `Leisure`
- `Demographics`
- `Tourism`
- `Social Protection`
- `Composite`
- `Other`

This two-level organisation is important: the top bar stays simple, while the layer drawer exposes the full indicator taxonomy.

## Statistical Layer Drawer: `Layers`

Purpose: choose what the map colours represent.

Observed controls:

- Search: `Search metrics...`
- `Composite scoring mode`
- `Composite score`
- `INE catalogue`
- `Beyond the registry`
- `Search the INE catalogue...`
- Note: external INE catalogue indicators can be fetched live and are limited to the current session.

Visible layer categories and counts:

- `Safety` (21)
- `Economy` (23)
- `Housing` (8)
- `Health` (10)
- `Environment` (16)
- `Infrastructure` (13)
- `Education` (14)
- `Leisure` (18)
- `Demographics` (18)
- `Tourism` (10)
- `Social Protection` (5)
- `Composite` (1)
- `Other` (18)

## Statistical Weight Drawer: `Weights`

Purpose: turn the same layer taxonomy into a scoring editor.

Observed controls and behaviour:

- Title: `Data layers and weights`
- Active profile: `Explorer`
- Summary: `32 active · 175 layers in total`
- Average score shown, for example `Average score: 66`
- Each category displays active count against total, for example `Economy 3/23`.
- Each metric can be off or assigned a weight percentage.
- Some metrics are marked `★ highlight`.
- Actions:
  - `Select all`
  - `Deselect all`
  - `Reset`

Default `Explorer` profile examples:

- `Crimes per 1000 residents (Pordata)` marked as highlight, weight 8%.
- `Public investment momentum`, weight 2%.
- `Connectivity quality proxy`, weight 2%.
- Housing affordability metrics such as `Purchase affordability stress` and `Rental affordability stress`, weight 8%.
- Health access metrics such as `Distance to hospital`, weight 5%.
- Environment metrics such as `Days of climate comfort` and `PM2.5`.
- Mobility/infrastructure metrics such as airport/highway/rail access and broadband coverage.

Observed scoring profiles/personas from the app bundle:

- `Explorer`: balanced overview of all quality-of-life dimensions.
- `Nomad`: remote-worker profile with cost, connectivity, airport access, climate, and urban amenities.
- `Family`: safety, healthcare, schools, and affordable family housing.
- `Retiree`: healthcare, safety, peaceful environment, and manageable cost.
- `Young Professional`: job market, affordable rent, urban amenities, and transport.
- `Student`: cheap rent, safety, transport, cultural life, and university access.

## Statistical Rankings Drawer: `Rankings`

Purpose: turn scores/layers into ordered lists.

Observed controls:

- Title: `Municipality ranking`
- Shows active profile and coverage: `Explorer · 308 municipalities`
- `Category`
- Category selector defaults to `All`
- `Sort by`
- Sort defaults to `Overall QoL score`
- `Profile highlights`
- `Top 10`
- `Bottom 10`
- Click row to focus municipality on map.

Pattern to copy: rankings are not a separate page first. They sit next to the map and remain connected to map focus.

## Metric Insights / Advanced Analysis

The metric insight drawer provides a second level of analysis once a layer is selected.

Observed tab/section labels:

- `Table`
- `Trends`
- `Top`
- `Bottom`
- `Around`
- `Selected`
- `Chart`
- `Comparison`
- Export support
- Add municipalities/hospitals/entities to chart
- Focus selected row on map

Special health data variants:

- `Hospital layer`
- `Emergency`
- `Triage`
- `Beds`
- `Consultations`
- `Primary care layer`
- `ACES/ULS`
- `Registered patients`
- `Without a family doctor`
- `With a family doctor`

## Municipality / Area Detail

Extraction method: searched for `Lisboa` and opened municipality `1106`. The app opens a left-side drawer over the map, not a separate page.

Drawer header observed for Lisboa:

- Score: `68`
- Band: `Good`
- Municipality: `Lisboa`
- Population: `575 739`
- Area: `100 km²`
- Density: `5757,4 residents/km²`
- Municipality code: `1106`
- Coordinates: `38.7412, -9.1620`
- Header controls: favourite municipality, close drawer, and tab-scroll controls.

Actual drawer tab strip observed:

- `Overview`
- `Nomad`
- `Safety`
- `Housing`
- `Health`
- `Environment`
- `Economy`
- `Leisure`
- `Infrastructure`
- `Demographics`
- `Education`
- `Tourism`
- `Social Protection`
- `Composite`

The tab strip is horizontally scrollable. This is important for an Australian version: do not treat these as page-level navigation; they are contextual drawers tied to the selected city/suburb/LGA.

Common card anatomy inside category tabs:

- Metric name.
- Current value and unit.
- Directionality: `higher is better` or `lower is better`.
- Trend state: `Improving`, `Worsening`, `Stable`, or single-period trend unavailable.
- Time period and mini chart.
- Comparison references: national average, selected municipality average, P25-P75 interval.
- Optional public-investment context: investment group, spend value, outcome vs average, and correlation strength.
- Card actions: `Select this dataset on the map` and `Create dataset alert`.

### Lisboa: `Overview`

The overview tab is a compact score dashboard.

Category scores:

- `Safety`: `4/100`
- `Housing`: `20/100`
- `Health`: `66/100`
- `Environment`: `53/100`
- `Economy`: `73/100`
- `Leisure`: `71/100`
- `Infrastructure`: `90/100`
- `Demographics`: `68/100`
- `Education`: `94/100`
- `Tourism`: `79/100`
- `Social Protection`: `18/100`
- `Composite`: `100/100`

Score lens:

- Active lens: `Explorer`
- Description: balanced default profile; all main metrics active with moderate category weights for general exploration.
- Top weighted metrics shown:
  - `Crimes per 1000 residents (Pordata) · weight 0.08`
  - `Rental affordability stress · weight 0.08`
  - `Purchase affordability stress · weight 0.08`
  - `Distance to hospital · weight 0.05`
  - `Days of climate comfort (annual) · weight 0.04`

Historical trend:

- Status: `Stable`
- Label: `Profile score (14 with trend · 17 single-period)`
- Period: `2011–Current`
- Chart points shown: `2011`, `2021`, `2022`, `2023`, `2024`, `Current`
- Note: historical years use weighted multi-period indicators; `Current` is the exact latest panel score. Data coverage shown as `100%`.

### Lisboa: `Nomad`

The nomad tab is a persona-specific scorecard.

- Nomad Score: `65`
- Data coverage: `67% data`
- Rating: `Good`
- Scored dimensions: `5/5 dimensions scored`
- `Connectivity`: `100/100`, coverage `5/5`
- `Work Environment`: `95/100`, coverage `3/4`
- `Cost`: `0/100`, coverage `3/6`
- `Lifestyle`: `57/100`, coverage `5/7`
- `Community`: `100/100`, coverage `2/5`
- Footer section: `Data coverage & provenance`

### Lisboa: `Safety`

Public investment block:

- `Public investment linked to Safety`
- Group: `Investment in security and emergency · CPV 797, 351`
- Variation: `+97%`, `2021-2025`
- Investment per resident: `84,1 €`, `+813% vs average`
- Category score: `4`, `-65 pts vs average`
- Insight: investment is far above average per resident while category performance is far below average.
- Relationship: `National relationship: strong + (166)`

Metric cards observed:

- `Crimes per 1000 residents (Pordata)`: `54 per 1000`, lower better, `Improving -30.7%`, `2011–2024`; result `83% worse than average`.
- `Crimes against physical integrity`: `6,2 per 1000`, lower better, `Worsening +12.7%`, `2021–2025`; result `13% worse than average`.
- `Crimes against property`: `34,3 per 1000`, lower better, `Worsening +26.1%`; result `158% worse than average`.
- `Driving with blood alcohol level >= 1,2 g/l`: `1,8 per 1000`, lower better, `Worsening +12.5%`; result `30% better than average`.
- `Driving without a licence`: `2,5 per 1000`, lower better, `Improving -21.9%`; result `113% worse than average`.
- `Bag-snatching/robbery in public places`: `3 per 1000`, lower better, `Worsening +25.0%`; result `989% worse than average`; correlation `moderate + (170)`.
- `Bodily harm offences`: `1525 count`, lower better, `Worsening +23.1%`.
- `Crimes against life in society`: `2541 count`, lower better, `Worsening +14.7%`.
- `Crimes against persons`: `5475 count`, lower better, `Worsening +17.1%`.
- `Crimes against property`: `19 748 count`, lower better, `Worsening +33.3%`.
- `Crimes against the State`: `890 count`, lower better, `Worsening +34.2%`.
- `Crimes of offence against physical integrity`: `3551 count`, lower better, `Worsening +17.9%`.
- `Domestic violence against spouse/equivalent`: `1641 count`, lower better, `Worsening +16.7%`.
- `Driving without a licence`: `1463 count`, lower better, `Improving -16.8%`.
- `Driving with alcohol >= 1,2 g/l`: `1025 count`, lower better, `Worsening +14.7%`.
- `Bag-snatching/robbery in public places`: `1743 count`, lower better, `Worsening +33.2%`.
- `Miscellaneous legislation`: `4049 count`, lower better, `Worsening +17.8%`.
- `Total crimes`: `32 821 count`, lower better, `Worsening +26.7%`.
- `Theft of and from vehicles`: `2979 count`, lower better, `Worsening +4.5%`.
- `Total crime`: `57 per 1000`, lower better, `Worsening +20.0%`.
- `Theft of and from motor vehicles`: `5,2 per 1000`, lower better, `Stable`.

### Lisboa: `Housing`

Public investment block:

- `Public investment linked to Housing`
- Group: `Investment in construction · CPV 45`
- Variation: `-19%`, `2021-2025`
- Investment per resident: `529,7 €`, `-67% vs average`
- Category score: `20`, `-17 pts vs average`
- Insight: investment is below average per resident and category performance is below average.

Metric cards observed:

- `Rental affordability stress`: `81,97%`, lower better, `Worsening +19.4%`, `2020–2023`; result `111% worse than average`.
- `Purchase affordability stress`: `100,28%`, lower better, single-period/no historical series; investment context `305 M €`, `2025`.
- `Mortgage credit pressure`: `27,88%`, lower better, `Worsening +11.9%`, `2022–2024`; result `45% better than average`.
- `Purchase price (€/m²)`: `€4875 €/m²`, lower better, `Worsening +48.4%`, `4th Quarter 2019–4th Quarter 2025`; result `269% worse than average`.
- `Rental price (€/m²)`: `€15,93 €/m²`, lower better, `Worsening +39.0%`, `2020–2024`; result `166% worse than average`.
- `Number of new construction permits (last 3 months)`: `199 count`, higher better, `Improving +521.9%`, `November 2010–March 2026`; result `163% better than average`.
- `Median bank valuation value (Pordata)`: `€3826 €/m²`, lower better, `Worsening +124.1%`, `2011–2024`; result `269% worse than average`.
- `New residential buildings (Pordata)`: `8 count`, higher better, `Worsening -74.2%`, `2011–2024`; result `79% worse than average`.

### Lisboa: `Health`

Public investment block:

- `Public investment linked to Health`
- Group: `Investment in health/medical · CPV 33, 851`
- Variation: `+117%`, `2021-2025`
- Investment per resident: `2 thousand €`, `+2171% vs average`
- Category score: `66`, `+23 pts vs average`
- Insight: investment is far above average per resident and category performance is above average.
- Relationship: `National relationship: strong + (230)`

Metric cards observed:

- `Distance to hospital`: `0,79 km`, lower better, single-period `2026`; investment context `1,2 bn €`, `2025`.
- `Pharmacies (Pordata)`: `245 count`, higher better, `Worsening -14.3%`, `2011–2024`; result `2316% better than average`; correlation `strong + (230)`.
- `SNS patients with an assigned family doctor`: `70,34%`, higher better, single-period `2026-03`.
- `Hospital coverage ≤15km`: `100%`, higher better, single-period `2026`.
- `Hospitals (Pordata)`: `31 count`, higher better, `Worsening -13.9%`, `2011–2024`; result `3845% better than average`; correlation `strong + (230)`.
- `Infant mortality rate (Pordata)`: `1,7‰`, lower better, `Improving -43.3%`, `2011–2024`; result `52% better than average`.
- `SNS bed occupancy rate`: `84,55%`, lower better, single-period `2026-02`.
- `SNS specialist appointments within adequate time`: `38,12%`, higher better, single-period `2026-02`.
- `SNS emergency visits (monthly)`: `34 292 episodes`, lower better, single-period `2026-02`.
- `SNS yellow/red triage`: `65,74%`, lower better, single-period `2026-02`.

### Lisboa: `Environment`

Public investment block:

- `Public investment linked to waste and water`
- Group: `Investment in cleaning/waste/water · CPV 90, 651`
- Variation: `+49%`, `2021-2025`
- Investment per resident: `169,8 €`, `+231% vs average`
- Category score: `53`, `+6 pts vs average`

Metric cards observed:

- `Days of climate comfort (annual)`: `32,88%`, higher better, single-period `2025`.
- `PM2.5 (24h average)`: `5,86 µg/m³`, lower better, single-period.
- `European AQI (24h average)`: `29,17 AQI`, lower better, single-period.
- `Separated waste per capita (Pordata)`: `180,4 kg`, higher better, `Improving +73.5%`, `2011–2024`; result `66% better than average`.
- `Safe water (ERSAR)`: `99,51%`, higher better, single-period `2024`.
- `Average temperature (annual)`: `17,62°C`, lower better, single-period `2025`.
- `Electricity per capita (Pordata)`: `5420,4 kWh`, lower better, `Improving -9.9%`, `2011–2024`.
- `European AQI (daily maximum)`: `36 AQI`, lower better, single-period.
- `Days of heat risk (annual)`: `9,04%`, lower better, single-period `2025`.
- `Municipal environment spending per capita (Pordata)`: `€120`, higher better, `Worsening -24.5%`.
- `PM2.5 (daily maximum)`: `9,3 µg/m³`, lower better, single-period.
- `Population served (ERSAR)`: `605 000 residents`, higher better, single-period `2024`.
- `Days without rain (annual)`: `71,78%`, higher better, single-period `2025`.
- `Water volume/day (ERSAR)`: `160 000 m³/dia`, higher better, single-period `2024`.
- `Water losses`: `6 309 159 m3`, lower better, result `613% worse than average`.
- `Supply zones (ERSAR)`: `1 count`, higher better, single-period `2024`.

### Lisboa: `Economy`

This tab did not start with a single category investment hero in the observed Lisboa drawer. Instead it mixes labour market, business, purchasing-power, procurement, contract, and coworking/connectivity indicators.

Metric cards observed:

- `Registered unemployment (total)`: `17 771 count`, lower better, `Improving -11.9%`, `January 2025–April 2026`.
- `Connectivity quality proxy`: `100 score`, higher better, single-period `2026`.
- `Public investment momentum`: `83 score`, higher better, single-period.
- `Announcements per 10k residents`: `54,98 announcements/10k`, higher better, single-period.
- `ATMs (Pordata)`: `1140 count`, higher better, `Worsening -25.7%`.
- `Average price increase per modification (%)`: `12,74%`, lower better, `Worsening +79.6%`, `2021–2025`.
- `Awarded value per resident (12m)`: `€5819,95 €/resident`, higher better, single-period.
- `Banks (Pordata)`: `349 count`, higher better, `Worsening -51.9%`, `2011–2024`.
- `Staff employed in companies (Pordata)`: `794 749 count`, higher better, `Improving +39.8%`.
- Procurement totals: cleaning/water `€97 771 437,95`, construction `€304 991 730,75`, culture/leisure `€19 724 552,16`, education/training `€18 772 433,79`, health/medical `€1 150 063 868,08`, IT `€520 651 211,26`, security `€48 391 018,57`, transport `€105 949 347,43`.
- Procurement per resident: cleaning `€169,82`, construction `€529,74`, culture `€34,26`, education `€32,61`, health `€1997,54`, IT `€904,32`, security `€84,05`, transport `€184,02`.
- `Contracts per 10k residents`: `662,62 contracts/10k`, higher better, single-period.
- `Contracts with modifications (%)`: `2,44%`, lower better, `Worsening +11.1%`, `2021–2025`.
- `Coworking access proxy`: `100 score`, higher better, single-period `2026`.
- `Agricultural credit banks (Pordata)`: `5 count`, higher better, `Stable`, `2011–2024`.
- `Local Public Administration workers (Pordata)`: `0 count`, higher better, `Worsening -100.0%`.
- `Rate of announcements with a contract (12m)`: `71,49%`, higher better, single-period.
- `Non-financial companies (Pordata)`: `148 172 count`, higher better, `Improving +52.5%`.
- `Purchasing power per capita`: `181,35 index`, higher better, single-period `2023`.
- `Registered unemployment (< 1 year)`: `10 897 count`, lower better, `Improving -12.5%`.
- `Registered unemployment (1+ year)`: `6874 count`, lower better, `Improving -10.9%`.
- `Registered unemployment (first job)`: `2287 count`, lower better, `Improving -11.4%`.
- `Registered unemployment (men)`: `8568 count`, lower better, `Improving -13.4%`.
- `Registered unemployment (new job)`: `15 484 count`, lower better, `Improving -12.0%`.
- `Registered unemployment (women)`: `9203 count`, lower better, `Improving -10.5%`.
- `Staff in the 4 largest companies (Pordata)`: `7%`, lower better, `Improving -30.0%`.
- `Turnover of the 4 largest companies (Pordata)`: `19%`, lower better, `Improving -9.5%`.

### Lisboa: `Leisure`

Public investment block:

- `Public investment linked to culture and leisure`
- Group: `Investment in culture/leisure · CPV 92, 37`
- Variation: `-56%`, `2021-2025`
- Investment per resident: `34,3 €`, `+13% vs average`
- Category score: `71`, `+47 pts vs average`

Metric cards observed:

- `Leisure diversity`: `100 score`, higher better, single-period `2026`.
- `Parks per capita`: `9,97 per 10k`, higher better, single-period `2024`.
- `Presence of green spaces`: `100%`, higher better, single-period `2025`.
- `Distance to the beach`: `1,22 km`, lower better, single-period `2026`.
- `Cinema density`: `1,56 per 10k`, higher better, single-period `2024`.
- `Distance to cinema`: `3,03 km`, lower better, single-period `2026`.
- `Cinema screens (Pordata)`: `71 count`, higher better, `Worsening -11.3%`; result `3784% better than average`.
- `Coastal leisure coverage ≤25km`: `100%`, higher better, single-period `2026`.
- `Cultural facilities density`: `1,71 per 10k`, higher better, single-period `2024`.
- `Distance to cultural facility`: `0,38 km`, lower better, single-period `2026`.
- `Live performance sessions (Pordata)`: `8677 count`, higher better, `Improving +26.5%`; result `5847% better than average`.
- `Municipal spending on culture and sport (Pordata)`: `€84 802 € thousands`, higher better, `Improving +71.2%`.
- `Museums (Pordata)`: `47 count`, higher better, `Improving +23.7%`.
- `Parks and green spaces`: `574 count`, higher better, single-period `2025`.
- `Sports venue density`: `1,73 per 10k`, higher better, single-period `2024`.
- `Distance to sports venue`: `0,12 km`, lower better, single-period `2026`.
- `Theatre density`: `1,71 per 10k`, higher better, single-period `2024`.
- `Distance to theatre`: `0,4 km`, lower better, single-period `2026`.

### Lisboa: `Infrastructure`

Public investment block:

- `Public investment linked to mobility and connectivity`
- Group: `Investment in IT/software/equipment · CPV 72, 48, 302, 324, 325`
- Variation: `+129%`, `2021-2025`
- Investment per resident: `904,3 €`, `+1729% vs average`
- Category score: `90`, comparison unavailable

Metric cards observed:

- `Fixed broadband coverage`: `98%`, higher better, single-period `2025-Q3`.
- `Distance to airport`: `10,44 km`, lower better, single-period `2026`.
- `Distance to motorway`: `1,32 km`, lower better, single-period `2026`.
- `Distance to railway station`: `1,39 km`, lower better, single-period `2026`.
- `Multimodal mobility coverage`: `100%`, higher better, single-period `2026`.
- `Airport coverage ≤50km`: `100%`, higher better, single-period `2026`.
- `Travel time to airport (estimated)`: `17,37 min`, lower better, single-period `2026`.
- `Download speed (median)`: `720 Mbps`, higher better, single-period `2025-Q3`.
- `Distance to main road`: `1,35 km`, lower better, single-period `2026`.
- `Mobile coverage / quality`: `99,7%`, higher better, single-period `2025-Q3`.
- `Railway station density`: `1,69 per 10k`, higher better, single-period `2024`.
- `Travel time to station (estimated)`: `7,29 min`, lower better, single-period `2026`.
- `Upload speed (median)`: `220 Mbps`, higher better, single-period `2025-Q3`.

### Lisboa: `Demographics`

This tab has a special chart before the normal metric cards.

Population trend chart:

- Title: `Population trends`
- Subtitle: `Population trend comparison`
- Period: `2008–2024`
- Series: foreign residents, foreign-resident share, resident population.
- Notes: overlap windows `2011–2023`; dashed line is foreigner percentage; gaps indicate missing source periods.

Metric cards observed:

- `Ageing index (Pordata)`: `169 per 100`, lower better, `Improving -4.0%`.
- `Births (Pordata)`: `5767 count`, higher better, `Stable`.
- `Deaths (Pordata)`: `6570 count`, lower better, `Stable`.
- `Dependency ratio`: `57,7%`, lower better, `Stable`, `2021–2024`.
- `Divorces (Pordata)`: `795 count`, lower better, `Improving -36.1%`.
- `Elderly (Pordata)`: `23%`, lower better, `Improving -8.7%`.
- `Foreign residents`: `202 430 count`, higher better, `Improving +377.5%`, `2008–2024`.
- `Share of foreign residents`: `35,69%`, higher better, `Improving +356.8%`, `2008–2024`.
- `Marriages (Pordata)`: `2782 count`, higher better, `Improving +5.5%`.
- `Net migration`: `9412 count`, higher better, `Improving +755.0%`.
- `Natural balance (Pordata)`: `-803 count`, higher better, `Improving +9.4%`.
- `Parishes (Pordata)`: `24 count`, higher better, `Worsening -54.7%`.
- `Population density`: `5754,5 residents/km²`, lower better, `Improving -12.6%`, `2004–2024`.
- `Resident population (Pordata)`: `575 739 people`, higher better, `Improving +6.1%`.
- `Area (Pordata)`: `100 km²`, higher better, `Improving +17.6%`.
- `Time zone compatibility (EU/US)`: `85 score`, higher better, single-period `2026`.
- `Working-age population (Pordata)`: `63,3%`, higher better, `Improving +3.1%`.
- `Young people (Pordata)`: `13,6%`, higher better, `Stable`.

### Lisboa: `Education`

Public investment block:

- `Public investment linked to Education`
- Group: `Investment in education/training · CPV 80, 3916, 4819`
- Variation: `+160%`, `2021-2025`
- Investment per resident: `32,6 €`, `+167% vs average`
- Category score: `94`, `+57 pts vs average`

Metric cards observed:

- `1st cycle schools (Pordata)`: `182 count`, higher better, `Worsening -9.0%`; result `1300% better than average`.
- `Higher education institutions (Pordata)`: `67 count`, higher better, `Worsening -6.9%`; result `7065% better than average`.
- `Secondary schools (Pordata)`: `80 count`, higher better, `Improving +14.3%`; result `2440% better than average`.
- `Adults with at least completed secondary education`: `No data %`; investment context `18,8 M €`, `2025`.
- `Gross enrolment rate, basic education`: `137,33%`, higher better, `Stable`, `2014/2015–2023/2024`.
- `Higher education density`: `1,16 per 10k`, higher better, single-period `2024`.
- `Higher education students (Pordata)`: `131 690 count`, higher better, `Improving +6.7%`.
- `3rd cycle schools (Pordata)`: `102 count`, higher better, `Improving +9.7%`.
- `2nd cycle schools (Pordata)`: `88 count`, higher better, `Improving +3.5%`.
- `Non-higher education students (Pordata)`: `114 867 count`, higher better, `Worsening -5.4%`.
- `Pre-school establishments (Pordata)`: `266 count`, higher better, `Worsening -3.6%`.
- `Retention/dropout rate`: `5,3%`, lower better, `Improving -43.8%`.
- `Gross enrolment rate, secondary education`: `211,97%`, higher better, `Worsening -6.2%`.
- `Transition/completion rate`: `88,03%`, higher better, `Improving +7.8%`.

### Lisboa: `Tourism`

This tab did not show a public-investment hero block in the observed drawer.

Metric cards observed:

- `Accommodation capacity (beds)`: `21 563,75 beds`, higher better, `Improving +21.2%`, `2017–2024`.
- `Occupancy rate — Local lodging (INE)`: `54,2%`, higher better, `Improving +2.1%`, `2022–2024`.
- `Occupancy rate — Hotels (INE)`: `60,1%`, higher better, `Improving +7.1%`, `2022–2024`.
- `Occupancy rate — Total (INE)`: `58,9%`, higher better, `Improving +6.3%`, `2022–2024`.
- `Occupancy rate — Rural tourism (INE)`: `40,9%`, higher better, `Improving +25.5%`.
- `Tourist density (overnight stays/km²)`: `4948,81 per km²`, lower better, `Worsening +143.6%`, `January 2022–December 2024`.
- `Tourist guests`: `565 076 count`, higher better, `Improving +222.5%`, `January 2022–March 2026`.
- `Tourist intensity (overnight stays/resident)`: `1,16 ratio`, lower better, `Worsening +224.9%`.
- `Tourist overnight stays`: `656 811 count`, higher better, `Improving +230.5%`.
- `Tourist accommodations (Pordata)`: `645 count`, higher better, `Improving +234.2%`, `2011–2024`.

### Lisboa: `Social Protection`

This tab did not show a public-investment hero block in the observed drawer.

Metric cards observed:

- `CGA pensions (Pordata)`: `89 737 count`, lower better, `Improving -6.6%`, `2011–2024`.
- `Pensioners per 1000 residents`: `265,38 per 1000`, lower better, `Improving -16.9%`, `2017–2024`.
- `RSI beneficiaries (Pordata)`: `1625 count`, lower better, `Improving -93.9%`.
- `Social security beneficiaries`: `17 995 count`, lower better, `Improving -5.7%`, `2023–2024`.
- `Social Security pensions (Pordata)`: `141 940 count`, lower better, `Improving -26.0%`.

### Lisboa: `Composite`

Metric cards observed:

- `Municipal Resilience`: `99,95 score`, higher better, source `derived`, trend unavailable because only one period exists.

### Municipality Drawer Pattern To Reuse For Melbourne

For an Australian/Melbourne version, the equivalent drawer should probably use:

- Header: city/suburb/LGA name, composite score, population, area, density, code, coordinates.
- `Overview`: category score breakdown, active scoring lens, top weighted metrics, historical trend.
- `Nomad`: a persona scorecard with coverage/provenance.
- Category tabs: safety, housing, health, environment, economy, leisure, infrastructure, demography, education, tourism/visitation, social support, composite/resilience.
- Metric cards with current value, unit, good/bad direction, trend, benchmark band, source, and alert/select actions.
- Procurement or public-investment modules where Australian data supports it: council tenders, state infrastructure programs, grants, budget papers, planning approvals, capital works, and contract registers.

## Compare Modal: `Compare`

Initial empty state:

- Title: `Compare municipalities`
- Hero: `Compare municipalities side by side`
- Select `First municipality`
- Select `Second municipality`
- Quick picks such as Lisboa, Sintra, Cascais, Loures, Braga, Oeiras, Guimarães, Coimbra.

After selecting two municipalities, the modal becomes a section-by-section comparison workspace.

Compare sidebar sections:

- `Overview`: scores, highlights, and overall position.
- `Safety`: safety and crime signals.
- `Families`: health, education, social protection, and family housing signals.
- `Health`: healthcare access and hospital metrics.
- `Housing and cost`: affordability, prices, and effort metrics.
- `Economy and work`: employment, contracts, income, and business activity.
- `Public investment`: contracts, announcements, momentum, and awarded value.
- `Environment and mobility`: air quality, climate, infrastructure, and access.
- `People and society`: demographics, safety, tourism, leisure, and social protection.
- `All datasets`: every active metric side by side.

Compare controls:

- `Absolute`
- `Rate per 1000`
- Profile score comparison across six profiles.
- Historical trend comparison.
- Dataset table with columns:
  - `Dataset`
  - `Category`
  - `Leader`

Pattern to copy: comparison is editorial, not just a raw table. It starts with a narrative summary, then profiles, then trends, then all datasets.

## Migration Workspace

Route: `/migrations`

Purpose: migration map and demographic-flow analysis.

Core controls:

- `Period`
- `Metric`
- `Direction`
- `Map view`
- `Connections`
- Search origin/destination.

Direction modes:

- `Immigration`
- `Emigration`

Map view modes:

- `Total`
- `% of total`
- `Growth`
- `World map`

Connection modes:

- `Top {count}`
- `All`

Immigration sections:

- `Resident foreign population`
- `National total`
- `Natural and migratory balance`
- `Acquisition of nationality`
- `Origins by continent`
- `Countries of origin`
- `Composition by gender`
- `Highest annual growth`
- `Most permits granted`
- `Did you know?`

Emigration mode:

- `Portuguese emigration`
- Metrics:
  - `Inflows`
  - `Born in Portugal`
  - `Remittances`
- `Top destinations`
- `Destination countries`

Source label shown in UI: INE/SEF and AIMA migration/asylum reporting, PORDATA, and Observatório da Emigração.

## Contracts Workspace

Route: `/contracts`

Purpose: public procurement map and contract explorer.

Default map state:

- Legend title: `Contracts`
- Map shows contract volume/value by municipality.
- Right-side action rail observed:
  - `Table`
  - `Alerts`
  - `Network`
  - `Modifications`
  - `Chat`

Some side actions opened a sign-in/account modal during extraction, so those appear to be gated or account-linked:

- `Alerts`
- `Network`
- `Modifications`
- `Chat`

Contract-area sections from app labels:

- `Contracts overview`
- `Annual spending`
- `Monthly spending`
- `Money flow`
- `Buyers`
- `Top buyers`
- `Top suppliers`
- `Distribution by type`
- `Contract types`
- `Announcement models`
- `Recent contracts`
- `Recent contract changes`
- `Recent announcements`
- `AI analysis`

Contract momentum metrics also appear inside the statistical/economy layer system:

- `Public investment momentum`
- `Contracts per 10k residents`
- `Announcements per 10k residents`
- `Awarded value per resident (12m)`
- `Rate of announcements with a contract (12m)`

This is a key pattern for Australia: procurement can be its own workspace and also feed the liveability/economic score.

## Contracts Table Modal: `Table`

Modal title: `Public contracts data explorer`

Tabs:

- `Contracts`
- `Announcements`
- `Modifications`
- `Entities`

Common controls:

- `Filter`
- Search placeholder: `Name, origin ID, NIF, status...`
- `All CPV categories`
- `All municipalities`
- `Reset`
- Pagination: `Previous`, `Next`

CPV preset filters:

- `Construction and public works`
- `IT and software services`
- `Security and surveillance`
- `Cleaning and waste`
- `Transport and mobility`
- `Education and training`
- `Health and medical supplies`
- `Culture, sport and recreation`

Observed `Contracts` table columns:

- `Contract`
- `Types`
- `Parties`
- `Value`
- `Published`

Other available table columns from app labels:

- `Status`
- `Announcement`
- `Entity`
- `Deadline`
- `Base price`
- `NIF`
- `Contracts`
- `Announcements`
- `Updated`
- `Modification`
- `Act type`
- `Date`
- `New value`
- `Delta`

Advanced filters:

- `Published from`
- `Published to`
- `Minimum value (€)`
- `Maximum value (€)`
- `Status`
- `Procedure type`
- `Contract type`
- `Buyer`
- `Supplier`
- `Has announcement`
- `Deadline from`
- `Deadline to`
- `Entity`
- `Model`
- `Act type`
- `Unmatched only`
- `Minimum contracts`
- `Minimum announcements`
- `Updated from`
- `Updated to`

## Contracts Detail Panel

Detail panel types:

- `Contract details`
- `Announcement details`
- `Entity details`

Contract fields:

- `Award`
- `Published`
- `Expected end`
- `Location`
- `Procedure`
- `Contract type`
- `Buyer`
- `Supplier`
- `Associated announcement`
- `Contract events`

Announcement fields:

- `Base price`
- `Deadline`
- `Location`
- `Entity`
- `NIF`
- `Official PDF`
- `Procedure documents`
- `Associated contracts`

Entity fields:

- `Contracts`
- `Contract amount`
- `Announcements`
- `Announcement amount`
- `Recent contracts`
- `Recent announcements`

## Contracts Rankings

Contract ranking controls from app labels:

- Dataset:
  - `Contracts`
  - `Announcements`
  - `Entities`
- Scope:
  - `Country`
  - `Municipality`
  - `Parish`
- Metric:
  - `Amount`
  - `Count`
- Lists:
  - `Top 10`
  - `Bottom 10`

## Contracts Network Graph

The `Network` side action opened sign-in during extraction, but the app labels reveal the intended IA.

Network graph header:

- `Contract network`
- Contract count
- Direct-award count
- Modification count

Toolbar:

- `Buyers`
- `Suppliers`
- `Overview`
- `Search entity`
- `Entity filter`
- `General filter`
- `Municipality`
- Zoom in/out/fit

Entity detail tabs:

- `All`
- `With direct awards`
- `With modifications`

Relationship detail tabs:

- `All`
- `Direct award`
- `Modified`

Network filters:

- `Smart`
- `All links`
- `Top 10 by value`
- `Top 20 by value`
- `Top 10 by frequency`
- `Top 20 by frequency`
- `Active in the last 12 months`
- `Buyer only`
- `Supplier only`
- `High dependency`
- `Cluster relationships`
- `Multiple municipalities`
- `Above €1M`
- `Above €100K`
- `Repeated contracts (2+)`
- `Direct-award dominant`
- `With modifications`
- `Smart view`
- `Top hubs`
- `Top by value`
- `Repeated relationships`
- `Core network`
- `Recent activity`

Network legend:

- Entity with >=70% direct awards.
- Entity with modifications.
- Relationship with >=50% direct awards.
- Relationship with modifications.

## Toggle And Navigator Inventory

This section is specifically about interaction surfaces beyond the top navigation. Some items were observed directly in the browser; others come from Analisa.pt's Portuguese UI label bundle and may be account-gated, latent, or visible only after selecting an entity/place.

### Global Shell Controls

- Search command palette:
  - Opens from `Search` / keyboard hint.
  - Placeholder searches municipalities, parishes, metrics, contracts, announcements, entities, and account actions.
  - Groups results into `Municipalities`, `Parishes`, `Metrics`, `Contracts`, `Announcements`, `Entities`, and `Account`.
  - Shortcut labels include `Go`, `Metric`, `Open`, `Account`, and `Route`.
  - Route shortcuts include `Open Public Contracts` and `Open Rankings`.
- Feedback button:
  - Opens a suggestion/dataset-request surface.
  - Fields are oriented around asking for new datasets or giving product feedback.
- Language selector:
  - Shows current locale, e.g. `PT`.
- Theme segmented buttons:
  - `Light`
  - `Dark`
  - `System`
- Account/workspace button:
  - `Sign in`
  - Opens account modal or user workspace depending on state.
- User workspace modal navigation:
  - `Favourites`
  - `Saved contracts`
  - `Alert rules`
  - `Notifications`
  - `Settings`
  - `Terms`
  - `Privacy`
  - `Cookies`
  - `Methodology`
  - `Fact sheet`
- Cookie consent:
  - `Accept`
  - `Reject`
  - Link to cookie policy.

### Map Shell Toggles

- Geography mode:
  - `Municipalities`
  - `Parishes`
  - App copy explains municipality mode as an aggregated score from parish data, while parish mode uses official parish boundaries.
- Main map visual mode:
  - `Single Layer`
  - `Multi Layer`
- Map legend:
  - `Quality of Life (QoL)`
  - `Stress` to `Calm`
  - 0-100 score badge in app labels.
- Map menu controls:
  - Show/hide layers.
  - Show/hide filters/weights.
  - Show/hide rankings.
  - Show/hide comparison.
  - Open/hide chat.
  - Add selected municipality to comparison.
- Right rail on the public explorer:
  - `Layers`
  - `Weights`
  - `Rankings`
  - `Chat`
- Additional rail/action labels present in the app bundle:
  - `Insights`
  - `Compare`
  - `Intel`
  - `Alerts`
  - `Cases`
  - `Control Tower`
  - `Network`
  - `Modifications`
  - `Spend vs Outcome`
  - `Watchlists`

### Multi-Layer Builder

- Toggle between:
  - `Single Layer`
  - `Multi Layer`
- Multi-layer boolean controls:
  - `AND`
  - `OR`
- Layer actions:
  - `Add layer`
  - `Select metric...`
  - `Remove layer`
  - `Layer`
  - `Value`
  - `Loading INE data...`
- Match status labels:
  - `Matches all criteria`
  - `Does not match`
  - `Does not match all criteria`
  - `{count} of {total} layers`
  - `{count}/{max}`

### Layers Drawer: `Layers`

- Search and mode controls:
  - `Search metrics...`
  - `Composite scoring mode`
  - `Composite score`
  - `Show composite`
  - `National averages`
- Metric state:
  - Select one metric to render an individual choropleth.
  - Selecting the same metric again or selecting composite returns to composite mode.
- External catalogue navigator:
  - `INE catalogue`
  - `Beyond the registry`
  - `Search the INE catalogue...`
  - Live-fetched INE indicators are session-limited.
- Category accordion/card navigator:
  - `Safety`
  - `Economy`
  - `Housing`
  - `Health`
  - `Environment`
  - `Infrastructure`
  - `Education`
  - `Leisure`
  - `Demographics`
  - `Tourism`
  - `Social Protection`
  - `Composite`
  - `Other`

### Weights Drawer: `Weights`

- Purpose:
  - Same metric taxonomy as `Layers`, but used to enable/disable metrics and adjust scoring weights.
- Header/state controls:
  - Active profile, e.g. `Explorer`.
  - `Custom`
  - `Reset`
  - `Reset to profile`
  - `Average score`
  - Active layer count, e.g. `32 active · 175 layers in total`.
- Search:
  - `Search layers...`
  - Results count labels.
  - Empty state: no layers found / try another search.
- Bulk controls:
  - `Select all`
  - `Deselect all`
- Per-metric controls:
  - `Weight`
  - `off`
  - percent weights
  - `★ highlight`
- Profile selector controls:
  - `Active`
  - `Edited`
  - `Profile details`
  - `Reset`
  - `Reset {profile} defaults`
  - `Copy profile link`
  - Footer explains profiles adjust scoring weights and can be fine-tuned in the filters panel.

### Rankings Drawer

- Controls:
  - `Municipality ranking`
  - `Full ranking`
  - `Category`
  - `All`
  - `Sort by`
  - `Overall QoL score`
  - `Minimum data coverage`
  - `Higher is better`
  - `Lower is better`
  - `Profile highlights`
  - `Top 10`
  - `Bottom 10`
- Interaction:
  - Clicking any ranked municipality focuses it on the map.
  - Rankings inherit the active profile/weights and selected category/sort metric.

### Metric Insights / Advanced Analysis Navigator

- Entry point:
  - `Open advanced analysis`
  - Legacy label: `View chart with the listed locations`
- Main tabs:
  - `Table`
  - `Trends`
  - `Top`
  - `Bottom`
  - `Around`
  - `selected`
- Table/chart actions:
  - `Add to chart`
  - `Focus on map`
  - `Remove`
  - `Export`
  - Select locations to display.
  - Search municipality.
- Chart panels:
  - `Chart (view and export)`
  - `Comparison (view and export)`
  - Historical trend or current-value comparison if history is missing.
- Hospital-specific navigator:
  - `Hospital layer`
  - `Emergency`
  - `Triage`
  - `Beds`
  - `Consultations`
  - Search hospital or municipality.
  - Sum/median national overview.
- Primary-care-specific navigator:
  - `Primary care layer`
  - `ACES/ULS`
  - `Registered patients`
  - `Without a doctor`
  - `With a family doctor`
  - `Without a doctor by choice`
  - Selected entity trend vs national trend.

### Map Cards / Widgets

- Floating cards observed:
  - `Latest updates`
  - `Recent INE datasets`
  - `Best QoL scores`
  - `Worst QoL scores`
  - `Biggest improvements`
  - `Biggest deteriorations`
  - `Key indicators`
  - `Did you know?`
- Card actions:
  - Open INE catalogue.
  - Click dataset update.
  - Click ranked municipality.
  - Sign in to follow favourite municipalities.
- Card customization labels in app bundle:
  - `Customise map cards`
  - `Select all`
  - `Clear`
  - `Save preferences`
  - Cards appear when a metric is focused and favourite municipalities exist.

### Compare Modal Navigator

- Empty-state navigator:
  - `First municipality`
  - `Second municipality`
  - `Swap municipalities`
  - Search municipality.
  - Quick picks.
- Once two municipalities are selected:
  - Sidebar title: `Compare`
  - Sidebar subtitle: `Section by section`
- Compare sections:
  - `Overview`
  - `Safety`
  - `Families`
  - `Health`
  - `Housing and cost`
  - `Economy and work`
  - `Public investment`
  - `Environment and mobility`
  - `People and society`
  - `All datasets`
- Normalisation segmented control:
  - `Absolute`
  - `Rate per 1000`
- Category overview controls:
  - `Previous`
  - `Next`
  - Metric leaders.
  - National average.
- Public investment compare panel:
  - `Contracts and procurement activity`
  - Contract type mix.
  - 1-month momentum.
  - Contracts signed.
  - Announcements published.
  - Awarded value.
  - Matched-announcements rate.
  - Award value per resident.
  - Contracts/announcements per 10k residents.

### Area Detail Navigator

- Tabs:
  - `Overview`
  - `Nomad`
  - Scroll left/right tab controls.
- Category tabs:
  - `Safety`
  - `Economy`
  - `Housing`
  - `Health`
  - `Environment`
  - `Infrastructure`
  - `Education`
  - `Leisure`
  - `Demographics`
  - `Tourism`
  - `Elections`
  - `Social Protection`
  - `Composite`
- Overview sections:
  - Score breakdown.
  - Scoring lens.
  - Historical trend.
  - Data sources.
  - Data confidence.
  - Recent public investment.
  - Recent contracts.
  - Recent announcements.
- Per-metric card controls:
  - Select metric on map.
  - Show source locations.
  - View migrations map.
  - Show calculation details.
- Public-investment subnavigator inside categories:
  - Public investment.
  - Variation.
  - National average per resident.
  - Investment per resident.
  - Category score.
  - Correlation.
  - Related public investment.
  - Groups: construction, cleaning/waste/water, security, IT, transport, culture/leisure, health, education.

### Migrations Workspace Navigator

- Top controls:
  - `Period`
  - `Metric`
  - `Direction`
  - `Map view`
  - `Connections`
- Direction segmented control:
  - `Immigration`
  - `Emigration`
- Map view segmented control:
  - `Total`
  - `% of total`
  - `Growth`
  - `World map`
- Connection mode:
  - `Top {count}`
  - `All`
- Search:
  - Search origin country/territory.
  - Search destination country.
- Insight drawer controls:
  - `Open insights`
  - `Close insights`
  - `Clear selection`
- Immigration panels:
  - Top origins.
  - Origin table.
  - Gender split.
  - Continent composition.
  - Fastest growth.
  - Top permits.
  - PORDATA context.
  - Migration context.
  - Did-you-know cards.
- Emigration mode controls:
  - `Inflows`
  - `Born in Portugal`
  - `Remittances`
  - Top destinations.
  - Destination countries.
- Cross-link:
  - `View on the municipal map`

### Contracts Workspace Navigator

- Contracts map rail:
  - `Table`
  - `Alerts`
  - `Network`
  - `Modifications`
  - `Chat`
- Contracts menu labels:
  - Show/hide rankings.
  - Open table.
  - Open/hide chat.
- Contracts area drill-down sections:
  - Contract overview.
  - Yearly spending.
  - Monthly spending.
  - Money flow.
  - Buyers.
  - Top buyers.
  - Top suppliers.
  - Type distribution.
  - Latest contracts.
  - Latest modifications.
  - Latest announcements.
  - AI analysis.
- Contracts dashboard/account controls:
  - My municipalities.
  - Recent activity.
  - Momentum highlights.
  - Open full workspace.
  - Open details.

### Contracts Table Modal Navigator

- Main tabs:
  - `Contracts`
  - `Announcements`
  - `Modifications`
  - `Entities`
- Display density:
  - `Comfortable`
  - `Compact`
- Search and filters:
  - `Filter`
  - Search by name, origin ID, NIF, or status.
  - Search CPV categories.
  - All CPV categories.
  - All municipalities.
  - All parishes.
  - Reset.
- CPV presets:
  - Construction/public works.
  - IT/software services.
  - Security/surveillance.
  - Cleaning/waste.
  - Transport/mobility.
  - Education/training.
  - Health/medical material.
  - Culture/sport/recreation.
- Pagination:
  - `Previous`
  - `Next`
  - Page count with plus sign when truncated.
- Advanced filters:
  - Published from/to.
  - Min/max value.
  - Status.
  - Procedure type.
  - Contract type.
  - Buyer.
  - Supplier.
  - Has announcement: all/yes/no.
  - Deadline from/to.
  - Entity.
  - Model.
  - Act type.
  - Unmatched only.
  - Minimum contracts.
  - Minimum announcements.
  - Updated from/to.
  - Reset advanced filters.

### Contracts Detail Navigator

- Detail panel types:
  - Contract details.
  - Announcement details.
  - Entity details.
- Contract actions/fields:
  - Open linked announcement.
  - Contract events.
  - Buyer and supplier buttons.
- Announcement actions/fields:
  - Official PDF.
  - Procedure documents.
  - Linked contracts.
- Entity sections:
  - Contracts.
  - Contract amount.
  - Announcements.
  - Announcement amount.
  - Recent contracts.
  - Recent announcements.

### Contracts Rankings Navigator

- Dataset selector:
  - `Contracts`
  - `Announcements`
  - `Entities`
- Scope selector:
  - `Country`
  - `Municipality`
  - `Parish`
- Metric selector:
  - `Amount`
  - `Count`
- Lists:
  - `Top 10`
  - `Bottom 10`

### Network Graph Navigator

- Header metrics:
  - Contracts.
  - Direct awards.
  - Modifications.
- Toolbar:
  - `Buyers`
  - `Suppliers`
  - Back.
  - Forward.
  - Clear focus.
  - Overview.
  - Search entity.
  - Entity filter.
  - Overview filter.
  - Municipality scope.
  - Clear municipality scope.
  - Zoom in.
  - Zoom out.
  - Fit.
- Entity detail tabs:
  - `All`
  - `With direct awards`
  - `With modifications`
- Relationship detail tabs:
  - `All`
  - `Direct award`
  - `Modified`
- Network filters:
  - Smart.
  - All links.
  - Top 10/20 by value.
  - Top 10/20 by frequency.
  - Active in the last 12 months.
  - Buyers only.
  - Suppliers only.
  - High dependency.
  - Cluster relationships.
  - Multiple municipalities.
  - Above EUR 1M.
  - Above EUR 100K.
  - Repeated contracts.
  - Direct-award dominant.
  - With modifications.
  - Overview all.
  - Overview smart.
  - Top hubs.
  - Top by value.
  - Repeated relationships.
  - Core network.
  - Recent activity.

### Alerts, Watchlists, Cases, Dossiers

These controls appear in the app label set and some are sign-in gated in the public UI.

- Alert rules:
  - Create, edit, save, delete alert rules.
  - In-app and email notification modes.
  - Dataset alerts.
  - Dataset search by name, key, or source.
- Watchlists:
  - Create list.
  - Add item.
  - Remove item.
  - Digest view.
  - Digest cadence: daily, weekly, monthly, none.
  - Entity types: municipality, supplier, entity, CPV category.
- Caseboard:
  - Status filter: all, open, in progress, resolved, archived.
  - Priority filter: critical, high, medium, low.
  - Pagination.
  - Columns: case, priority, status, source, items, findings, updated.
- Case detail:
  - Ask AI.
  - Hypothesis.
  - Linked alerts.
  - Evidence.
  - Findings.
  - Notes.
- Dossier tabs:
  - `Summary`
  - `Procurement`
  - `Alerts`
  - `Elections`
  - `Peers`
  - `AI Briefing`
- Report dialog:
  - Generate report.
  - Generic report.
  - Custom report.
  - Edit request.
  - Export PDF.
  - Export JSON.
- Spend vs outcome overlay:
  - Choose CPV category.
  - Choose territorial indicator.
  - Compare spend vs result.
  - Shows Pearson correlation and top-by-spend table.

## Full Visible Layer Inventory

This section is the observed `Layers` drawer taxonomy. Units are shown where the UI exposed them.

### Safety (21)

- Total crime - per 1000
- Crimes against physical integrity - per 1000
- Bag-snatching/robbery in public places - per 1000
- Theft of and from motor vehicles - per 1000
- Driving with blood alcohol level >= 1,2 g/l - per 1000
- Driving without a licence - per 1000
- Crimes against property - per 1000
- Total crimes - count
- Bodily harm offences - count
- Crimes against life in society - count
- Crimes against persons - count
- Crimes against the State - count
- Crimes of offence against physical integrity - count
- Miscellaneous legislation - count
- Domestic violence against spouse/equivalent - count
- Driving with alcohol >= 1,2 g/l - count
- Driving without a licence - count
- Theft of and from vehicles - count
- Bag-snatching/robbery in public places - count
- Crimes against property - count
- Crimes per 1000 residents (Pordata) - per 1000

### Economy (23)

- Coworking access proxy - score
- Connectivity quality proxy - score
- Public investment momentum - score
- Contracts per 10k residents - contracts/10k
- Announcements per 10k residents - announcements/10k
- Awarded value per resident (12m) - €/resident
- Rate of announcements with a contract (12m) - %
- Purchasing power per capita - index
- Registered unemployment (total) - count
- Registered unemployment (men) - count
- Registered unemployment (women) - count
- Registered unemployment (< 1 year) - count
- Registered unemployment (1+ year) - count
- Registered unemployment (first job) - count
- Registered unemployment (new job) - count
- Non-financial companies (Pordata) - count
- Staff employed in companies (Pordata) - count
- Staff in the 4 largest companies (Pordata) - %
- Turnover of the 4 largest companies (Pordata) - %
- Banks (Pordata) - count
- Agricultural credit banks (Pordata) - count
- ATMs (Pordata) - count
- Local Public Administration workers (Pordata) - count

### Housing (8)

- Mortgage credit pressure - %
- Purchase price (€/m²) - €/m²
- Rental price (€/m²) - €/m²
- Purchase affordability stress - %
- Rental affordability stress - %
- Number of new construction permits (last 3 months) - count
- Median bank valuation value (Pordata) - €/m²
- New residential buildings (Pordata) - count

### Health (10)

- SNS emergency visits (monthly) - episodes
- SNS yellow/red triage - %
- SNS bed occupancy rate - %
- SNS specialist appointments within adequate time - %
- SNS patients with an assigned family doctor - %
- Distance to hospital - km
- Hospital coverage ≤15km - %
- Infant mortality rate (Pordata) - ‰
- Hospitals (Pordata) - count
- Pharmacies (Pordata) - count

### Environment (16)

- Average temperature (annual) - °C
- Days of climate comfort (annual) - %
- Days of heat risk (annual) - %
- Days without rain (annual) - %
- PM2.5 (24h average) - µg/m³
- European AQI (24h average) - AQI
- PM2.5 (daily maximum) - µg/m³
- European AQI (daily maximum) - AQI
- Water losses - m3
- Electricity per capita (Pordata) - kWh
- Separated waste per capita (Pordata) - kg
- Municipal environment spending per capita (Pordata) - €
- Safe water (ERSAR) - %
- Population served (ERSAR) - residents
- Supply zones (ERSAR) - count
- Water volume/day (ERSAR) - m³/dia

### Infrastructure (13)

- Distance to airport - km
- Airport coverage ≤50km - %
- Travel time to airport (estimated) - min
- Distance to motorway - km
- Distance to main road - km
- Distance to railway station - km
- Travel time to station (estimated) - min
- Multimodal mobility coverage - %
- Railway station density - per 10k
- Download speed (median) - Mbps
- Upload speed (median) - Mbps
- Mobile coverage / quality - %
- Fixed broadband coverage - %

### Education (14)

- Higher education density - per 10k
- Gross enrolment rate, basic education - %
- Gross enrolment rate, secondary education - %
- Retention/dropout rate - %
- Transition/completion rate - %
- Pre-school establishments (Pordata) - count
- 1st cycle schools (Pordata) - count
- 2nd cycle schools (Pordata) - count
- 3rd cycle schools (Pordata) - count
- Secondary schools (Pordata) - count
- Non-higher education students (Pordata) - count
- Higher education institutions (Pordata) - count
- Higher education students (Pordata) - count
- Adults with at least completed secondary education - %

### Leisure (18)

- Parks and green spaces - count
- Presence of green spaces - %
- Distance to cinema - km
- Distance to theatre - km
- Distance to the beach - km
- Distance to cultural facility - km
- Distance to sports venue - km
- Coastal leisure coverage ≤25km - %
- Leisure diversity - score
- Parks per capita - per 10k
- Cinema density - per 10k
- Theatre density - per 10k
- Cultural facilities density - per 10k
- Sports venue density - per 10k
- Museums (Pordata) - count
- Live performance sessions (Pordata) - count
- Cinema screens (Pordata) - count
- Municipal spending on culture and sport (Pordata) - € thousands

### Demographics (18)

- Population density - residents/km²
- Foreign residents - count
- Share of foreign residents - %
- Time zone compatibility (EU/US) - score
- Net migration - count
- Dependency ratio - %
- Resident population (Pordata) - people
- Area (Pordata) - km²
- Parishes (Pordata) - count
- Young people (Pordata) - %
- Working-age population (Pordata) - %
- Elderly (Pordata) - %
- Ageing index (Pordata) - per 100
- Births (Pordata) - count
- Deaths (Pordata) - count
- Natural balance (Pordata) - count
- Marriages (Pordata) - count
- Divorces (Pordata) - count

### Tourism (10)

- Tourist overnight stays - count
- Tourist guests - count
- Accommodation capacity (beds) - beds
- Occupancy rate — Total (INE) - %
- Occupancy rate — Hotels (INE) - %
- Occupancy rate — Local lodging (INE) - %
- Occupancy rate — Rural tourism (INE) - %
- Tourist intensity (overnight stays/resident) - ratio
- Tourist density (overnight stays/km²) - per km²
- Tourist accommodations (Pordata) - count

### Social Protection (5)

- Pensioners per 1000 residents - per 1000
- Social security beneficiaries - count
- Social Security pensions (Pordata) - count
- CGA pensions (Pordata) - count
- RSI beneficiaries (Pordata) - count

### Composite (1)

- Municipal Resilience - score

### Other / Procurement-Derived (18)

- Investment in construction (CPV 45) - €
- Investment in construction per resident - €/resident
- Investment in cleaning/waste/water (CPV 90/651) - €
- Investment in cleaning per resident - €/resident
- Investment in security (CPV 797/351) - €
- Investment in security per resident - €/resident
- Investment in IT (services, software, equipment) - €
- Investment in IT per resident - €/resident
- Investment in transport (services, vehicles, support) - €
- Investment in transport per resident - €/resident
- Investment in culture/leisure (CPV 92/37) - €
- Investment in culture per resident - €/resident
- Investment in health/medical (CPV 33/851) - €
- Investment in health per resident - €/resident
- Investment in education/training (CPV 80/3916/4819) - €
- Investment in education per resident - €/resident
- Contracts with modifications (%) - %
- Average price increase per modification (%) - %

## Lessons For An Australian/Melbourne Version

Recommended IA to adapt:

- Open directly into the map/search product, not a marketing landing page.
- Keep one persistent map shell.
- Use top-level simple buckets, but expose a richer taxonomy inside the layer drawer.
- Treat scoring as editable: same indicator taxonomy should power map layer selection, score weighting, ranking, and comparison.
- Make source/provenance metadata visible at the indicator level.
- Use place profiles as layered panels: overview, category tabs, trends, sources, and caveats.
- Make comparison editorial: profile scores, narrative summary, trends, and all-indicator table.
- Treat public contracts/procurement as both:
  - a standalone workspace, and
  - a derived indicator family feeding economy/public-investment signals.
- If procurement is not available for Melbourne v1, design the slot now and keep it disabled or labelled future.

Melbourne v1 equivalent structure:

- Top nav:
  - `Explorer`
  - `Statistics`
  - `Migration / Demographics`
  - `Public Spending`
  - `Compare`
- Right rail:
  - `Layers`
  - `Weights`
  - `Rankings`
  - `Chat` or `Ask`
- Core statistical buckets:
  - `Housing & Cost`
  - `Transport & Access`
  - `Safety`
  - `Health & Education`
  - `People & Environment`
  - `Composite Scores`
- Place profile tabs:
  - `Overview`
  - `Renters`
  - `Families`
  - `Commuters`
  - `Students`
  - Category tabs
- Compare sections:
  - `Overview`
  - `Safety`
  - `Housing & Cost`
  - `Transport`
  - `Schools & Services`
  - `Environment`
  - `People & Demographics`
  - `All indicators`

Key design decision for Australia:

- Analisa is municipality-first because Portugal has 308 municipalities.
- Melbourne should probably be SA2/suburb-first for user usefulness, with LGA/council retained as a filter and aggregation layer.
