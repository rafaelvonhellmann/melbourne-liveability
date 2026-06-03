import { sunAspect } from "@/lib/sun";

/**
 * Honest sun-path diagram (NOT a 3D shadow map - that would over-promise without
 * building heights / tree data). A simple side-on sky dome at the pin's latitude:
 * the high gold arc is the summer sun, the low dashed arc is winter. Peak height =
 * solar-noon elevation; arc width tracks day length. Replaces the WSW/degrees copy
 * that confused buyers. Pure + deterministic from latitude (lib/sun).
 */
export function SunPathDiagram({ lat }: { lat: number }) {
  const sun = sunAspect(lat);
  const W = 300;
  const H = 168;
  const horizonY = 130;
  const topPad = 18;
  const left = 30;
  const right = 270;
  const cx = (left + right) / 2;

  const elToY = (el: number) =>
    horizonY - (Math.max(0, Math.min(90, el)) / 90) * (horizonY - topPad);
  const halfWidth = (hours: number) =>
    Math.min((right - left) / 2, (Math.max(0, hours) / 15) * 110);

  function arc(el: number, hours: number) {
    const peakY = elToY(el);
    const hw = halfWidth(hours);
    const x0 = cx - hw;
    const x1 = cx + hw;
    // Quadratic through (x0,horizon) -> peak at (cx,peakY) -> (x1,horizon):
    // control-point y = 2*peak - horizon makes the curve crest exactly at peakY.
    const cpY = 2 * peakY - horizonY;
    return { d: `M ${x0} ${horizonY} Q ${cx} ${cpY} ${x1} ${horizonY}`, peakY };
  }

  const summer = arc(sun.summer.noonElevation, sun.summer.dayHours);
  const winter = arc(sun.winter.noonElevation, sun.winter.dayHours);
  const sunSide = sun.sunSide === "north" ? "north" : "south";
  const summerEl = Math.round(sun.summer.noonElevation);
  const winterEl = Math.round(sun.winter.noonElevation);
  const summerH = Math.round(sun.summer.dayHours);
  const winterH = Math.round(sun.winter.dayHours);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Sun path at this latitude. In summer the midday sun reaches about ${summerEl} degrees above the horizon with roughly ${summerH} hours of daylight; in winter about ${winterEl} degrees and ${winterH} hours. The sun sits to the ${sunSide}.`}
    >
      {/* ground */}
      <rect x="0" y={horizonY} width={W} height={H - horizonY} fill="#EFEAE2" />
      <line x1={left - 8} y1={horizonY} x2={right + 8} y2={horizonY} stroke="#C7BFB2" strokeWidth="1.5" />

      {/* winter (low, dashed) + summer (high) sun paths */}
      <path d={winter.d} fill="none" stroke="#9A552F" strokeWidth="2" strokeDasharray="4 3" />
      <path d={summer.d} fill="none" stroke="#E6AB02" strokeWidth="2.5" />

      {/* noon sun positions */}
      <circle cx={cx} cy={summer.peakY} r="6" fill="#E6AB02" />
      <circle cx={cx} cy={winter.peakY} r="5" fill="#9A552F" />

      {/* labels - east/west are always true; the confusing fine compass is dropped */}
      <text x={cx} y="12" textAnchor="middle" fontSize="10" fill="#6B6256">
        midday sun (to the {sunSide})
      </text>
      <text x={left - 8} y={horizonY + 14} textAnchor="start" fontSize="9.5" fill="#6B6256">
        sunrise · E
      </text>
      <text x={right + 8} y={horizonY + 14} textAnchor="end" fontSize="9.5" fill="#6B6256">
        sunset · W
      </text>
      <text x={cx + 12} y={summer.peakY - 4} textAnchor="start" fontSize="9.5" fill="#9A6A12">
        summer ~{summerEl}°, {summerH}h
      </text>
      <text x={cx + 12} y={winter.peakY - 4} textAnchor="start" fontSize="9.5" fill="#9A552F">
        winter ~{winterEl}°, {winterH}h
      </text>
    </svg>
  );
}
