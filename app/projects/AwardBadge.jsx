// Flashy gold "seal" badge — a starburst medallion with a metallic gold
// gradient, a beveled inner ring, a sweeping shine, and a centered label.
// Rendered on a project card when its data entry has an `award` field.
// Pure SVG (no hooks) so it renders fine inside the client carousel tree.

const N_SPIKES = 30;
const CX = 100;
const CY = 100;
const R_OUTER = 98; // spike tips
const R_INNER = 84; // spike valleys

// Build the zigzag star outline: 2·N points alternating outer/inner radius.
function spikePath() {
  let d = '';
  for (let i = 0; i < 2 * N_SPIKES; i++) {
    const ang = (Math.PI / N_SPIKES) * i - Math.PI / 2;
    const r = i % 2 === 0 ? R_OUTER : R_INNER;
    const x = CX + r * Math.cos(ang);
    const y = CY + r * Math.sin(ang);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return `${d}Z`;
}

export default function AwardBadge({ label = 'AWARD WINNER', className }) {
  const words = label.trim().split(/\s+/);
  const lineH = 22;
  // Center the word block on CY, nudged down to leave room for the star above.
  const firstY = CY - ((words.length - 1) * lineH) / 2 + 6;

  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Metallic gold: alternating light/dark bands read as a sheen. */}
        <linearGradient id="awGold" x1="0%" y1="0%" x2="28%" y2="100%">
          <stop offset="0%" stopColor="#F7DE8B" />
          <stop offset="18%" stopColor="#E2B348" />
          <stop offset="38%" stopColor="#FFF7CE" />
          <stop offset="50%" stopColor="#EFC75E" />
          <stop offset="70%" stopColor="#C8911F" />
          <stop offset="86%" stopColor="#F3D778" />
          <stop offset="100%" stopColor="#A9760F" />
        </linearGradient>
        <linearGradient id="awShine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="awDisc">
          <circle cx={CX} cy={CY} r="77" />
        </clipPath>
      </defs>

      <path d={spikePath()} fill="url(#awGold)" stroke="#9a6b12" strokeWidth="1" />

      {/* Beveled inner ring: bright highlight line over a thin shadow line. */}
      <circle cx={CX} cy={CY} r="74.5" fill="none" stroke="#b07d18" strokeWidth="1" />
      <circle cx={CX} cy={CY} r="78" fill="none" stroke="#fff3b0" strokeWidth="2.5" />

      {/* Sweeping shine, clipped to the inner disc so the spikes stay crisp. */}
      <g clipPath="url(#awDisc)" transform="rotate(20 100 100)">
        <rect x="-60" y="-10" width="34" height="220" fill="url(#awShine)">
          <animate attributeName="x" values="-60;240" dur="2.8s" repeatCount="indefinite" />
        </rect>
      </g>

      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight="800"
        fill="#5a4200"
        style={{ letterSpacing: '0.06em' }}
      >
        <tspan x={CX} y={firstY - lineH - 4} fontSize="16">★</tspan>
        {words.map((w, i) => (
          <tspan key={w} x={CX} y={firstY + i * lineH} fontSize="21">
            {w}
          </tspan>
        ))}
      </text>
    </svg>
  );
}
