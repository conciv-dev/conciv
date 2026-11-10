import {omit} from 'es-toolkit'
import type {Component, Scheme, TokenMap} from '../../shared/catalog-defs.js'
import type {GateRow} from '../../shared/defs.js'

export function classifyDrift(input: {
  rows: GateRow[]
  relation: Map<string, Component>
  tokens: TokenMap
  scheme: Scheme
}): GateRow[] {
  const judged = input.rows.map((row) => ({row, drift: driftOf({...input, row})}))
  const groups = Map.groupBy(
    judged.flatMap((entry) => (entry.drift === null ? [] : [entry.drift])),
    (drift) => drift.key,
  )
  return judged.flatMap(({row, drift}) => {
    if (drift === null) return [bare(row)]
    return groups.get(drift.key)?.[0] === drift ? [drift.row] : []
  })
}

type Drift = {key: string; row: GateRow}

const ALTERNATIVES = ' or '

function driftOf(input: {
  row: GateRow
  relation: Map<string, Component>
  tokens: TokenMap
  scheme: Scheme
}): Drift | null {
  const {row, relation, tokens, scheme} = input
  const {token, pageValue, designValue} = row
  if (row.magnitude !== 'paint' || token === undefined || token === null) return null
  if (pageValue === undefined || designValue === undefined) return null
  const component = relation.get(row.node)
  if (component === undefined) return null
  const kit = tokens
    .kitTokensFor({kind: row.kind, value: pageValue, scheme})
    .map((kitToken) => kitToken.name)
    .join(ALTERNATIVES)
  if (kit === '') return null
  const name = component.names[0] ?? component.specifier
  return {
    key: `${component.id}\n${kit}`,
    row: {
      ...bare(row),
      magnitude: 'token-drift',
      component: name,
      kitToken: kit,
      designToken: token,
      text: `${name} uses ${kit} (${pageValue}); the design wants ${token} (${designValue})`,
    },
  }
}

function bare(row: GateRow): GateRow {
  return omit(row, ['pageValue', 'designValue'])
}
