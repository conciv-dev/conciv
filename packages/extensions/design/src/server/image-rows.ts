import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {PageNodeShotSchema, screenshotNodeDef} from '@conciv/extension-page/defs'
import type {Design, GateRow} from '../shared/defs.js'
import type {readIds} from '../shared/id-tree.js'
import {designConfig} from '../shared/tolerances.js'
import {createRaster} from './raster.js'
import {nodeLooks} from './node-look.js'

export async function imageRowsOf(input: {
  design: Design
  reads: ReturnType<typeof readIds>
  page: ServerToolPageAccess
}): Promise<{rows: GateRow[]; ratios: {node: string; ratio: number}[]}> {
  const {reads, page} = input
  const found = await Promise.all(
    nodeLooks(input.design).flatMap((look): Promise<Found>[] => {
      const element = reads.of(look.node)[0]
      const named = reads.named(look.node)
      if (look.asset === null || element === undefined || named.selector === null) return []
      const row = (text: string): GateRow => ({
        node: look.node,
        ...named,
        kind: IMAGE,
        name: look.name,
        text,
        magnitude: 'paint',
        token: null,
      })
      const expected = `wrong image at [${look.node}]: ${look.asset} expected`
      if ((element.styles.image ?? '') === '')
        return [Promise.resolve({row: row(`${expected}, the element shows no image`), ratio: null})]
      return [
        captured({page, selector: named.selector, w: look.w, h: look.h, asset: look.asset}).then((ratio) => ({
          row: ratio === null || ratio > GATE ? row(expected) : null,
          ratio: ratio === null ? null : {node: look.node, ratio},
        })),
      ]
    }),
  )
  return {
    rows: found.flatMap((entry) => (entry.row === null ? [] : [entry.row])),
    ratios: found.flatMap((entry) => (entry.ratio === null ? [] : [entry.ratio])),
  }
}

type Found = {row: GateRow | null; ratio: {node: string; ratio: number} | null}

const IMAGE = 'image'
const GATE = designConfig.tolerances.segmentImageShare

async function captured(input: {
  page: ServerToolPageAccess
  selector: string
  w: number
  h: number
  asset: string
}): Promise<number | null> {
  const width = Math.max(1, Math.round(input.w))
  const height = Math.max(1, Math.round(input.h))
  const reply = await input.page
    .call(screenshotNodeDef.name, {selector: input.selector, width, height, scale: 1, reference: input.asset})
    .catch(() => null)
  const shot = PageNodeShotSchema.safeParse(reply)
  if (!shot.success || shot.data.reference === null || shot.data.mask === null) return null
  const live = createRaster(Buffer.from(shot.data.image, 'base64'))
  const reference = createRaster(Buffer.from(shot.data.reference, 'base64'))
  const ink = createRaster(Buffer.from(shot.data.mask, 'base64')).pixels()
  const {mask} = live.compare({other: reference, comparator: 'pixelmatch'})
  const painted = mask.reduce<{seen: number; wrong: number}>(
    (sums, wrong, index) => {
      if (wrong === 0 && (ink[index * CHANNELS + ALPHA] ?? 0) === 0) return sums
      return {seen: sums.seen + 1, wrong: sums.wrong + wrong}
    },
    {seen: 0, wrong: 0},
  )
  return painted.seen === 0 ? 0 : painted.wrong / painted.seen
}

const CHANNELS = 4
const ALPHA = 3
