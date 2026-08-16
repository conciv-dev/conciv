# @conciv/mascot

The conciv robot mascot: a framework-free GSAP service over three stacked layers (head, eyes,
antenna), Solid and React compound components over that service, and sixteen effects that ride the
antenna tip while work is in flight.

## Components

Rendering the robot takes one element:

```tsx
import {Mascot} from '@conciv/mascot/solid'

const Robot = () => <Mascot state="rest" working={busy()} follow />
```

`<Mascot>` renders its own head, antenna and eyes layers on a 44px stage and mounts the binary
effect. Every part has a slot component that replaces the default it names and restores it on
unmount, in any child order:

```tsx
import {Mascot} from '@conciv/mascot/solid'
import {steamEffect} from '@conciv/mascot/effects/steam'

const mountSteam = () => steamEffect

const SteamingRobot = () => (
  <Mascot class="size-16" working={busy()} follow>
    <Mascot.Head />
    <Mascot.Antenna follow={false} />
    <Mascot.Eyes class="glow" />
    <Mascot.Effect mount={mountSteam} />
  </Mascot>
)
```

`<Mascot.Effect>` mounts any effect subpath in place of the default binary; two effect children mean
two live emitters. `<Mascot.Binary curve="arc">` is the shorthand for the default one.

`@conciv/mascot/react` is the same compound API and the same slots, with React's own conventions:
`className` instead of `class`, and `style` as a camelCased object rather than Solid's kebab-cased
one. Both wrappers are mechanical: all sequencing lives in the core service.

In React, `mount` is a dependency: a new function identity remounts the effect, which drains the
particles in flight and starts them again. That is what you want when the effect really changed, so
keep `mount` stable otherwise — a module-level constant as above, or `useCallback` over the values it
closes over. Solid reads `mount` inside its own tracked scope, so an inline arrow there is fine.

Root props: `state` (`'rest' | 'awake'`), `working`, `follow` (`boolean` or `{eyes, antenna}`),
`activity` (`{bob, throb, blink}`), `curve`, `initialSkin`. `follow` on `<Mascot.Eyes>` or
`<Mascot.Antenna>` opts that one gaze channel out. A consumer `class`, `style` and `ref` all survive
the merge: the wrapper only keeps the geometry the rig animates.

`solid-js`, `react` and `react-dom` are optional peer dependencies, and each wrapper subpath is the
only entry that reaches its framework.

## Core service

`@conciv/mascot` itself is framework-free — the wrappers are built on it, and a host that renders its
own DOM can drive it directly:

```ts
import {createMascot, robotLayers} from '@conciv/mascot'
import {binaryEffect} from '@conciv/mascot/effects/binary'

const service = createMascot({state: 'rest', working: false, follow: true})
const {getEffectHostProps} = service.connect()

service.registerParts({stage, head, eyes, antenna})
service.mountEffect('thinking', binaryEffect)
service.update({state: 'awake', working: true, follow: false})
service.destroy()
```

`connect()` hands back `{style, ref, release}` for the root, each layer and every keyed effect host,
so a host binds elements without knowing what the controllers do with them. `robotLayers` ships the
three layer images as data URIs for hosts that paint the layers themselves.

## Effects

Each effect is its own subpath entry, so an app bundles only the one it mounts:

`@conciv/mascot/effects/` `binary`, `matrix`, `thought-cloud`, `pixel-bubbles`, `signal-rings`,
`speech-bubble`, `steam`, `spark`, `spark-burst`, `spark-fountain`, `satellite`, `led-cone`,
`tick-ring`, `signal-bars`, `heart`, `notes`.

Travelling effects (binary) ride a `curve`: `'straight' | 'arc' | 'hook' | 'fan' | 'auto'`. The rest
are anchored to the tip and ignore it. Every effect enters staged out of the antenna tip and drains
back into it when work stops.

## Skin

Every art-coupled value — the layer images, transform origins, origin and tip fractions, the awake
pose values, the emitter's reference antenna size — lives in one `MascotSkin`, defaulting to
`robotSkin`. Controllers animate generic elements, so an alternate mascot is data, not code. Pass it
once as `createMascot(config, skin)` or `<Mascot initialSkin={skin}>`; it is read when the service is
created.

Under `prefers-reduced-motion: reduce` poses land instantly, the gaze never arms and no effect
starts.
