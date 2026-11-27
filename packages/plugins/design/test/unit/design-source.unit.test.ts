import * as NodeServices from '@effect/platform-node/NodeServices'
import {it} from '@effect/vitest'
import {Effect, Layer} from 'effect'
import {describe, expect} from 'vitest'
import {loadFigma} from '../../src/sources/figma.js'
import {walk} from '../../src/model/tree.js'
import {figmaNetwork, type FigmaAnswer} from '../utils/figma-network.js'

describe('a Figma frame becomes the design tree', () => {
  const link = {fileKey: 'FILEKEY', nodeId: '1:2'}
  const token = 'figd_secret-token'
  const nodes = {path: '/files/FILEKEY/nodes?ids=1%3A2', status: 200, fixture: 'figma-pricing-nodes.json'}
  const variables = {path: '/files/FILEKEY/variables/local', status: 200, fixture: 'figma-pricing-variables.json'}

  const answered = (answers: FigmaAnswer[]) =>
    Effect.provide(figmaNetwork(answers).pipe(Layer.provide(NodeServices.layer)))

  it.effect('reads the frame over REST into nodes, implied groups, reflow, roles, components and tokens', () =>
    Effect.gen(function* () {
      const unsourced = yield* loadFigma({link, token: undefined, document: undefined}).pipe(answered([]), Effect.flip)
      expect(unsourced.code).toBe('design.FIGMA_SOURCE')
      expect(unsourced.fix).toContain('figma.token')

      const {design, warnings} = yield* loadFigma({link, token, document: undefined}).pipe(answered([nodes, variables]))
      expect(design.source).toEqual({kind: 'figma', ref: 'FILEKEY/1:2'})
      expect(design.viewport).toEqual({width: 1440, height: 900})
      expect(warnings).toEqual(['tokens: 1 variable names from Figma'])
      const tree = [...walk(design.root)].map(({node, depth}) => `${'  '.repeat(depth)}${node.id} ${node.kind}`)
      expect(tree).toEqual([
        '1:2 box',
        '  1:3 box',
        '    1:4 text',
        '    1:5 text',
        '    1:6 text',
        '  w:1:7 box',
        '    1:7 text',
        '    1:8 text',
        '    1:40 image',
        '  1:9 box',
        '    1:10 box',
        '      1:11 text',
        '      1:12 text',
        '    1:20 box',
        '      1:21 text',
        '      1:22 text',
        '    1:30 box',
        '      1:31 text',
        '      1:32 text',
      ])
      const byId = new Map([...walk(design.root)].map(({node}) => [node.id, node]))
      expect(byId.get('w:1:7')).toMatchObject({implied: true, reflow: {kind: 'stack'}, gate: {kind: 'wrapper'}})
      expect(byId.get('1:3')?.layout).toMatchObject({
        direction: 'row',
        gap: {px: 32},
        align: 'center',
        padding: {top: 24, right: 24, bottom: 24, left: 24},
      })
      expect(byId.get('1:9')?.reflow).toEqual({kind: 'wrap', minChildWidth: 280, breakpoint: 1280})
      expect(byId.get('1:10')?.figma).toMatchObject({component: 'Plan card', fields: {tokens: {fill: 'surface/card'}}})
      expect(byId.get('1:12')).toMatchObject({kind: 'text', text: '$12', role: 'data'})
      expect(byId.get('1:11')).toMatchObject({kind: 'text', text: 'Starter', role: 'unknown'})

      const keptIds = yield* loadFigma({link, token, document: undefined}).pipe(answered([nodes]))
      expect(keptIds.warnings).toEqual([expect.stringContaining('tokens: variable ids kept')])
      expect([...walk(keptIds.design.root)].find(({node}) => node.id === '1:10')?.node.figma?.fields.tokens).toEqual({
        fill: 'VariableID:1:1',
      })

      const refused = yield* loadFigma({link, token, document: undefined}).pipe(
        answered([{...nodes, status: 403, fixture: 'figma-refused-token.json'}]),
        Effect.flip,
      )
      expect(refused.code).toBe('design.FIGMA_TOKEN')
      expect(refused.message).toBe('Figma refused the token: Invalid token')
      expect(JSON.stringify({...refused, message: refused.message, fix: refused.fix})).not.toContain(token)
    }),
  )
})
