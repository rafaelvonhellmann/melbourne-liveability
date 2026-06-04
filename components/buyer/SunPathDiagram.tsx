import { sunAspect } from "@/lib/sun";

/**
 * Honest sun-path diagram (NOT a 3D shadow map - that would over-promise without
 * building heights / tree data). A side-on view of the sky at the pin's latitude:
 * the sun rises in the east, crosses the NORTHERN sky (in Melbourne), and sets in
 * the west; the high gold arc is summer, the low dashed arc is winter. The shaded
 * band is where the sun travels through the year. Peak = solar-noon elevation, arc
 * width tracks day length. Pure + deterministic from latitude (lib/sun). The point
 * a buyer needs - "face the sun side for light" - is spelled out in the caption.
 */
export function SunPathDiagram({ lat }: { lat: number }) {
  const sun = sunAspect(lat);
  const W = 300;
  const H = 172;
  const horizonY = 132;
  const topPad = 20;
  const left = 32;
  const right = 268;
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
    const cpY = 2 * peakY - horizonY;
    return { d: `M ${x0} ${horizonY} Q ${cx} ${cpY} ${x1} ${horizonY}`, x0, x1, cpY, peakY };
  }

  const summer = arc(sun.summer.noonElevation, sun.summer.dayHours);
  const winter = arc(sun.winter.noonElevation, sun.winter.dayHours);
  const sunSide = sun.sunSide === "north" ? "north" : "south";
  const sunSideUpper = sunSide.toUpperCase();
  const summerEl = Math.round(sun.summer.noonElevation);
  const winterEl = Math.round(sun.winter.noonElevation);
  const summerH = Math.round(sun.summer.dayHours);
  const winterH = Math.round(sun.winter.dayHours);

  // Filled band between the winter and summer arcs = the seasonal sun zone.
  const band =
    `${summer.d} ` +
    `L ${winter.x1} ${horizonY} Q ${cx} ${winter.cpY} ${winter.x0} ${horizonY} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Side-on sun path. The sun rises in the east (left), crosses the ${sunSide}ern sky at midday, and sets in the west (right). In summer it climbs to about ${summerEl} degrees with roughly ${summerH} hours of daylight; in winter only about ${winterEl} degrees and ${winterH} hours. Rooms and outdoor areas facing ${sunSide} get the most sun.`}
    >
      {/* seasonal sun-zone band */}
      <path d={band} fill="#E6AB02" fillOpacity="0.14" />

      {/* ground */}
      <rect x="0" y={horizonY} width={W} height={H - horizonY} fill="#EFEAE2" />
      <line x1={left - 10} y1={horizonY} x2={right + 10} y2={horizonY} stroke="#C7BFB2" strokeWidth="1.5" />

      {/* winter (low, dashed) + summer (high) sun paths */}
      <path d={winter.d} fill="none" stroke="#9A552F" strokeWidth="2" strokeDasharray="4 3" />
      <path d={summer.d} fill="none" stroke="#E6AB02" strokeWidth="2.5" />

      {/* sun glyph at the summer midday peak (the "north" high point) */}
      <g>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const r = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={cx + Math.cos(r) * 8}
              y1={summer.peakY + Math.sin(r) * 8}
              x2={cx + Math.cos(r) * 12}
              y2={summer.peakY + Math.sin(r) * 12}
              stroke="#E6AB02"
              strokeWidth="1.5"
            />
          );
        })}
        <circle cx={cx} cy={summer.peakY} r="6.5" fill="#E6AB02" />
      </g>
      <circle cx={cx} cy={winter.peakY} r="4.5" fill="#9A552F" />

      {/* midday = the sun side (bold), with sunrise/sunset cardinals */}
      <text x={cx} y={topPad - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#9A6A12">
        midday sun · {sunSideUpper}
      </text>
      <text x={left - 10} y={horizonY + 15} textAnchor="start" fontSize="10" fill="#6B6256">
        sunrise · E
      </text>
      <text x={right + 10} y={horizonY + 15} textAnchor="end" fontSize="10" fill="#6B6256">
        W · sunset
      </text>
      <text x={cx + 14} y={summer.peakY - 3} textAnchor="start" fontSize="9.5" fill="#9A6A12">
        summer ~{summerEl}°, {summerH}h
      </text>
      <text x={cx + 14} y={winter.peakY + 11} textAnchor="start" fontSize="9.5" fill="#9A552F">
        winter ~{winterEl}°, {winterH}h
      </text>
    </svg>
  );
}
