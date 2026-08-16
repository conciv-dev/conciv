# Mascot behavior-harness clock

`installManualClock()` takes GSAP off its own ticker (`gsap.ticker.remove(gsap.updateRoot)`, plus
`lagSmoothing(0)`) and hands time to the test. `advanceTo(seconds)` / `advanceBy(seconds)` then render the
global timeline in fixed 16.67ms increments, so eases, repeats and `onComplete`s fire exactly where they
would in real time — at any runner speed, on any machine. `stepFrames(read, seconds)` samples a value once
per stepped frame.

Install it **before** the mascot is built, so every timeline starts at manual time 0 and a beat is addressable
by its own number: `advanceTo(0.3)` is the throb peak, `advanceTo(1.0)` the bob floor, `advanceTo(1.22)` the
closed blink. Time only moves forward — `advanceTo` throws on a rewind.

Once installed, `wait`, `sampleFrames` and `waitUntil` throw rather than sit through real milliseconds that
move no animation; `settle()` throws through `wait`. A test either owns time or it does not.

One ordering is load-bearing: GSAP commits a `fromTo` from-state on the first root render, not at tween
construction. Reading a `fromTo` start value (the emitter's 0.2 tip scale) therefore needs a zero-length
`advanceBy(0)` first to render that frame. Under the real ticker the same render is the frame the browser
paints, so this is a read ordering, not a product bug.

## Which tests step and which stay on the wall clock

**Stepped** — every assertion whose value depends on where a tween sits in its progression: mid-animation
samples (throb peak, bob range, blink close, enter/exit scale, the awake anticipation segment), settled
readings taken one epsilon after a known duration (the 0.2s recovery), and node removals driven by an exit
tween's `onComplete`.

**Wall clock** — assertions that do not read a tween's progress:

- `gaze.it.test.ts`: the pointer-tracking channels. `page.mouse.move` has to travel the real event loop
  before the follow driver sees it, and every assertion there is on the settled saturation value or on the
  `pointermove` listener count, not on a mid-flight sample. Stepping would only add a clock pump between
  each real event without making any assertion more exact.
- `reduced-motion.it.test.ts`: reduced motion starts no tweens at all; the poses are `gsap.set` calls.
- `registration.it.test.ts` (all but the rebind test) and `activity.it.test.ts`'s tip-tracking test: ref
  binding, teardown, listener counts and anchor geometry, none of which move with the timeline.

## Reading digit placement

A straight emitter's digits are flat spans carrying the centering offset and the lane in one
`left`. A curved emitter wraps each digit in a rider that carries the centering, leaving the glyph
inside it holding only its lane offset, so `autoRotate` tilts the glyph in place instead of swinging
it around the path point. `emitterGeometry` reports the rendered offset of each lane whichever shape
is mounted, adding the rider anchor to the glyph offset inside it, so the approved geometry reads the
same under the default `auto` curve as under an explicit `straight` one; `curvedDigitPlacement(emitter,
index)` reads the rider and its glyph separately.

The manual clock never interferes with Playwright's own waiting: the `data-harness` ready gate and every DOM
assertion are DOM-state waits, and `page.mouse` dispatches real events regardless of who owns GSAP's ticker.
