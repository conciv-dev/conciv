import {parseArgs} from 'node:util'
import {z} from 'zod'
import {concivHome, homeCatalog} from '@conciv/db'
import {DesignSchema, IdTreeSchema, type IdNode, type LiveComponent} from '@conciv/extension-design/defs'
import {designConfig} from '../../../extensions/design/src/shared/tolerances.js'
import {walk} from '../../../extensions/design/src/shared/tree.js'
import {createRaster} from '../../../extensions/design/src/server/raster.js'
import {createFigmaNodePairer} from '../../../extensions/design/src/server/pairers/figma-nodes.js'

export async function rescore(argv: string[]): Promise<void> {
  const {positionals} = parseArgs({args: argv, allowPositionals: true})
  const [run, round] = z.tuple([z.coerce.number().int(), z.coerce.number().int()]).parse(positionals)
  const {sources} = homeCatalog(concivHome({env: process.env}))
  const read = (from: string, where: string, select: string[]) =>
    sources.read({from, where: `run == ${run} && ${where}`, select})
  const rounds = RoundsSchema.parse(await read('design_stored_rounds', `round == ${round}`, ['target', 'ids']))
  if (rounds.length === 0) return print(`run ${run} has no round ${round} in the store`)
  for (const {target, ids} of rounds) {
    const at = `target == ${JSON.stringify(target)}`
    if (ids === null) {
      print(`run ${run} ${target} round ${round}: no stored id tree; nothing to replay`)
      continue
    }
    const [stored] = DesignsSchema.parse(await read('design_stored_targets', at, ['design']))
    if (stored === undefined) throw new Error(`run ${run} stores no target ${target}`)
    const [before, held, names] = await Promise.all([
      read('design_stored_votes', `${at} && round == ${round} && won`, ['node', 'candidate']),
      read('design_stored_fom', `${at} && round == ${round - 1}`, ['node', 'id', 'instance', 'margin']),
      read('design_stored_nodes', at, ['node', 'name']),
    ])
    const lives = livesOf(ids.root)
    const [first, ...rest] = lives
    if (first === undefined) {
      print(`run ${run} ${target} round ${round}: the stored id tree holds no element`)
      continue
    }
    const raster = createRaster({pixels: new Uint8Array(BLANK), width: 1, height: 1})
    const paired = await createFigmaNodePairer()({
      design: stored.design,
      measured: {
        live: {...first, children: rest},
        raster,
        route: '/',
        width: stored.design.viewport.width,
        path: 'region',
        sources: ['dom'],
        overflowX: false,
        queries: [],
        sheets: '',
        framework: 'react',
        masks: [],
        scheme: 'light',
      },
      target: raster,
      ids: ids.root,
      pins: pinsOf({root: ids.root, held: FomSchema.parse(held)}),
      budget: designConfig.tolerances.pairBudgetMs,
    })
    const was = new Map(PairsSchema.parse(before).map((pair) => [pair.node, pair.candidate]))
    const now = new Map(paired.votes.filter((ballot) => ballot.won).map((ballot) => [ballot.node, ballot.candidate]))
    const named = new Map(NamesSchema.parse(names).map((node) => [node.node, node.name]))
    const changed = [...new Set([...was.keys(), ...now.keys()])].filter((node) => was.get(node) !== now.get(node))
    changed.forEach((node) =>
      print(`${node} ${named.get(node) ?? ''}: ${was.get(node) ?? 'unpaired'} -> ${now.get(node) ?? 'unpaired'}`),
    )
    print(`run ${run} ${target} round ${round}: paired before ${was.size} after ${now.size}, changed ${changed.length}`)
  }
}

const BLANK = [255, 255, 255, 255]

const RoundsSchema = z.array(z.object({target: z.string(), ids: IdTreeSchema.nullable()}))

const DesignsSchema = z.array(z.object({design: DesignSchema}))

const PairsSchema = z.array(z.object({node: z.string(), candidate: z.string()}))

const FomSchema = z.array(
  z.object({node: z.string(), id: z.string(), instance: z.string().nullable(), margin: z.number()}),
)

const NamesSchema = z.array(z.object({node: z.string(), name: z.string()}))

function livesOf(root: IdNode): LiveComponent[] {
  return [...walk(root)].flatMap(({node}) =>
    node.dom.flatMap((dom, index) => {
      const cssom = node.cssom[index]
      if (cssom === undefined) return []
      const {path: _path, columns, ...styles} = cssom
      return [
        {
          source: null,
          key: node.id,
          instance: dom.instance,
          repeat: null,
          owner: null,
          tag: node.src.element,
          text: dom.text,
          box: dom.box,
          bounds: dom.box,
          scrolls: false,
          textBox: null,
          glyphs: [],
          axis: null,
          columns,
          styles,
          role: null,
          hints: node.src.classes,
          index: 1,
          path: dom.path,
          drawn: dom.drawn,
          placeholder: null,
          children: [],
        },
      ]
    }),
  )
}

function pinsOf(input: {
  root: IdNode
  held: z.output<typeof FomSchema>
}): {node: string; path: string; margin: number}[] {
  const sites = new Map([...walk(input.root)].map(({node}) => [node.id, node]))
  return input.held.flatMap((entry) => {
    const dom = (sites.get(entry.id)?.dom ?? []).filter(
      (each) => entry.instance === null || each.instance === entry.instance,
    )
    const [only] = dom
    return only === undefined || dom.length > 1 ? [] : [{node: entry.node, path: only.path, margin: entry.margin}]
  })
}

function print(text: string): void {
  process.stdout.write(`${text}\n`)
}
