import {useId, useMemo} from 'react'
import {
  HERO_ENGRAVING_HEIGHT,
  HERO_ENGRAVING_WIDTH,
  buildHeroEngravingPaths,
  type HeroEngravingVariant,
} from './hero-engraving-figures'

const QUIET_ZONE_RADIUS = 340
const QUIET_ZONE_FLATTEN = 0.44
const QUIET_ZONE_CORE = 0.24

export function HeroEngraving({variant}: {variant: HeroEngravingVariant}) {
  const paths = useMemo(() => buildHeroEngravingPaths(variant), [variant])
  const maskId = useId()
  const gradientId = useId()
  const centerX = HERO_ENGRAVING_WIDTH / 2
  const centerY = HERO_ENGRAVING_HEIGHT / 2

  return (
    <svg
      className="size-full"
      viewBox={`0 0 ${HERO_ENGRAVING_WIDTH} ${HERO_ENGRAVING_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      style={{strokeOpacity: 'var(--od-hero-line-alpha)'}}
    >
      <defs>
        <radialGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          cx={centerX}
          cy={centerY}
          r={QUIET_ZONE_RADIUS}
          gradientTransform={`translate(0 ${centerY * (1 - QUIET_ZONE_FLATTEN)}) scale(1 ${QUIET_ZONE_FLATTEN})`}
        >
          <stop offset={QUIET_ZONE_CORE} stopColor="#000000" />
          <stop offset="1" stopColor="#ffffff" />
        </radialGradient>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={HERO_ENGRAVING_WIDTH}
          height={HERO_ENGRAVING_HEIGHT}
        >
          <rect width={HERO_ENGRAVING_WIDTH} height={HERO_ENGRAVING_HEIGHT} fill={`url(#${gradientId})`} />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        {paths.map((path) => (
          <path key={path} d={path} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  )
}
