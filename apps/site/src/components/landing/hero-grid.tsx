import {useMemo} from 'react'
import {
  HERO_GRID_GEOMETRY,
  HERO_GRID_HEIGHT,
  HERO_GRID_WIDTH,
  buildHeroGridFigure,
  type HeroGridGeometry,
  type HeroGridPath,
} from './hero-grid-figure'

export type HeroGridProps = Partial<HeroGridGeometry> & {gridAlpha?: number; tickAlpha?: number}

function renderPaths(paths: HeroGridPath[]) {
  return paths.map((path) => (
    <path
      key={`${path.opacity}|${path.width}`}
      d={path.d}
      strokeOpacity={path.opacity}
      strokeWidth={path.width}
      vectorEffect="non-scaling-stroke"
    />
  ))
}

export function HeroGrid({
  gridAlpha,
  tickAlpha,
  cell = HERO_GRID_GEOMETRY.cell,
  coverage = HERO_GRID_GEOMETRY.coverage,
  overshoot = HERO_GRID_GEOMETRY.overshoot,
  seed = HERO_GRID_GEOMETRY.seed,
  quietCenterY = HERO_GRID_GEOMETRY.quietCenterY,
  quietRadiusX = HERO_GRID_GEOMETRY.quietRadiusX,
  quietRadiusY = HERO_GRID_GEOMETRY.quietRadiusY,
}: HeroGridProps) {
  const figure = useMemo(
    () => buildHeroGridFigure({cell, coverage, overshoot, seed, quietCenterY, quietRadiusX, quietRadiusY}),
    [cell, coverage, overshoot, seed, quietCenterY, quietRadiusX, quietRadiusY],
  )

  return (
    <svg
      className="od-hero-grid"
      width={HERO_GRID_WIDTH}
      height={HERO_GRID_HEIGHT}
      viewBox={`0 0 ${HERO_GRID_WIDTH} ${HERO_GRID_HEIGHT}`}
      fill="none"
      stroke="currentColor"
    >
      <g style={{opacity: gridAlpha ?? 'var(--od-hero-grid-alpha)'}}>{renderPaths(figure.grid)}</g>
      <g style={{opacity: tickAlpha ?? 'var(--od-hero-tick-alpha)'}}>{renderPaths(figure.ticks)}</g>
    </svg>
  )
}
