import {expect, test} from 'vitest'
import {
  followingThread,
  followPlanFor,
  followTransition,
  isAtBottomNow,
  type ThreadFollowEvent,
  type ThreadFollowState,
  type ThreadMeasurement,
} from '../src/behaviors/thread-follow-machine.js'

const CLIENT_HEIGHT = 120
const CONTENT_HEIGHT = 400
const BOTTOM_TOP = CONTENT_HEIGHT - CLIENT_HEIGHT

function at(scrollTop: number, scrollHeight = CONTENT_HEIGHT): ThreadMeasurement {
  return {scrollTop, scrollHeight, clientHeight: CLIENT_HEIGHT}
}

const BOTTOM = at(BOTTOM_TOP)
const AWAY = at(100)

function step(state: ThreadFollowState, event: ThreadFollowEvent) {
  const after = followTransition(state, event)
  return {after, plan: followPlanFor(state, after, event)}
}

function run(events: ThreadFollowEvent[], from: ThreadFollowState = followingThread()): ThreadFollowState {
  return events.reduce(followTransition, from)
}

const resized = (measurement: ThreadMeasurement, autoScroll = true, topAnchored = false): ThreadFollowEvent => ({
  type: 'resized',
  at: measurement,
  autoScroll,
  topAnchored,
})

const settledAtBottom = run([resized(BOTTOM), {type: 'scrolled', at: BOTTOM}])

test('a viewport parked within a pixel of the bottom is at the bottom', () => {
  expect(isAtBottomNow(at(BOTTOM_TOP))).toBe(true)
  expect(isAtBottomNow(at(BOTTOM_TOP - 1))).toBe(true)
})

test('a viewport further than a pixel from the bottom is not at the bottom', () => {
  expect(isAtBottomNow(at(BOTTOM_TOP - 2))).toBe(false)
  expect(isAtBottomNow(at(0))).toBe(false)
})

test('a viewport shorter than its own frame counts as the bottom', () => {
  expect(isAtBottomNow({scrollTop: 0, scrollHeight: 40, clientHeight: CLIENT_HEIGHT})).toBe(true)
})

test('asking for the bottom starts a seek and pins the viewport', () => {
  const {after, plan} = step(followingThread(), {type: 'requestBottom', behavior: 'smooth'})
  expect(after.mode).toEqual({kind: 'seeking', behavior: 'smooth'})
  expect(plan.pin).toBe('smooth')
})

test('asking for the bottom takes the thread back off a user detach', () => {
  const detached = run([{type: 'wheelUp'}])
  expect(detached.mode).toEqual({kind: 'detached'})
  expect(followTransition(detached, {type: 'requestBottom', behavior: 'instant'}).mode).toEqual({
    kind: 'seeking',
    behavior: 'instant',
  })
})

test('growth while following the bottom re-pins instantly', () => {
  const {after, plan} = step(settledAtBottom, resized(at(BOTTOM_TOP, 600)))
  expect(plan.pin).toBe('instant')
  expect(plan.rescan).toBe(true)
  expect(after.mode).toEqual({kind: 'seeking', behavior: 'instant'})
})

test('growth after a user detach never re-pins', () => {
  const detached = run([resized(BOTTOM), {type: 'scrolled', at: BOTTOM}, {type: 'wheelUp'}])
  const {plan} = step(detached, resized(at(BOTTOM_TOP, 600)))
  expect(plan.pin).toBe(null)
})

test('growth while a touch drag is under way never re-pins', () => {
  const dragging = run([resized(BOTTOM), {type: 'scrolled', at: BOTTOM}, {type: 'touchMove'}])
  expect(dragging.mode).toEqual({kind: 'dragging'})
  expect(step(dragging, resized(at(BOTTOM_TOP, 600))).plan.pin).toBe(null)
})

test('growth during a seek keeps chasing the bottom with the seek behavior', () => {
  const seeking = run([{type: 'requestBottom', behavior: 'smooth'}])
  expect(step(seeking, resized(at(0, 600))).plan.pin).toBe('smooth')
})

test('growth under a live top anchor drops the seek instead of pinning', () => {
  const seeking = run([{type: 'requestBottom', behavior: 'smooth'}])
  const {after, plan} = step(seeking, resized(at(0, 600), true, true))
  expect(plan.pin).toBe(null)
  expect(after.mode).toEqual({kind: 'following'})
})

test('growth with auto-scroll switched off never re-pins', () => {
  expect(step(settledAtBottom, resized(at(BOTTOM_TOP, 600), false)).plan.pin).toBe(null)
})

test('a resize that changed no dimension is ignored outright', () => {
  const measured = run([resized(BOTTOM)])
  const {after, plan} = step(measured, resized(BOTTOM))
  expect(after).toBe(measured)
  expect(plan.rescan).toBe(false)
  expect(plan.pin).toBe(null)
})

test('an upward wheel gesture detaches the thread from the bottom', () => {
  expect(followTransition(settledAtBottom, {type: 'wheelUp'}).mode).toEqual({kind: 'detached'})
})

test('a scroll key detaches the thread from the bottom', () => {
  expect(followTransition(settledAtBottom, {type: 'scrollKeyDown'}).mode).toEqual({kind: 'detached'})
})

test('a pointer press cancels an in-flight seek without detaching', () => {
  const seeking = run([{type: 'requestBottom', behavior: 'smooth'}])
  expect(followTransition(seeking, {type: 'pointerDown'}).mode).toEqual({kind: 'following'})
})

test('a touch drag that ends at the bottom follows the stream again', () => {
  const dragging = run([resized(BOTTOM), {type: 'scrolled', at: BOTTOM}, {type: 'touchMove'}])
  const ended = followTransition(dragging, {type: 'touchEnd', at: BOTTOM})
  expect(ended.mode).toEqual({kind: 'following'})
  expect(ended.atBottom).toBe(true)
})

test('a touch drag that ends away from the bottom stays detached', () => {
  const dragging = run([resized(BOTTOM), {type: 'scrolled', at: BOTTOM}, {type: 'touchMove'}])
  const ended = followTransition(dragging, {type: 'touchEnd', at: AWAY})
  expect(ended.mode).toEqual({kind: 'detached'})
  expect(ended.atBottom).toBe(false)
})

test('a scroll key released at the bottom follows the stream again', () => {
  const detached = run([resized(BOTTOM), {type: 'scrolled', at: BOTTOM}, {type: 'scrollKeyDown'}])
  expect(followTransition(detached, {type: 'scrollKeySettled', at: BOTTOM}).mode).toEqual({kind: 'following'})
})

test('a downward glide with no finger down is momentum and publishes nothing', () => {
  const glided = run([resized(BOTTOM), {type: 'scrolled', at: at(40)}, {type: 'scrolled', at: at(80)}])
  expect(glided.atBottom).toBe(true)
})

test('a downward drag with a finger down publishes the thread off the bottom', () => {
  const dragged = run([
    resized(BOTTOM),
    {type: 'scrolled', at: at(40)},
    {type: 'touchMove'},
    {type: 'scrolled', at: at(80)},
  ])
  expect(dragged.atBottom).toBe(false)
})

test('arriving at the bottom clears a user detach', () => {
  const detached = run([resized(BOTTOM), {type: 'scrolled', at: BOTTOM}, {type: 'wheelUp'}])
  const returned = followTransition(detached, {type: 'scrolled', at: BOTTOM})
  expect(returned.mode).toEqual({kind: 'following'})
  expect(returned.atBottom).toBe(true)
})

test('a seek in flight suppresses the off-the-bottom report while content grows under it', () => {
  const seeking = run([resized(BOTTOM), {type: 'scrolled', at: BOTTOM}, {type: 'requestBottom', behavior: 'smooth'}])
  const grown = followTransition(seeking, {type: 'scrolled', at: at(BOTTOM_TOP, 600)})
  expect(grown.atBottom).toBe(true)
  expect(grown.mode).toEqual({kind: 'seeking', behavior: 'smooth'})
})

test('dragging upward through a seek abandons the seek', () => {
  const seeking = run([resized(at(200)), {type: 'scrolled', at: at(200)}, {type: 'requestBottom', behavior: 'smooth'}])
  expect(followTransition(seeking, {type: 'scrolled', at: at(120)}).mode).toEqual({kind: 'following'})
})

test('a hold records the frozen offset and cancels any seek', () => {
  const seeking = run([{type: 'requestBottom', behavior: 'smooth'}])
  const held = followTransition(seeking, {type: 'hold', at: AWAY, startedAt: 10, durationMs: 350})
  expect(held.hold).toEqual({top: 100, startedAt: 10, durationMs: 350})
  expect(held.mode).toEqual({kind: 'following'})
})

test('a scroll under a hold is put back where the hold froze it', () => {
  const held = run([{type: 'hold', at: AWAY, startedAt: 10, durationMs: 350}])
  const {plan} = step(held, {type: 'scrolled', at: at(300)})
  expect(plan.restore).toBe(100)
})

test('growth under a hold neither pins nor rescans', () => {
  const held = run([{type: 'hold', at: AWAY, startedAt: 10, durationMs: 350}])
  const {plan} = step(held, resized(at(100, 900)))
  expect(plan.pin).toBe(null)
  expect(plan.rescan).toBe(false)
})

test('a hold taken during a hold restarts the window', () => {
  const held = run([{type: 'hold', at: AWAY, startedAt: 10, durationMs: 350}])
  expect(followTransition(held, {type: 'hold', at: AWAY, startedAt: 99, durationMs: 350}).hold?.startedAt).toBe(99)
})

test('releasing the live hold hands scrolling back', () => {
  const held = run([{type: 'hold', at: AWAY, startedAt: 10, durationMs: 350}])
  expect(followTransition(held, {type: 'release', startedAt: 10}).hold).toBe(null)
})

test('a release left over from a superseded hold never cuts the newer one short', () => {
  const reheld = run([
    {type: 'hold', at: AWAY, startedAt: 10, durationMs: 350},
    {type: 'hold', at: AWAY, startedAt: 99, durationMs: 350},
  ])
  expect(followTransition(reheld, {type: 'release', startedAt: 10}).hold?.startedAt).toBe(99)
})

test('a detach taken during a hold survives the release', () => {
  const held = run([{type: 'hold', at: AWAY, startedAt: 10, durationMs: 350}, {type: 'wheelUp'}])
  expect(followTransition(held, {type: 'release', startedAt: 10}).mode).toEqual({kind: 'detached'})
})
