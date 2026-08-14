# Mascot componentization design

Date: 2026-08-14. Status: approved by owner, pending implementation plan.

## Goal

Replace the prototype rig (`packages/mascot/src/rig.ts`, `createFabRobotRig`) with a real component
library: a framework-free animation core plus Solid and React compound-component wrappers, exposing
every mascot behavior and effect as composable, documented API. Pre-release rules apply: no
back-compat shim, `rig.ts` is deleted and both consumers migrate in the same effort.

## API

```tsx
<Mascot state={open ? 'awake' : 'rest'} working={isStreaming()} follow={!open}>
  <Mascot.Eyes />
  <Mascot.Antenna animation="throb" />
  <Mascot.Binary curve="auto" />
</Mascot>
```

- `state: 'rest' | 'awake'` — expressions, not app concepts. `rest` is the neutral hanging pose;
  `awake` is the perk-up animation (head bounce with overshoot, eyes widen, antenna flick) settling
  into the lifted pose. The union is open for future expressions (`success`, `error` — the smoothui
  ai-orb-face reference shows the target vocabulary).
- `working: boolean` — activity. Runs the working visuals (antenna motion, eye blink loop, mounted
  effects) in either state. The mascot has no policy about state/working combinations: it does what
  the props say. Consumers encode semantics, e.g. the widget passes
  `working={isStreaming() && !open}` to stay quiet while the panel is open.
- `follow: boolean` — pointer tracking (eyes translate, antenna leans). No hidden state coupling:
  the widget passes `!open` because it does not want tracking under an open panel; another consumer
  may track always.
- Context inheritance: `<Mascot>` provides `state` / `working` / `follow` (and future shared flags)
  via context. Part and effect children inherit; a child prop overrides
  (`<Mascot.Antenna follow={false}>`). Precedence: child prop > parent context > default.
- Bare `<Mascot working={x} />` renders the full standard robot: `Mascot` (root) renders a default
  element for any part that has no corresponding child, so the three layers always exist; declaring
  `<Mascot.Eyes …>` replaces the default eyes element with the child-rendered one (same prop
  getter, plus the consumer's overrides). Effect children are additive — each mounted effect child
  adds its effect, two children = two emitters.

## Architecture (approach A, Ark-aligned)

Logic lives once in a framework-free core; wrappers are mechanical mirrors, following the Ark UI /
zag.js split verified against the ark repo (`packages/{react,solid}/src/components/avatar`): a
`connect()`-style API returning prop getters, spread by thin per-framework part files.

```
packages/mascot/src/
  core/
    mascot.ts        createMascot(config) → service: {update(config), connect(), destroy()}
    parts/eyes.ts    gaze follow (translate; falloff 220px, range 3px)
    parts/antenna.ts lean follow (max 10°, wrapper-span rotation isolation as in current rig)
                     + named motion presets: throb, sine, wobble, metronome, vibrate
    path/room.ts     measureEmitterRoom (pure) + curve builders: arc, hook, fan, straight;
                     'auto' resolves via measured room against real viewport bounds
    effects/*.ts     one module per effect (16), self-describing, no central registry
    tip-transition.ts, poses.ts, shared timing/easing constants
  solid/             use-mascot.ts, mascot-context.ts, mascot-root.tsx, mascot-eyes.tsx,
                     mascot-antenna.tsx, one file per effect child, index.ts
  react/             the same files, React idioms (forwardRef, hooks), mirrored by convention
```

- Parts are framework-rendered: `getRootProps() / getHeadProps() / getEyesProps() /
getAntennaProps() / getEffectHostProps(id)` return style/attr bags (layer data-URI backgrounds,
  positioning, image-rendering). Part components spread them and register their element refs back to
  the core, which uses them as gsap targets. Consumers gain class/style hooks and DevTools presence.
- Effect interiors are core-imperative: the effect's host span is framework-rendered, everything
  inside (digit churn, canvas) is owned by the effect module. This is the one deliberate departure
  from zag, which never animates; gsap requires imperative ownership, and framework-rendered nodes
  mutated by gsap are a known reconciler landmine in this repo.
- Exports: `.` (core, gsap-only deps), `./solid`, `./react`; solid-js and react are optional peer
  dependencies; MotionPathPlugin is registered inside core. tsdown entries per subpath; effect
  modules are separate chunks so importing one effect child never bundles the other fifteen.
- Config is plain data; `update(config)` diffs and sequences transitions (state change, follow
  toggle, effect list membership) — wrappers never sequence animations. Core is fully drivable
  without a wrapper (stories, tests, vanilla consumers).

## Effects

Free-form by design — no imposed lifecycle interface. An effect component receives the shared
context (tip anchor in stage coordinates, stage size, reactive `state`/`working`, reduced-motion)
and opt-in helpers (`TipTransition`, curve builders, `measureEmitterRoom`), and otherwise owns its
host completely. Lifecycle is component lifecycle: mount = exist, react to context however it
chooses, unmount = clean up.

Conventions held by review, not types: staged enter/exit (nothing pops in or out — grow from the
tip on start, drain/collapse on stop), idempotence under rapid working flapping, zero leaks on
unmount. The current playground implementations are the reference pattern and are moved, not
rewritten.

The 16 effect components: `Binary`, `Matrix`, `ThoughtCloud`, `PixelBubbles`, `SignalRings`,
`SpeechBubble`, `Steam`, `Spark`, `SparkBurst`, `SparkFountain`, `Satellite`, `LedCone`,
`TickRing`, `SignalBars`, `Heart`, `Notes`. Traveling/particle effects honor `curve`
(`arc | hook | fan | straight | auto`); anchored effects (ThoughtCloud, SpeechBubble) ignore it.
Digits/particles follow the path with vertical tangent at the tip and tangent tilt (autoRotate),
two-lane offsets riding the rotated local frame — as proven in the EmitterPath story.

Out of scope: antenna-art tip variants (LED tip, color cycle, etc.) — separate lane if picked later.

## Behavior parity requirements

The refactor must reproduce, verified by the existing Playwright harness pattern:

- rest + follow: eyes translate (3px range) and antenna leans (10° max) with the 220px falloff,
  one pointermove listener, arm/disarm lifecycle, pose-tween isolation (lean on a rig-created
  wrapper span so pose `rotation` tweens never race it).
- working: antenna throb (squash-stretch, elastic release), eye blink loop, mounted effects staged
  in from the tip; on stop, effects drain before removal; exactly one emitter under flapping.
- awake: perk-up animation and settled pose, identical to the current open-state timeline.
- reduced motion: static poses, no follow, no effects — all current branches preserved.
- destroy: listener removed, tweens killed, effect DOM removed, antenna un-wrapped.

## Testing

- Pure math (`measureEmitterRoom`, curve geometry) gets vitest unit tests in the package.
- Behavior evidence via the Playwright harness (per-feature checks with revert-verification, the
  pattern used throughout this branch); promoted from scratch scripts into repeatable package
  scripts where cheap.
- Post-migration, widget-level behavior rides the existing embed integration tests.

## Migration plan (phases, each landing green)

1. Core refactor: rig.ts → core modules behind `createMascot`, visual behavior unchanged,
   harness-verified parity.
2. Solid wrapper + widget migration (`apps/conciv/src/shell/fab-robot.tsx` becomes the compound
   API one-liner; widget mapping: `state={open ? 'awake' : 'rest'}`,
   `working={isStreaming() && !open}`, `follow={!open}`).
3. React wrapper + site migration (`apps/site/src/components/landing/robot-fab.tsx`).
4. Stories rewritten as the variant gallery driven by the real API; `story-support` shrinks to page
   chrome; `.fallowrc.json` ignore entries revisited.
5. Delete `rig.ts` and `createFabRobotRig`, fallow sweep, changeset updated.

Open at plan time: same PR vs stacked PRs per phase; which effects the widget mounts by default
(current pick: `Binary` with `curve="auto"`).
