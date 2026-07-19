interface Props {
  width: number
  height: number
}

/**
 * Einfache generierte Platzhalterkarte im Pergament-Stil, damit man ohne
 * eigenes Kartenbild sofort loslegen kann. Reines SVG, keine externen Assets.
 */
export function PlaceholderMap({ width, height }: Props) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="sea" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#a9c4c9" />
          <stop offset="100%" stopColor="#7ba0a8" />
        </radialGradient>
        <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e9dcbe" />
          <stop offset="100%" stopColor="#d8c49b" />
        </linearGradient>
        <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
          <path
            d="M 100 0 L 0 0 0 100"
            fill="none"
            stroke="#6d5a3c"
            strokeOpacity="0.12"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      {/* Meer */}
      <rect x="0" y="0" width={width} height={height} fill="url(#sea)" />
      <rect x="0" y="0" width={width} height={height} fill="url(#grid)" />

      {/* Grosse Landmasse */}
      <path
        d="M 380 260
           C 620 160, 980 180, 1240 300
           C 1500 420, 1720 380, 1780 620
           C 1840 860, 1620 980, 1400 1060
           C 1120 1160, 820 1180, 560 1080
           C 320 990, 220 760, 300 540
           C 340 420, 300 320, 380 260 Z"
        fill="url(#land)"
        stroke="#7c6640"
        strokeWidth="4"
      />

      {/* Insel */}
      <path
        d="M 1480 980 C 1560 940, 1660 970, 1660 1050 C 1660 1120, 1560 1160, 1490 1120 C 1440 1090, 1430 1010, 1480 980 Z"
        fill="url(#land)"
        stroke="#7c6640"
        strokeWidth="4"
      />

      {/* Gebirge */}
      <g stroke="#6d5a3c" strokeWidth="3" fill="#cbb487">
        {mountainRange(560, 520, 6)}
        {mountainRange(980, 440, 5)}
      </g>

      {/* Wald-Andeutung */}
      <g fill="#7c9b6b" opacity="0.55">
        {forest(760, 760, 20)}
        {forest(1180, 720, 16)}
      </g>

      {/* Fluss */}
      <path
        d="M 640 540 C 720 640, 700 780, 820 860 C 940 940, 1000 900, 1120 980"
        fill="none"
        stroke="#7ba0a8"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Titel-Kartusche */}
      <text
        x={width / 2}
        y="120"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="52"
        fill="#5b4a2f"
        opacity="0.65"
      >
        Terra Incognita
      </text>
      <text
        x={width / 2}
        y={height - 60}
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="22"
        fill="#5b4a2f"
        opacity="0.5"
      >
        Platzhalterkarte &middot; eigenes Kartenbild oben hochladbar
      </text>
    </svg>
  )
}

function mountainRange(x: number, y: number, count: number) {
  const peaks = []
  for (let i = 0; i < count; i++) {
    const px = x + i * 60
    const h = 70 + (i % 3) * 20
    peaks.push(
      <path key={`${x}-${i}`} d={`M ${px} ${y} l 45 ${-h} l 45 ${h} Z`} />,
    )
  }
  return peaks
}

function forest(x: number, y: number, count: number) {
  const trees = []
  for (let i = 0; i < count; i++) {
    const tx = x + (i % 5) * 45 + (i % 2) * 15
    const ty = y + Math.floor(i / 5) * 40
    trees.push(<circle key={`${x}-${i}`} cx={tx} cy={ty} r="16" />)
  }
  return trees
}
