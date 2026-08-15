# Mascot behavior-harness clock

`installManualClock()` takes GSAP off its own ticker (`gsap.ticker.remove(gsap.updateRoot)`, plus
`lagSmoothing(0)`) and hands time to the test. `advanceTo(seconds)` / `advanceBy(seconds)` then render the
global timeline in fixed 16.67ms increments, so eases, repeats and `onComplete`s fire exactly where they
would in real time — at any runner speed, on any machine. `stepFrames(read, seconds)` samples a value once
per stepped frame.

Install it **before** the mascot is built, so every timeline starts at manual time 0 and a beat is addressable
by its own number: `advanceTo(0.3)` is the throb peak, `advanceTo(1.0)` the bob floor, `advanceTo(1.22)` the
closed blink.

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

The manual clock never interferes with Playwright's own waiting: the `data-harness` ready gate and every DOM
assertion are DOM-state waits, and `page.mouse` dispatches real events regardless of who owns GSAP's ticker.
