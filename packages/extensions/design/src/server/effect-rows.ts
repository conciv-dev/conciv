import {parse} from 'culori'
import {z} from 'zod'
import type {DesignNode, GateRow, LiveComponent} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import type {readIds} from '../shared/id-tree.js'

export function effectRows(input: {root: DesignNode; reads: ReturnType<typeof readIds>}): GateRow[] {
  const {reads} = input
  return [...walk(input.root)].flatMap(({node}) => {
    const effects = EffectsSchema.parse(node.figma?.fields.effects)
    const [element] = reads.of(node.id)
    if (effects.length === 0 || element === undefined) return []
    return effects.flatMap((effect): GateRow[] => {
      if (drawn({effect, element})) return []
      return [
        {
          node: node.id,
          ...reads.named(node.id),
          kind: node.gate?.kind ?? node.kind,
          name: node.figma?.name ?? '',
          text: `wrong effect at [${node.id}]: ${told(effect)} expected, ${found({effect, element})} found`,
          magnitude: 'paint',
          token: null,
          property: EFFECT,
          expected: told(effect),
          actual: found({effect, element}),
          delta: null,
        },
      ]
    })
  })
}

const EFFECT = 'effect'
const NONE = 'none'
const INNER = 'inner-shadow'
const DROP = 'drop-shadow'
const LAYER = 'layer-blur'
const PERCENT = 100
const OPACITY_SLACK = 0.1
const {geometryPx, colorDeltaE} = designConfig.tolerances

const EffectSchema = z.object({
  type: z.string(),
  color: z.string().default('#000000'),
  opacity: z.number().default(1),
  x: z.number().default(0),
  y: z.number().default(0),
  blur: z.number().default(0),
  spread: z.number().default(0),
})
const EffectsSchema = z.array(EffectSchema).catch([])

type Effect = z.output<typeof EffectSchema>
type Shadow = LiveComponent['styles']['shadows'][number]

function drawn(input: {effect: Effect; element: LiveComponent}): boolean {
  const {effect, element} = input
  const {styles} = element
  if (effect.type === LAYER) return styles.blur.layer > 0
  if (effect.type !== INNER && effect.type !== DROP) return styles.blur.background > 0
  return styles.shadows.some((shadow) => matches({effect, shadow}))
}

function matches(input: {effect: Effect; shadow: Shadow}): boolean {
  const {effect, shadow} = input
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= geometryPx
  const color = parse(shadow.color)
  if (color === undefined || shadow.inset !== (effect.type === INNER)) return false
  return (
    near(shadow.x, effect.x) &&
    near(shadow.y, effect.y) &&
    near(shadow.blur, effect.blur) &&
    near(shadow.spread, effect.spread) &&
    Math.abs((color.alpha ?? 1) - effect.opacity) <= OPACITY_SLACK &&
    designConfig.colorMetrics.ciede2000({a: shadow.color, b: effect.color}) <= colorDeltaE
  )
}

function told(effect: Effect): string {
  if (effect.type !== INNER && effect.type !== DROP) return `${effect.type.replace('-', ' ')} ${effect.blur}px`
  const {x, y, blur, spread, color, opacity} = effect
  return `${effect.type.replace('-', ' ')} ${x} ${y} ${blur}px ${spread}px ${color} at ${Math.round(opacity * PERCENT)}%`
}

function found(input: {effect: Effect; element: LiveComponent}): string {
  const {effect, element} = input
  const {styles} = element
  if (effect.type === LAYER) return styles.blur.layer > 0 ? `blur ${styles.blur.layer}px` : NONE
  if (effect.type !== INNER && effect.type !== DROP)
    return styles.blur.background > 0 ? `backdrop blur ${styles.blur.background}px` : NONE
  if (styles.shadows.length === 0) return NONE
  return styles.shadows
    .map(({inset, x, y, blur, spread, color}) => `${inset ? 'inset ' : ''}${x} ${y} ${blur}px ${spread}px ${color}`)
    .join(', ')
}
