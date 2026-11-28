import {Effect} from 'effect'
import {z} from 'zod'
import type {DesignNode} from '../model/design.js'
import type {FigmaLink} from './figma-link.js'
import {figmaGet, type FigmaKey} from './figma-rest.js'

const VariablesSchema = z.looseObject({
  meta: z.looseObject({variables: z.record(z.string(), z.looseObject({name: z.string()}))}),
})
const TokensSchema = z.record(z.string(), z.string())

export const namedTokens = Effect.fn('design.namedTokens')(function* (input: {
  root: DesignNode
  link: FigmaLink
  key: FigmaKey | null
}) {
  const {root, link, key} = input
  if (key === null) return {root, line: 'tokens: variable ids kept, no Figma key'}
  return yield* figmaGet({path: `/files/${link.fileKey}/variables/local`, key, link}).pipe(
    Effect.match({
      onFailure: (error) => ({
        root,
        line: `tokens: variable ids kept, the variables endpoint failed: ${error.message}`,
      }),
      onSuccess: (body) => {
        const parsed = VariablesSchema.safeParse(body)
        if (!parsed.success)
          return {root, line: 'tokens: variable ids kept, the variables endpoint answered an unexpected shape'}
        const names = new Map(Object.entries(parsed.data.meta.variables).map(([id, entry]) => [id, entry.name]))
        return {root: renamed({node: root, names}), line: `tokens: ${names.size} variable names from Figma`}
      },
    }),
  )
})

function renamed(input: {node: DesignNode; names: Map<string, string>}): DesignNode {
  const {node, names} = input
  const children = node.children.map((child) => renamed({node: child, names}))
  const facts = node.figma
  const tokens = TokensSchema.safeParse(facts?.fields.tokens)
  if (facts === undefined || !tokens.success) return {...node, children}
  const named = Object.fromEntries(Object.entries(tokens.data).map(([field, id]) => [field, names.get(id) ?? id]))
  return {...node, children, figma: {...facts, fields: {...facts.fields, tokens: named}}}
}
