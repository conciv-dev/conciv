import {maxBy, orderBy} from 'es-toolkit'
import {z} from 'zod'
import type {DesignNode} from '../../shared/defs.js'
import type {Hint, Hinter, Ranked} from '../../shared/catalog-defs.js'
import {designConfig} from '../../shared/tolerances.js'
import {walk} from '../../shared/tree.js'
import {createSimilarity} from '../pairers/similarity.js'

export function createNameVariantHinter(): Hinter {
  return {
    name: HINTER_NAME,
    hint: ({design, ranked, config}) =>
      new Map(
        [...walk(design.root)].flatMap(({node}) => {
          const best = bestOf({node, ranked})
          if (best === null || best.score < config.hintConfidence) return []
          const hint: Hint = {component: best.component, specifier: best.specifier, confidence: best.score}
          return [[node.id, hint] satisfies [string, Hint]]
        }),
      ),
  }
}

const HINTER_NAME = 'name-variant'

const VARIANT = 'VARIANT'

const SIMILARITY = createSimilarity()

const NAME_WEIGHT = SIMILARITY.voters.find((voter) => voter.name === 'text')?.base ?? 0

const VARIANT_WEIGHT = SIMILARITY.voters.find((voter) => voter.name === 'style')?.base ?? 0

const ComponentPropertiesSchema = z
  .object({
    componentProperties: z
      .record(z.string(), z.object({type: z.string(), value: z.unknown()}))
      .catch({})
      .default({}),
  })
  .catch({componentProperties: {}})

type Scored = {component: string; specifier: string; score: number}

function bestOf(input: {node: DesignNode; ranked: Ranked[]}): Scored | null {
  const name = folded(input.node.figma?.name ?? '')
  if (name === '') return null
  const variants = variantsOf(input.node)
  const scored = input.ranked.map((component) => scoreOf({name, variants, component}))
  const [top, runner] = orderBy(scored, [(entry) => entry.score], ['desc'])
  if (top === undefined) return null
  if (runner !== undefined && top.score - runner.score < designConfig.tolerances.pairMargin) return null
  return top
}

function scoreOf(input: {name: string; variants: string[]; component: Ranked}): Scored {
  const {name, variants, component} = input
  const named = maxBy(component.names, (candidate) => SIMILARITY.text.similarity({a: name, b: folded(candidate)}))
  const nameScore = named === undefined ? 0 : SIMILARITY.text.similarity({a: name, b: folded(named)})
  const values = new Set(
    component.props === 'see file'
      ? []
      : component.props.flatMap((prop) => prop.values.map((value) => value.toLowerCase())),
  )
  const fit = variants.length === 0 ? null : variants.filter((value) => values.has(value)).length / variants.length
  const score =
    fit === null ? nameScore : (nameScore * NAME_WEIGHT + fit * VARIANT_WEIGHT) / (NAME_WEIGHT + VARIANT_WEIGHT)
  return {component: named ?? component.names[0] ?? '', specifier: component.specifier, score}
}

function variantsOf(node: DesignNode): string[] {
  const {componentProperties} = ComponentPropertiesSchema.parse(node.figma?.fields ?? {})
  return Object.values(componentProperties).flatMap((property) =>
    property.type === VARIANT && typeof property.value === 'string' ? [property.value.toLowerCase()] : [],
  )
}

function folded(text: string): string {
  return [...text.toLowerCase()]
    .filter((char) => char.toLowerCase() !== char.toUpperCase() || (char >= '0' && char <= '9'))
    .join('')
}
