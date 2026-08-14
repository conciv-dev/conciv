export type EmitterAnchor = {x: number; y: number}

export type EmitterBounds = {top: number; left: number; right: number}

export type EmitterRoom = {rise: number; bend: number}

const MARGIN = 12
const MIN_RISE = 8
const MAX_RISE = 54
const SHORTFALL_THRESHOLD = 10
const BEND_FACTOR = 1.4
const ROUNDING_PRECISION = 1e9

const roundClean = (value: number): number => Math.round(value * ROUNDING_PRECISION) / ROUNDING_PRECISION

export function measureEmitterRoom(anchor: EmitterAnchor, bounds: EmitterBounds): EmitterRoom {
  const headroom = anchor.y - bounds.top - MARGIN
  const rise = Math.min(MAX_RISE, Math.max(MIN_RISE, headroom))
  const shortfall = Math.max(0, MAX_RISE - headroom)
  if (shortfall < SHORTFALL_THRESHOLD) return {rise, bend: 0}
  const leftRoom = anchor.x - bounds.left - MARGIN
  const rightRoom = bounds.right - anchor.x - MARGIN
  const wanted = roundClean(shortfall * BEND_FACTOR)
  if (rightRoom >= leftRoom) return {rise, bend: Math.min(wanted, rightRoom)}
  return {rise, bend: -Math.min(wanted, leftRoom)}
}
