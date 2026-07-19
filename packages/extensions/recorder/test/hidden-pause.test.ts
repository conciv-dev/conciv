import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createVisibilityPauser} from '../src/client/visibility-pauser.js'

describe('createVisibilityPauser', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('pauses only after the grace period while hidden', () => {
    let hidden = true
    const pauses: number[] = []
    const pauser = createVisibilityPauser({
      isHidden: () => hidden,
      pause: () => pauses.push(Date.now()),
      resume: () => {},
    })
    pauser.onVisibilityChange()
    vi.advanceTimersByTime(29_999)
    expect(pauses).toHaveLength(0)
    vi.advanceTimersByTime(2)
    expect(pauses).toHaveLength(1)
    hidden = false
    pauser.dispose()
  })

  it('cancels the pause when visibility returns within the grace period', () => {
    let hidden = true
    const pauses: number[] = []
    const resumes: number[] = []
    const pauser = createVisibilityPauser({
      isHidden: () => hidden,
      pause: () => pauses.push(1),
      resume: () => resumes.push(1),
    })
    pauser.onVisibilityChange()
    vi.advanceTimersByTime(10_000)
    hidden = false
    pauser.onVisibilityChange()
    vi.advanceTimersByTime(60_000)
    expect(pauses).toHaveLength(0)
    expect(resumes).toHaveLength(0)
    pauser.dispose()
  })

  it('resumes exactly once after a real pause when visibility returns', () => {
    let hidden = true
    const resumes: number[] = []
    const pauser = createVisibilityPauser({
      isHidden: () => hidden,
      pause: () => {},
      resume: () => resumes.push(1),
    })
    pauser.onVisibilityChange()
    vi.advanceTimersByTime(30_001)
    hidden = false
    pauser.onVisibilityChange()
    pauser.onVisibilityChange()
    expect(resumes).toHaveLength(1)
    pauser.dispose()
  })
})
