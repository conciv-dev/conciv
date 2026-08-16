export const ACTION_SLOT_PX = 38
export const REGION_GAP_PX = 4
export const FIT_HYSTERESIS_PX = 24

export type FitInput = {
  rowWidth: number
  leadingWidth: number
  trailingWidth: number
  slotWidth: number
  regionGapPx: number
  pinnedCount: number
  autoCount: number
  previousCount: number | null
  hysteresisPx: number
}

export function computeVisibleAutoCount(input: FitInput): number {
  const reserved =
    input.leadingWidth +
    input.trailingWidth +
    2 * input.regionGapPx +
    input.slotWidth +
    input.pinnedCount * input.slotWidth
  const budget = input.rowWidth - reserved
  const fits = Math.max(0, Math.min(input.autoCount, Math.floor(budget / input.slotWidth)))
  if (input.previousCount === null || fits <= input.previousCount) return fits
  if (budget < fits * input.slotWidth + input.hysteresisPx) return input.previousCount
  return fits
}
