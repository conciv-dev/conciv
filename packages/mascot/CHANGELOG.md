# @conciv/mascot

## 0.0.21

### Patch Changes

- [#646](https://github.com/conciv-dev/conciv/pull/646) [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8) Thanks [@omridevk](https://github.com/omridevk)! - Remove test-only and unused exports from the package surfaces.

## 0.0.20

### Patch Changes

- [#490](https://github.com/conciv-dev/conciv/pull/490) [`d796d1e`](https://github.com/conciv-dev/conciv/commit/d796d1e8a08f86ed9593cadff9748b5d57772cf2) Thanks [@omridevk](https://github.com/omridevk)! - Rebuild the mascot as a component. The package entry is now a framework-free service — `createMascot(config, skin)` with `update`, `registerParts`, `mountEffect`, `unmountEffect`, `connect` and `destroy` — and the legacy `createFabRobotRig` adapter, its `RigState`/`RigLayers`/`FabRobotRig` types and the compat entry are gone. `connect()` hands a host `{style, ref, release}` for the root, each layer and every keyed effect host. `follow` accepts one boolean or per-channel `{eyes, antenna}`, `activity` gates the bob, throb and blink independently, and every art-coupled value (layer images, transform origins, origin and tip fractions, awake pose values, the emitter's reference antenna size) is isolated behind one `MascotSkin` defaulting to `robotSkin`, so an alternate mascot is data rather than code.

  Two compound components ride that service: `@conciv/mascot/solid` and `@conciv/mascot/react`. `<Mascot>` renders the whole robot on its own — head, antenna and eyes on a 44px default stage plus the binary effect — and `<Mascot.Head>`, `<Mascot.Eyes>`, `<Mascot.Antenna>`, `<Mascot.Binary>` and `<Mascot.Effect>` replace the default they name and restore it on unmount. Parts claim their slot on mount, so fragments, conditionals, lists and any child order work, and a second claimant on a taken slot throws instead of rendering two of a part. A consumer `class`, `style` and `ref` survive the merge except for the geometry the rig animates. `solid-js`, `react` and `react-dom` are optional peer dependencies and each wrapper subpath is the only entry that reaches its framework, proven by packed installs that carry one framework each.

  Sixteen effects ship as their own subpath entries (`@conciv/mascot/effects/<name>`: binary, matrix, thought-cloud, pixel-bubbles, signal-rings, speech-bubble, steam, spark, spark-burst, spark-fountain, satellite, led-cone, tick-ring, signal-bars, heart, notes), so an app bundles only the one it mounts. Effects are additive and keyed: `<Mascot.Effect mount={mountSteam} />` (a stable mount — in React a new `mount` identity is an intentional effect swap) stands the default binary down, two effect children mean two live emitters, and each one enters staged out of the antenna tip and drains back into it when work stops. Travelling digits ride a `curve` (`straight`, `arc`, `hook`, `fan`, `auto`); anchored effects ignore it. The emitter is scale-relative, so the effect grows with the robot instead of staying a 9px speck on a large stage.

  Travelling digits now default to `curve: 'auto'`, resolved in one place in the binary effect, so a mascot with headroom keeps the plain vertical rise while a FAB parked near a viewport edge arcs its digits inward instead of flying them off the screen. An explicit `curve` on `<Mascot>`, `<Mascot.Binary>` or `configureBinaryEffect` still pins the path.

- [#547](https://github.com/conciv-dev/conciv/pull/547) [`4538432`](https://github.com/conciv-dev/conciv/commit/45384329144c3d7f66a41bc8296702ff6cd548f5) Thanks [@omridevk](https://github.com/omridevk)! - Pin `force3D: true` on the continuous work-loop tweens (bob, throb, blink and their pose recovery/handoff) so the browser keeps one stable compositor layer for the head, eyes and antenna instead of gsap's `force3D: 'auto'` flipping the transform representation tick to tick while concurrent tweens hit the same element.

## 0.0.19

## 0.0.18

## 0.0.17

## 0.0.16

## 0.0.15

## 0.0.14

## 0.0.13

## 0.0.12

## 0.0.11

## 0.0.10

## 0.0.9

## 0.0.8

## 0.0.7
