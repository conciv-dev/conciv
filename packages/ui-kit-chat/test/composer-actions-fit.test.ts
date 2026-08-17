import {describe, expect, it} from 'vitest'
import {
  ACTION_SLOT_PX,
  computeVisibleAutoCount,
  FIT_HYSTERESIS_PX,
  REGION_GAP_PX,
} from '../src/primitives/composer/composer-actions-fit.js'

const base = {
  slotWidth: ACTION_SLOT_PX,
  regionGapPx: REGION_GAP_PX,
  hysteresisPx: FIT_HYSTERESIS_PX,
  leadingWidth: 34,
  trailingWidth: 120,
  pinnedCount: 1,
  autoCount: 4,
  previousCount: null,
}

const used = (autoSlots: number): number =>
  base.leadingWidth +
  base.trailingWidth +
  2 * REGION_GAP_PX +
  ACTION_SLOT_PX +
  base.pinnedCount * ACTION_SLOT_PX +
  autoSlots * ACTION_SLOT_PX

describe('computeVisibleAutoCount', () => {
  it('shows every auto action when the budget covers them', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: used(4) + 40})).toBe(4)
  })

  it('clamps to the available whole slots', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: used(2) + 10})).toBe(2)
  })

  it('never returns a negative count', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: 100})).toBe(0)
  })

  it('never exceeds the registered auto count', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: 5000})).toBe(4)
  })

  it('shrinks immediately when the row narrows', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: used(1) + 2, previousCount: 4})).toBe(1)
  })

  it('expands only once the budget clears the hysteresis margin', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: used(2) + 4, previousCount: 1})).toBe(1)
    expect(computeVisibleAutoCount({...base, rowWidth: used(2) + FIT_HYSTERESIS_PX, previousCount: 1})).toBe(2)
  })
})
