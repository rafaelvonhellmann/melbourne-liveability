<!--
Source: DesignMD reverse-engineered extraction of the LIVE deployed site
https://designmd.me/s/rafaelvonhellmann-gi-yuz2g (generated 2026-06-03).

This is an AUTO-EXTRACTED snapshot of what the deployed liveable.melbourne site
renders. The hand-authored source-of-truth design spec is DESIGN.md (companion to
ULTRAPLAN.md, with the design tokens + "color is a data channel" cardinal rule).
Kept as a companion so the as-built system can be diffed against the intended one;
DESIGN.md remains authoritative.
-->

# Design System Inspired by liveable.melbourne

## 1. Visual Theme & Atmosphere

The liveable.melbourne design system embodies a data-driven, approachable aesthetic grounded in trust and clarity. It combines warm, earthy tones with sophisticated data visualization to make complex liveability information accessible to everyday property seekers. The visual language prioritizes legibility over ornament, using generous whitespace and a refined neutral palette punctuated by intentional accent colors that map to real-world contexts (green for positive outcomes, rust tones for caution, deep teals for information). The design evokes a sense of informed confidence—you're exploring data that matters for life decisions—while maintaining a friendly, unpretentious tone befitting a community-focused, open-data initiative.

**Key Characteristics**
- Warm, approachable minimalism with earthy accent colors
- High contrast typography for readability on data-dense layouts
- Generous whitespace supporting cognitive clarity
- Soft shadows and rounded corners balancing warmth with professionalism
- Semantic color use tied to data meaning (risk, benefit, neutral)
- Accessible interactions with clear visual affordance
- Map-centric layout with data panels as secondary focal points

## 2. Color Palette & Roles

### Primary

- **Brand Dark** (`#1A1A18`): Primary text, headings, and core UI element text; conveys authority and readability
- **Brand Light** (`#FAF9F5`): Primary background for cards, buttons, and surfaces; creates breathing room and warmth

### Accent Colors

- **Rust** (`#AD4F2E`): Primary accent for interactive elements, CTAs, and high-priority states; suggests caution and importance
- **Forest Green** (`#117733`): Success, positive liveability indicators, and map layer visualization; represents wellbeing
- **Teal** (`#0E7C86`): Informational elements and secondary accent; adds depth without competing with primary accent
- **Warm Brown** (`#9A552F`): Tertiary accent for supporting data and secondary interactive states
- **Deep Blue** (`#377EB8`): Data category highlight, educational markers, and specialized layers
- **Deep Magenta** (`#6A3D9A`): Category distinction for education and specialized data points

### Interactive

- **Danger** (`#E31A1C`): Error states, risk warnings, and critical information markers
- **Alert** (`#CC4C02`): High-priority warnings and attention states
- **Warning** (`#E6AB02`): Caution indicators and secondary warnings

### Neutral Scale

- **Text Primary** (`#1A1A18`): Body text, labels, and interactive copy; maximum contrast
- **Text Secondary** (`#6B6862`): Subtle text, helper copy, disabled states, and low-emphasis content
- **Border Light** (`#E3DFD3`): Subtle borders, dividers, and container edges
- **Border Standard** (`#E5E7EB`): Standard borders for inputs, cards, and interactive elements

### Surface & Borders

- **Surface Primary** (`#FAF9F5`): Main card background, button defaults, and elevated surfaces
- **Surface Elevated** (`#FFFFFF`): Highest elevation for modals, popovers, and overlays
- **Surface Neutral** (`#F3F1E9`): Alternative surface for subtle differentiation and grouped content

## 3. Typography Rules

### Font Family

**Primary Font:** Fraunces (serif)
Fallback stack: `'Fraunces', 'Georgia', 'Times New Roman', serif`
Used for: Display, headings, and brand-forward copy that conveys editorial authority.

**Secondary Font:** Inter (sans-serif)
Fallback stack: `'Inter', 'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif`
Used for: Body text, UI labels, buttons, and forms for optimal legibility at small sizes and dense layouts.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|-----------------|-------|
| Display / H1 | Fraunces | 28px | 600 | 36px | 0px | Headline for welcome modals and page introductions |
| Heading / H2 | Fraunces | 20px | 600 | 28px | 0px | Section headings and card titles |
| Subheading | Fraunces | 18px | 500 | 28px | 0px | Lens labels and featured copy |
| Label / H3 | Inter | 11px | 600 | 16.5px | 0.5px | Component labels, category tags, and UI chrome |
| Button / CTA | Inter | 16px | 400 | 24px | 0px | Actionable buttons and call-to-action text |
| Body / Copy | Inter | 14px | 400 | 20px | 0px | Paragraph text, form fields, and general content |
| Caption | Inter | 12px | 600 | 16px | 0.3px | Helper text, legends, and secondary labels |
| Small / Fine Print | Inter | 11px | 400 | 16.5px | 0px | Disclaimers, footnotes, and tertiary information |

### Principles

- **Serif for authority:** Fraunces conveys editorial trust and data significance; reserve for heading hierarchy and brand moments.
- **Sans for clarity:** Inter provides legibility in dense data contexts and user input scenarios.
- **Contrast-driven:** Text colors maintain WCAG AA contrast minimum; secondary text uses `#6B6862` on light surfaces only.
- **Line height generosity:** Body and button text receive 1.4–1.5x multipliers to support scanning and reduce cognitive load.
- **Weight hierarchy:** Bold (600) for labels and section heads; regular (400) for body; medium (500) for subheadings and emphasized copy.

## 4. Component Stylings

### Buttons

**Primary Button**
- Background: `#FAF9F5`
- Text Color: `#1A1A18`
- Font Size: `16px`
- Font Weight: `400`
- Font Family: `Inter`
- Padding: `12px 16px`
- Border Radius: `6px`
- Border: `1px solid #E3DFD3`
- Box Shadow: `rgba(40, 35, 25, 0.08) 0px 1px 3px 0px, rgba(40, 35, 25, 0.06) 0px 8px 24px 0px`
- Line Height: `24px`
- Min Height: `44px`
- Hover State: Background `#F3F1E9`, Border `#6B6862`
- Active State: Background `#E3DFD3`, Text `#1A1A18`
- Disabled State: Background `#FAF9F5`, Text `#6B6862`, Opacity `0.5`

**Secondary Button (Outline)**
- Background: `rgba(0, 0, 0, 0)`
- Text Color: `#1A1A18`
- Font Size: `14px`
- Font Weight: `400`
- Font Family: `Inter`
- Padding: `6px 12px`
- Border Radius: `6px`
- Border: `1px solid #E3DFD3`
- Box Shadow: `none`
- Line Height: `20px`
- Min Height: `34px`
- Hover State: Background `#FAF9F5`, Border `#1A1A18`
- Active State: Background `#E3DFD3`

**Pill Button (Tag/Lens Selector)**
- Background: `#FAF9F5`
- Text Color: `#1A1A18`
- Font Size: `14px`
- Font Weight: `500`
- Font Family: `Inter`
- Padding: `6px 14px`
- Border Radius: `9999px`
- Border: `1px solid #E3DFD3`
- Box Shadow: `rgba(40, 35, 25, 0.08) 0px 1px 3px 0px, rgba(40, 35, 25, 0.06) 0px 8px 24px 0px`
- Line Height: `20px`
- Min Height: `34px`
- Active State: Background `#AD4F2E`, Text `#FFFFFF`, Border `#AD4F2E`
- Hover State: Background `#F3F1E9`, Border `#6B6862`

**Ghost Button (Map Action)**
- Background: `rgba(0, 0, 0, 0)`
- Text Color: `#6B6862`
- Font Size: `16px`
- Font Weight: `400`
- Font Family: `Inter`
- Padding: `0px`
- Border Radius: `0px`
- Border: `none`
- Box Shadow: `none`
- Line Height: `24px`
- Hover State: Text Color `#1A1A18`, Background `rgba(250, 249, 245, 0.5)`
- Active State: Text Color `#AD4F2E`

### Cards & Containers

**Primary Card**
- Background: `#FAF9F5`
- Text Color: `#1A1A18`
- Font Size: `16px`
- Font Weight: `400`
- Font Family: `Inter`
- Padding: `24px`
- Border Radius: `16px`
- Border: `1px solid #E3DFD3`
- Box Shadow: `rgba(40, 35, 25, 0.08) 0px 1px 3px 0px, rgba(40, 35, 25, 0.06) 0px 8px 24px 0px`
- Line Height: `24px`
- Min Height: `auto`

**Modal/Overlay Card**
- Background: `#FFFFFF`
- Text Color: `#1A1A18`
- Font Size: `16px`
- Font Weight: `400`
- Font Family: `Inter`
- Padding: `24px`
- Border Radius: `12px`
- Border: `none`
- Box Shadow: `rgba(0, 0, 0, 0.15) 0px 10px 40px 0px`
- Line Height: `24px`

**Tooltip / Hint Card**
- Background: `rgba(250, 249, 245, 0.95)`
- Text Color: `#6B6862`
- Font Size: `12px`
- Font Weight: `600`
- Font Family: `Inter`
- Padding: `6px 12px`
- Border Radius: `10px`
- Border: `1px solid #E3DFD3`
- Box Shadow: `rgba(40, 35, 25, 0.08) 0px 1px 3px 0px, rgba(40, 35, 25, 0.06) 0px 8px 24px 0px`
- Line Height: `16px`
- Max Width: `224px`

### Inputs & Forms

**Text Input Default**
- Background: `#FFFFFF`
- Text Color: `#1A1A18`
- Font Size: `14px`
- Font Weight: `400`
- Font Family: `Inter`
- Padding: `10px 12px`
- Border Radius: `6px`
- Border: `1px solid #E5E7EB`
- Box Shadow: `none`
- Line Height: `20px`
- Min Height: `40px`
- Placeholder Color: `#6B6862`
- Focus State: Border `#AD4F2E`, Box Shadow `0px 0px 0px 3px rgba(173, 79, 46, 0.1)`
- Error State: Border `#E31A1C`, Background `#FFFFFF`, Box Shadow `0px 0px 0px 3px rgba(227, 26, 28, 0.08)`

**Text Input with Label**
- Label Font Size: `11px`
- Label Font Weight: `600`
- Label Color: `#1A1A18`
- Label Margin Bottom: `4px`
- Label Font Family: `Inter`

**Search Input**
- Background: `#FFFFFF`
- Text Color: `#1A1A18`
- Font Size: `14px`
- Font Weight: `400`
- Font Family: `Inter`
- Padding: `12px 16px`
- Border Radius: `6px`
- Border: `1px solid #E5E7EB`
- Box Shadow: `none`
- Line Height: `20px`
- Min Height: `44px`
- Placeholder Color: `#6B6862`

**Checkbox / Radio**
- Size: `16px × 16px`
- Background: `#FFFFFF`
- Border: `1px solid #E5E7EB`
- Border Radius: `4px` (checkbox), `9999px` (radio)
- Checked Background: `#AD4F2E`
- Checked Border: `#AD4F2E`
- Focus Ring: `0px 0px 0px 3px rgba(173, 79, 46, 0.1)`

**Range Slider**
- Track Background: `#E5E7EB`
- Track Height: `4px`
- Thumb Background: `#AD4F2E`
- Thumb Size: `18px × 18px`
- Thumb Border Radius: `9999px`
- Focus State: Box Shadow `0px 0px 0px 3px rgba(173, 79, 46, 0.1)`

### Navigation

**Top Navigation Bar**
- Background: `rgba(0, 0, 0, 0)` (transparent over map)
- Height: `60px`
- Padding: `12px 24px`
- Text Color: `#1A1A18`
- Font Size: `14px`
- Font Weight: `400`
- Font Family: `Inter`

**Navigation Link**
- Text Color: `#1A1A18`
- Font Size: `14px`
- Font Weight: `400`
- Font Family: `Inter`
- Padding: `6px 12px`
- Border Radius: `6px`
- Border: `1px solid transparent`
- Hover State: Background `#FAF9F5`, Border `#E3DFD3`
- Active State: Background `#AD4F2E`, Text `#FFFFFF`, Border `#AD4F2E`

**Sidebar Navigation (LAYERS, EXPLORE panels)**
- Background: `rgba(255, 255, 255, 0.98)` (semi-transparent)
- Text Color: `#1A1A18`
- Font Size: `12px`
- Font Weight: `600`
- Font Family: `Inter`
- Padding: `16px`
- Border: `1px solid #E5E7EB`
- Section Spacing: `16px`

### Badges

**Status Badge (Balanced, Renting, Buying, Family, Retiree)**
- Background: `#FAF9F5`
- Text Color: `#1A1A18`
- Font Size: `14px`
- Font Weight: `500`
- Font Family: `Inter`
- Padding: `6px 14px`
- Border Radius: `9999px`
- Border: `1px solid #E3DFD3`
- Active/Selected Background: `#AD4F2E`
- Active/Selected Text: `#FFFFFF`

**Lens Indicator (Green, Teal, Blue, Magenta)**
- Background: Semantic color (e.g., `#117733` for forest, `#377EB8` for education)
- Size: `12px × 12px`
- Border Radius: `2px`
- Opacity: `1.0`

### Tabs & Toggles

**Tab Button**
- Background: `rgba(0, 0, 0, 0)`
- Text Color: `#6B6862`
- Font Size: `14px`
- Font Weight: `400`
- Font Family: `Inter`
- Padding: `8px 12px`
- Border Bottom: `2px solid transparent`
- Active State: Text Color `#1A1A18`, Border Bottom `#AD4F2E`
- Hover State: Background `#FAF9F5`

## 5. Layout Principles

### Spacing System

**Base Unit:** `4px`

**Scale:**
- `4px` – Micro spacing for icon offsets and tightly grouped elements
- `8px` – Small padding for compact buttons, input fields, and nested content
- `12px` – Standard padding for form fields, small cards, and inline margins
- `16px` – Medium padding for card content and section margins
- `24px` – Large padding for main containers, card bodies, and major section separations
- `32px` – Extra large margin between major layout sections
- `48px` – Margin between major page regions
- `124px` – Large margin for map viewport breathing room and full-width sections

**Usage Context:**
- Buttons use `12px–16px` padding (symmetric)
- Cards use `24px` padding for primary content, `16px` for secondary
- Form groups use `8px–12px` vertical spacing between inputs and labels
- Sections use `32px–48px` margin between major blocks

### Grid & Container

**Max Width:** Full viewport for map contexts; `1200px` for contained content panels
**Column Strategy:**
- Mobile: Single column, full width with `16px` margin
- Tablet (768px+): Two columns with `16px` gutter
- Desktop (1024px+): Three columns with `24px` gutter where applicable; sidebar + main map is 1:3 ratio

**Section Patterns:**
- **Map + Sidebar:** Fixed left sidebar (320px–400px) with scrollable content; map fills remaining viewport
- **Modal Overlay:** Centered card (512px max width) with semi-transparent backdrop
- **Data Panel:** Right sidebar (320px) with layered sections (EXPLORE, LAYERS, LENS, PRIORITIES)

### Whitespace Philosophy

The system prioritizes breathing room to reduce cognitive load in data-dense contexts. Generous margins (`24px–48px`) separate major sections, preventing visual fatigue. Within cards and panels, content receives `24px` padding minimum, allowing focus. Interactive elements (buttons, inputs) receive `8px–12px` internal padding to ensure comfortable touch targets and legibility. Negative space is treated as active design—it clarifies hierarchy and enables confident scanning of map overlays and data layers.

### Border Radius Scale

- `0px` – Geometric, angular elements (none in primary components)
- `4px` – Tight radius for status badges and small elements
- `6px` – Buttons, secondary inputs, and compact components
- `10px` – Tooltip and floating actions
- `12px` – Modal overlays and larger surface elevations
- `16px` – Primary cards and major containers
- `9999px` – Pill buttons and fully rounded toggle controls

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat / Base | No shadow; `border: 1px solid #E3DFD3` | Map tiles, background surfaces, non-interactive elements |
| Raised / Sm | `rgba(40, 35, 25, 0.08) 0px 1px 3px 0px, rgba(40, 35, 25, 0.06) 0px 8px 24px 0px` | Cards, buttons, input fields, and standard UI elements |
| Elevated / Md | `rgba(0, 0, 0, 0.12) 0px 0px 0px 1px` + `rgba(0, 0, 0, 0.1) 0px 4px 12px 0px` | Modals, popovers, and floating panels |
| Overlay / Lg | `rgba(0, 0, 0, 0.15) 0px 10px 40px 0px` | Full-screen overlays, dropdowns, and highest-context surfaces |

**Shadow Philosophy:**
Shadows follow a subtle, warm aesthetic aligned with the earthy color palette. Rather than harsh black shadows, the system uses `rgba(40, 35, 25, ...)` (warm brown) for a cohesive feel. Elevation is sparing—most interactive elements use small shadows to hint at interactive affordance without visual clutter. Modals and overlays receive stronger elevation to signal importance and modal context. The system avoids stacked shadows; each level is single-layered for clarity and performance.

## 7. Do's and Don'ts

### Do

- **Use semantic colors intentionally.** Reserve `#AD4F2E` (rust) for primary CTAs, hover states, and active selections; use `#117733` (green) for positive liveability indicators and success states; use `#E31A1C` (danger red) only for errors and risk warnings.
- **Maintain sufficient contrast.** All text on backgrounds must meet WCAG AA standards; use `#1A1A18` on light surfaces and `#FFFFFF` on dark overlays.
- **Employ Fraunces for editorial authority.** Use serif display fonts for headings, welcome copy, and section titles to convey data significance; limit to heading hierarchy to preserve emphasis.
- **Embrace whitespace in data contexts.** Give map overlays, cards, and panels breathing room; generous padding (`24px+`) reduces cognitive load when scanning complex information.
- **Provide clear interaction feedback.** Buttons and inputs must show hover, focus, and active states; disabled states should use reduced opacity (`0.5`).
- **Scale touch targets to `44px` minimum.** Buttons, input fields, and interactive elements should be easily tappable on mobile without requiring precise targeting.
- **Use consistent border styles.** All card and input borders use `1px solid #E3DFD3` unless semantic color is required (e.g., error states with `#E31A1C`).

### Don't

- **Don't override semantic colors.** Avoid using `#E31A1C` for anything other than errors, risks, or critical information; this reserves meaning and maintains consistency.
- **Don't mix font families within a component.** Headings use Fraunces; body and UI use Inter. Switching mid-component breaks visual coherence.
- **Don't use high-opacity overlays.** Keep overlays at `rgba(..., 0.95)` or lower to maintain context; full opacity (`1.0`) is reserved for critical modals only.
- **Don't crowd interactive elements.** Maintain minimum `8px` margins between buttons, inputs, and other controls; dense layouts create accidental interactions and fatigue.
- **Don't extend shadows beyond the raised level for standard UI.** Gratuitous shadows (e.g., on every element) create visual noise; reserve strong shadows for modals and system-level overlays.
- **Don't reduce text size below `11px`.** Smaller text is unreadable in dense data contexts; use `#6B6862` secondary color for de-emphasis instead.
- **Don't use color alone to convey information.** Pair colors with icons, labels, or text patterns for accessibility; colorblind users must still parse the interface.

## 8. Responsive Behavior

### Breakpoints

| Breakpoint Name | Width | Key Changes |
|-----------------|-------|-------------|
| Mobile | 320px–479px | Single column; sidebar collapses to hamburger menu; full-width cards; buttons stack vertically; font sizes reduce by 1–2px for body text |
| Tablet | 480px–767px | Two-column layout begins; sidebar becomes collapsible overlay (50% width); cards maintain `24px` padding; button groups stack or flow to 2 per row |
| Desktop | 768px–1023px | Three-column capable; fixed left sidebar (320px); map occupies center; right data panel (320px); full typography scale active |
| Large Desktop | 1024px+ | Full layout with breathing room; sidebar fixed; expanded panels (up to 400px); max content width `1200px`; all spacing at full scale |

### Touch Targets

- **Minimum touch target:** `44px × 44px` (buttons, inputs, form controls)
- **Comfortable spacing between targets:** `8px` minimum (for mobile) to `12px` (for desktop)
- **Clickable area for icons:** Extend to `24px × 24px` minimum with padding if icon alone is smaller
- **Form inputs:** `40px` minimum height on mobile, `44px` on desktop
- **Tap zones on map:** Ensure polygon/area tap zones are at least `48px × 48px` when possible

### Collapsing Strategy

**Mobile (320px–479px):**
- Hamburger menu for navigation; sidebar collapses into overlay modal
- Full-width cards and panels
- Stack horizontal button groups vertically
- Reduce section margins to `16px–24px`
- Use `14px` body text, `12px` captions
- Modal max width: 90vw with `16px` margin

**Tablet (480px–767px):**
- Sidebar becomes collapsible toggle (50% width overlay)
- Two-column grid for related items
- Buttons: 2 per row or full-width if primary action
- Section margins: `24px–32px`
- Body text: `14px`, maintain full cap height
- Top nav becomes sticky on scroll

**Desktop (768px+):**
- Fixed left sidebar (always visible, 320px–400px)
- Three-column capable for content grids
- Buttons: horizontal grouping, 3+ per row where appropriate
- Section margins: `32px–48px`
- Full typography scale active
- Right-side data panels (320px fixed width) for contextual information

**Large Desktop (1024px+):**
- All panels fixed; map-centric layout with sidebars on left and right
- Max content width for reading: `1200px`
- Expanded spacing: `48px–124px` between sections
- Tooltips and popovers attach to viewport edges (no overflow)

## 9. Agent Prompt Guide

### Quick Color Reference

- **Primary CTA / Accent:** Rust (`#AD4F2E`) — buttons, active states, map overlays indicating caution
- **Success / Positive:** Forest Green (`#117733`) — liveability strengths, good outcomes, positive indicators
- **Information / Secondary:** Teal (`#0E7C86`) — informational overlays, secondary data highlights
- **Error / Danger:** Danger Red (`#E31A1C`) — errors, risk warnings, critical alerts
- **Warning / Caution:** Alert Orange (`#CC4C02`) — high-priority warnings, secondary alerts
- **Heading / Text:** Brand Dark (`#1A1A18`) — all primary text, labels, headings
- **Background / Surface:** Brand Light (`#FAF9F5`) — card backgrounds, button defaults, elevated surfaces
- **Overlay / Highest:** White (`#FFFFFF`) — modal overlays, popovers, topmost layers
- **Secondary Text:** Text Secondary (`#6B6862`) — helper text, disabled states, low-emphasis copy
- **Border / Divider:** Border Light (`#E3DFD3`) — all standard borders, subtle dividers

### Iteration Guide

1. **Always use `Inter` for body copy, buttons, inputs, and UI labels.** Use `Fraunces` only for display-level headings (H1, H2, Subheading) to maintain editorial authority without visual chaos.

2. **Every button must implement all four states:** default (resting), hover (background shift), active (solid color background), disabled (opacity `0.5`, text `#6B6862`). Primary buttons default to `#FAF9F5` with `#E3DFD3` border; active state is `#AD4F2E` with white text.

3. **Card padding is always `24px` minimum.** Inputs and form fields use `10px–12px` vertical padding. Buttons use `12px` minimum padding on all sides. Never compress spacing below the base scale (`4px` increments).

4. **Shadows follow the warm-brown palette:** `rgba(40, 35, 25, 0.08)` for small shadows on cards/buttons; `rgba(40, 35, 25, 0.06)` for soft ambient shadow. Modals use `rgba(0, 0, 0, 0.15)` for stronger elevation.

5. **Border radius aligns to scale:** Buttons and inputs: `6px`; main cards: `16px`; pill buttons: `9999px`; modals: `12px`. Never use arbitrary radius values.

6. **Text contrast must meet WCAG AA.** `#1A1A18` (text primary) on `#FAF9F5` (surface) is high contrast; `#6B6862` (secondary) is permissible only on light backgrounds. Use white text on `#AD4F2E` and dark colors.

7. **Interactive elements must have a min-height of `44px`** on mobile, `40px` on desktop. Touch targets for mobile must be at least `44px × 44px` with comfortable spacing (8px minimum).

8. **Responsive behavior:** At mobile breakpoints (<480px), collapse sidebars to overlays; stack button groups vertically; use full-width cards. At desktop (768px+), enable fixed sidebars and multi-column layouts. Maintain consistent `16px–24px` margin gutters.

9. **Map overlay colors are semantic:** Green for positive data, rust/brown for caution, teal for informational, red for hazards. Use opacity (0.7–0.85) for overlays to maintain map visibility. Never use pure black or white for map visualization.

10. **Focus states and accessibility:** All interactive elements (buttons, inputs, links) must show a visible focus ring (`0px 0px 0px 3px rgba(173, 79, 46, 0.1)` for rust accents). Error states use red borders + helper text; never rely on color alone.
