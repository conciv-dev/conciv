# @conciv/mascot

The conciv robot mascot. Ships the rigged layer assets (`robotLayers`: head, eyes, antenna as data
URIs) and a framework-free GSAP rig shared by the widget FAB (Solid) and the site (React).

```ts
import {createFabRobotRig, robotLayers} from '@conciv/mascot'

const rig = createFabRobotRig({head, eyes, antenna})
rig.apply('open')
rig.apply('work')
rig.destroy()
```

Consumers render three stacked layers (background-image per layer, `background-size: contain`) and
hand the elements to `createFabRobotRig`, which owns transform-origins and all GSAP timelines:
a snappy open/close with anticipation and antenna follow-through, and a looping "thinking" pose.
`prefers-reduced-motion` falls back to static poses.
