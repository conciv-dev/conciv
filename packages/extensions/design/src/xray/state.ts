import {batch} from 'solid-js'
import {createStore, produce} from 'solid-js/store'
import {readStorage, writeStorage} from '@conciv/ui-kit-system'
import {z} from 'zod'

export function createXrayState() {
  const saved = readStorage(STORAGE_KEY, parseSaved, SavedSchema.parse({}))
  const [state, setState] = createStore<XrayState>({
    ...saved,
    pick: false,
    column: true,
    width: null,
    round: null,
    picked: null,
    plane: null,
    orbit: {tilt: ORBIT_TILT, turn: ORBIT_TURN},
  })
  const change = (input: {apply: (draft: XrayState) => void; animate: boolean}): void => {
    const swap = (): void => {
      batch(() => setState(produce(input.apply)))
      writeStorage(STORAGE_KEY, SavedSchema.parse(state), JSON.stringify)
    }
    if (!input.animate || !transitions()) return swap()
    document.startViewTransition(swap)
  }
  const animate = (apply: (draft: XrayState) => void): void => change({apply, animate: true})
  return {
    state,
    toggleOn: () =>
      animate((draft) => {
        draft.on = !draft.on
        draft.pick = draft.on && draft.pick
        draft.picked = draft.on ? draft.picked : null
      }),
    togglePick: () =>
      animate((draft) => {
        draft.on = true
        draft.pick = !draft.pick
      }),
    toggleThreeD: () =>
      animate((draft) => {
        draft.threeD = !draft.threeD
        draft.plane = null
      }),
    toggleColumn: () =>
      animate((draft) => {
        draft.column = !draft.column
      }),
    toggleLayer: (layer: Layer) =>
      animate((draft) => {
        draft.layers[layer] = !draft.layers[layer]
      }),
    toggleMagnitude: (magnitude: Shown) =>
      animate((draft) => {
        draft.magnitudes[magnitude] = !draft.magnitudes[magnitude]
      }),
    showWidth: (width: number | null) =>
      animate((draft) => {
        draft.width = width
      }),
    showRound: (round: number | null) =>
      animate((draft) => {
        draft.round = round
      }),
    pickId: (id: string | null) =>
      animate((draft) => {
        draft.picked = id
        draft.column = draft.column || id !== null
      }),
    focusPlane: (plane: Plane | null) =>
      animate((draft) => {
        draft.plane = plane
      }),
    orbit: (delta: {tilt: number; turn: number}) =>
      change({
        apply: (draft) => {
          draft.orbit.tilt = Math.min(TILT_MAX, Math.max(0, draft.orbit.tilt + delta.tilt))
          draft.orbit.turn = draft.orbit.turn + delta.turn
        },
        animate: false,
      }),
    escape: (): boolean => {
      const step = ESCAPES.find((candidate) => candidate.when(state))
      if (step === undefined) return false
      animate(step.apply)
      return true
    },
  }
}

const LAYERS = ['dom', 'fom', 'changed'] as const

const SHOWN = ['much', 'noticeably', 'slightly', 'reflow', 'paint', 'matched'] as const

const PLANES = ['src', 'cssom', 'dom', 'fom'] as const

type Layer = (typeof LAYERS)[number]

type Shown = (typeof SHOWN)[number]

type Plane = (typeof PLANES)[number]

const STORAGE_KEY = 'conciv:design-xray'

const ORBIT_TILT = 58

const ORBIT_TURN = -28

const TILT_MAX = 85

const SavedSchema = z.object({
  on: z.boolean().default(false).catch(false),
  threeD: z.boolean().default(false).catch(false),
  layers: z
    .object({dom: z.boolean(), fom: z.boolean(), changed: z.boolean()})
    .default({dom: true, fom: true, changed: false})
    .catch({dom: true, fom: true, changed: false}),
  magnitudes: z
    .object({
      much: z.boolean(),
      noticeably: z.boolean(),
      slightly: z.boolean(),
      reflow: z.boolean(),
      paint: z.boolean(),
      matched: z.boolean(),
    })
    .default({much: true, noticeably: true, slightly: true, reflow: true, paint: true, matched: false})
    .catch({much: true, noticeably: true, slightly: true, reflow: true, paint: true, matched: false}),
})

type XrayState = z.output<typeof SavedSchema> & {
  pick: boolean
  column: boolean
  width: number | null
  round: number | null
  picked: string | null
  plane: Plane | null
  orbit: {tilt: number; turn: number}
}

const ESCAPES: {when: (state: XrayState) => boolean; apply: (draft: XrayState) => void}[] = [
  {
    when: (state) => state.on && state.plane !== null,
    apply: (draft) => {
      draft.plane = null
    },
  },
  {
    when: (state) => state.on && state.picked !== null,
    apply: (draft) => {
      draft.picked = null
    },
  },
  {
    when: (state) => state.on && state.pick,
    apply: (draft) => {
      draft.pick = false
    },
  },
  {
    when: (state) => state.on,
    apply: (draft) => {
      draft.on = false
    },
  },
]

function transitions(): boolean {
  return 'startViewTransition' in document && !matchMedia(REDUCED_MOTION).matches
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function parseSaved(raw: string): z.output<typeof SavedSchema> | undefined {
  const parsed = SavedSchema.safeParse(JSON.parse(raw))
  return parsed.success ? parsed.data : undefined
}
