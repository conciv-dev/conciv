import {z} from 'zod'
import type {DesignNode} from '../../shared/defs.js'

export async function namedTokens(input: {
  root: DesignNode
  fileKey: string | null
  token: string | null
}): Promise<{root: DesignNode; line: string}> {
  const {root, fileKey, token} = input
  if (fileKey === null || token === null)
    return {root, line: 'tokens: variable ids kept, no Figma file key or no FIGMA_API_KEY'}
  const response = await fetch(`${FIGMA_API}/files/${fileKey}/variables/local`, {
    headers: {'X-Figma-Token': token},
  }).catch(() => null)
  if (response === null || response.status !== OK)
    return {root, line: `tokens: variable ids kept, the variables endpoint answered ${response?.status ?? 'nothing'}`}
  const parsed = VariablesSchema.safeParse(await response.json())
  if (!parsed.success)
    return {root, line: 'tokens: variable ids kept, the variables endpoint answered an unexpected shape'}
  const names = new Map(Object.entries(parsed.data.meta.variables).map(([id, entry]) => [id, entry.name]))
  return {root: renamed({node: root, names}), line: `tokens: ${names.size} variable names from Figma`}
}

const FIGMA_API = 'https://api.figma.com/v1'
const OK = 200
const VariablesSchema = z.looseObject({
  meta: z.looseObject({variables: z.record(z.string(), z.looseObject({name: z.string()}))}),
})
const TokensSchema = z.record(z.string(), z.string())

function renamed(input: {node: DesignNode; names: Map<string, string>}): DesignNode {
  const {node, names} = input
  const children = node.children.map((child) => renamed({node: child, names}))
  const facts = node.figma
  const tokens = TokensSchema.safeParse(facts?.fields.tokens)
  if (facts === undefined || !tokens.success) return {...node, children}
  const named = Object.fromEntries(Object.entries(tokens.data).map(([field, id]) => [field, names.get(id) ?? id]))
  return {...node, children, figma: {...facts, fields: {...facts.fields, tokens: named}}}
}
