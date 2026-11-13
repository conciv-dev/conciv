import {Effect, Schema} from 'effect'
import {toolExpression} from './index.js'

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

export type ToolDescription = {
  readonly path: string
  readonly description: string
  readonly signature: string
}

const defaultSearchLimit = 10
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const SearchInput = Schema.Struct({
  query: Schema.optionalKey(Schema.String),
  namespace: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(PositiveInt),
  offset: Schema.optionalKey(NonNegativeInt),
})
const SearchItem = Schema.Struct({
  path: Schema.String,
  description: Schema.String,
  signature: Schema.String,
})
const SearchOutput = Schema.Struct({
  items: Schema.Array(SearchItem),
  remaining: NonNegativeInt,
  next: Schema.NullOr(Schema.Struct({offset: NonNegativeInt})),
})

export type SearchEntry = {
  readonly description: ToolDescription
  readonly position: number
  readonly text: () => Readonly<Record<SearchField, ReadonlyArray<string>>>
  readonly nameLength: number
}

type SearchField = 'namespace' | 'name' | 'description' | 'parameters' | 'namespaceDescription'

const fieldWeights: Record<SearchField, number> = {
  name: 3,
  namespace: 2,
  description: 1,
  namespaceDescription: 0.4,
  parameters: 0.3,
}
const searchFields = Object.keys(fieldWeights) as ReadonlyArray<SearchField>
const k1 = 1.2
const lengthNormalization = 0.75
const brevityBoost = 0.5
const prefixWeight = 0.3

const splitWords = (text: string): Array<string> =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0)

const stem = (word: string) => {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.length > 4 && /(?:ss|sh|ch|x|z|us)es$/.test(word)) return word.slice(0, -2)
  if (word.length > 2 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1)
  return word
}

const searchWords = (text: string) =>
  splitWords(text)
    .concat((text.match(/[A-Za-z0-9]*[a-z0-9][A-Z][A-Za-z0-9]*/g) ?? []).map((word) => word.toLowerCase()))
    .map(stem)

const fieldWords = (text: string, cache: Map<string, ReadonlyArray<string>>) => {
  const cached = cache.get(text)
  if (cached) return cached
  const words = searchWords(text)
  cache.set(text, words)
  return words
}

type WordIndex = {
  readonly postings: ReadonlyMap<string, {readonly positions: Int32Array; readonly weights: Float32Array}>
  readonly documents: number
  readonly words: ReadonlyArray<string>
}

const wordIndexes = new WeakMap<ReadonlyArray<SearchEntry>, WordIndex>()

const shared =
  typeof WeakRef === 'undefined' || typeof FinalizationRegistry === 'undefined'
    ? undefined
    : {
        indexes: new Map<string, WeakRef<WordIndex>>(),
        cleanup: new FinalizationRegistry<{key: string; ref: WeakRef<WordIndex>}>(({key, ref}) => {
          if (shared?.indexes.get(key) === ref) shared.indexes.delete(key)
        }),
      }

const wordIndexFor = (index: ReadonlyArray<SearchEntry>): WordIndex => {
  const cached = wordIndexes.get(index)
  if (cached) return cached
  const texts = index.map((entry) => entry.text())
  const key = shared ? textKey(texts) : undefined
  const reused = key === undefined ? undefined : shared?.indexes.get(key)?.deref()
  if (reused) {
    wordIndexes.set(index, reused)
    return reused
  }
  const built = buildWordIndex(texts)
  wordIndexes.set(index, built)
  if (shared && key !== undefined) {
    const ref = new WeakRef(built)
    shared.indexes.set(key, ref)
    shared.cleanup.register(built, {key, ref})
  }
  return built
}

const textKey = (texts: ReadonlyArray<Readonly<Record<SearchField, ReadonlyArray<string>>>>) => {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  const add = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      first = Math.imul(first ^ code, 0x01000193)
      second = Math.imul(second ^ code, 0x5bd1e995)
      second ^= second >>> 15
    }
    first = Math.imul(first ^ 0x1f, 0x01000193)
    second = Math.imul(second ^ 0x1f, 0x5bd1e995)
  }
  for (const text of texts)
    for (const field of searchFields) {
      for (const part of text[field]) add(part)
      add('\u0000')
    }
  return `${texts.length}:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`
}

const buildWordIndex = (texts: ReadonlyArray<Readonly<Record<SearchField, ReadonlyArray<string>>>>): WordIndex => {
  const cache = new Map<string, ReadonlyArray<string>>()
  const words = (texts: ReadonlyArray<string>) => texts.flatMap((text) => fieldWords(text, cache))
  const fields = texts.map((text) => {
    return {
      namespace: words(text.namespace),
      name: words(text.name),
      description: words(text.description),
      parameters: words(text.parameters),
      namespaceDescription: words(text.namespaceDescription),
    }
  })
  const averageLength = Object.fromEntries(
    searchFields.map((field) => [
      field,
      fields.reduce((sum, entry) => sum + entry[field].length, 0) / texts.length || 1,
    ]),
  ) as Record<SearchField, number>
  const building = new Map<string, {positions: Array<number>; weights: Array<number>}>()
  const weights = new Map<string, number>()
  fields.forEach((entry, position) => {
    weights.clear()
    for (const field of searchFields) {
      const weight =
        fieldWeights[field] /
        (1 - lengthNormalization + (lengthNormalization * entry[field].length) / averageLength[field])
      for (const word of entry[field]) weights.set(word, (weights.get(word) ?? 0) + weight)
    }
    for (const [word, weight] of weights) {
      let posting = building.get(word)
      if (!posting) building.set(word, (posting = {positions: [], weights: []}))
      posting.positions.push(position)
      posting.weights.push(weight)
    }
  })
  const postings = new Map(
    [...building].map(([word, posting]) => [
      word,
      {positions: Int32Array.from(posting.positions), weights: Float32Array.from(posting.weights)},
    ]),
  )
  return {postings, documents: texts.length, words: [...postings.keys()].sort()}
}

const prefixMatches = (words: WordIndex, term: string): Array<readonly [string, number]> => {
  if (term.length < 4) return []
  let low = 0
  let high = words.words.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((words.words[middle] ?? '') < term) low = middle + 1
    else high = middle
  }
  const matches: Array<readonly [string, number]> = []
  for (let i = low; i < words.words.length && (words.words[i] ?? '').startsWith(term); i++)
    if (words.words[i] !== term) matches.push([words.words[i] ?? '', prefixWeight])
  return matches
}

const rank = (
  entries: ReadonlyArray<SearchEntry>,
  query: string,
  index: ReadonlyArray<SearchEntry>,
): Array<SearchEntry> => {
  const terms = searchWords(query)
  if (terms.length === 0)
    return [...entries].sort((left, right) => compareText(left.description.path, right.description.path))
  const words = wordIndexFor(index)
  const allowed = entries === index ? undefined : new Set(entries.map((entry) => entry.position))
  const scores = new Map<number, number>()
  for (const term of terms) {
    const best = new Map<number, number>()
    for (const [word, factor] of [[term, 1] as const, ...prefixMatches(words, term)]) {
      const posting = words.postings.get(word)
      if (!posting) continue
      const idf = Math.log(1 + (words.documents - posting.positions.length + 0.5) / (posting.positions.length + 0.5))
      for (let i = 0; i < posting.positions.length; i++) {
        const position = posting.positions[i] ?? 0
        if (allowed && !allowed.has(position)) continue
        const weight = posting.weights[i] ?? 0
        const score = (factor * idf * weight * (k1 + 1)) / (weight + k1)
        if (score > (best.get(position) ?? 0)) best.set(position, score)
      }
    }
    for (const [position, score] of best) scores.set(position, (scores.get(position) ?? 0) + score)
  }
  return [...scores]
    .flatMap(([position, score]) => {
      const entry = index[position]
      return entry === undefined ? [] : [{entry, score: score * (1 + brevityBoost / Math.max(1, entry.nameLength))}]
    })
    .sort(
      (left, right) =>
        right.score - left.score || compareText(left.entry.description.path, right.entry.description.path),
    )
    .map(({entry}) => entry)
}

export type SearchTool = {
  readonly description: string
  readonly input: typeof SearchInput
  readonly output: typeof SearchOutput
  readonly execute: (input: unknown) => Effect.Effect<typeof SearchOutput.Type>
}

export const makeSearchTool = (searchIndex: ReadonlyArray<SearchEntry>): SearchTool => ({
  description: 'Search available tools',
  input: SearchInput,
  output: SearchOutput,
  execute: (input) =>
    Effect.sync(() => {
      const request = input as typeof SearchInput.Type
      const query = request.query ?? ''
      const offset = request.offset ?? 0
      let ns = request.namespace
      if (ns !== undefined && !searchIndex.some((entry) => entry.description.path.startsWith('tools.'))) {
        if (ns === 'tools') ns = undefined
        else if (ns.startsWith('tools.')) ns = ns.slice('tools.'.length)
      }
      const scoped =
        ns === undefined
          ? searchIndex
          : searchIndex.filter((entry) => entry.description.path === ns || entry.description.path.startsWith(`${ns}.`))
      const trimmed = query.trim()
      const pathQuery = trimmed.startsWith('tools.') ? trimmed.slice('tools.'.length) : trimmed
      const exact =
        pathQuery === ''
          ? undefined
          : scoped.find(
              (entry) => entry.description.path === pathQuery || toolExpression(entry.description.path) === trimmed,
            )
      const ranked = exact !== undefined ? [exact] : rank(scoped, pathQuery, searchIndex)
      const items = ranked.slice(offset, offset + (request.limit ?? defaultSearchLimit)).map(({description}) => ({
        ...description,
        path: toolExpression(description.path),
      }))
      const remaining = Math.max(0, ranked.length - offset - items.length)
      return {
        items,
        remaining,
        next: remaining > 0 ? {offset: offset + items.length} : null,
      }
    }),
})

export type VisibleTool = {
  readonly description: ToolDescription
  readonly parameters: ReadonlyArray<string>
  readonly namespaces: ReadonlyArray<{readonly description?: string}>
}

const toSearchEntry = (visible: VisibleTool, position: number): SearchEntry => {
  const segments = visible.description.path.split('.')
  const name = segments.at(-1) ?? ''
  return {
    description: visible.description,
    position,
    text: () => ({
      namespace: segments.slice(0, -1),
      name: [name],
      description: [visible.description.description],
      parameters: visible.parameters,
      namespaceDescription: visible.namespaces.map((namespace) => namespace.description ?? ''),
    }),
    nameLength: splitWords(name).length,
  }
}

export const prepare = (tools: ReadonlyArray<VisibleTool>): ReadonlyArray<SearchEntry> =>
  tools.toSorted((left, right) => compareText(left.description.path, right.description.path)).map(toSearchEntry)
