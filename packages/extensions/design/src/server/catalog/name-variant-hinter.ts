import {intersection, maxBy, orderBy, words} from 'es-toolkit'
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

const FUZZY_CEILING = 1 - designConfig.tolerances.pairMargin

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

type Scored = {component: string; specifier: string; score: number; linked: boolean}

function bestOf(input: {node: DesignNode; ranked: Ranked[]}): Scored | null {
  const raw = input.node.figma?.name ?? ''
  const name = folded(raw)
  if (name === '') return null
  const main = folded(input.node.figma?.component ?? '')
  const variants = variantsOf(input.node)
  const said = lowerWords(raw)
  const spoken = namedSpans({words: said, ranked: input.ranked})
  const scored = input.ranked.map((component) => scoreOf({name, main, said, variants, component, spoken}))
  const linked = scored.filter((entry) => entry.linked)
  const [top, runner] = orderBy(linked.length > 0 ? linked : scored, [(entry) => entry.score], ['desc'])
  if (top === undefined) return null
  if (runner !== undefined && top.score - runner.score < designConfig.tolerances.pairMargin) return null
  return top.linked ? top : {...top, score: Math.min(top.score, FUZZY_CEILING)}
}

function scoreOf(input: {
  name: string
  main: string
  said: string[]
  variants: string[]
  component: Ranked
  spoken: Span[]
}): Scored {
  const {name, main, said, variants, component, spoken} = input
  const link = main === '' ? undefined : component.names.find((candidate) => folded(candidate) === main)
  const whole = link ?? component.names.find((candidate) => spoken.some((span) => span.name === candidate))
  const named =
    whole ?? maxBy(component.names, (candidate) => SIMILARITY.text.similarity({a: name, b: folded(candidate)}))
  const nameScore = whole === undefined ? textScore({name, said, candidate: named}) : 1
  const values = new Set(
    component.props === 'see file'
      ? []
      : component.props.flatMap((prop) => prop.values.map((value) => value.toLowerCase())),
  )
  const fit = variants.length === 0 ? null : variants.filter((value) => values.has(value)).length / variants.length
  const score =
    fit === null ? nameScore : (nameScore * NAME_WEIGHT + fit * VARIANT_WEIGHT) / (NAME_WEIGHT + VARIANT_WEIGHT)
  return {
    component: named ?? component.names[0] ?? '',
    specifier: component.specifier,
    score,
    linked: link !== undefined,
  }
}

function textScore(input: {name: string; said: string[]; candidate: string | undefined}): number {
  if (input.candidate === undefined) return 0
  if (intersection(input.said, lowerWords(input.candidate)).length === 0) return 0
  return SIMILARITY.text.similarity({a: input.name, b: folded(input.candidate)})
}

type Span = {name: string; start: number; end: number}

function namedSpans(input: {words: string[]; ranked: Ranked[]}): Span[] {
  const found = input.ranked.flatMap((component) =>
    component.names.flatMap((name) => spansOf({name, words: input.words})),
  )
  return found.filter(
    (span) =>
      !found.some(
        (other) =>
          other.end - other.start > span.end - span.start && other.start <= span.start && span.end <= other.end,
      ),
  )
}

function spansOf(input: {name: string; words: string[]}): Span[] {
  const wanted = lowerWords(input.name)
  if (wanted.length === 0) return []
  return input.words.flatMap((_, start) =>
    wanted.every((word, offset) => input.words[start + offset] === word)
      ? [{name: input.name, start, end: start + wanted.length}]
      : [],
  )
}

function lowerWords(text: string): string[] {
  return words(text).map((word) => word.toLowerCase())
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
