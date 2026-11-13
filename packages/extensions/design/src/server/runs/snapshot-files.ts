import type {CssomSite, DomSite, IdNode} from '../../shared/defs.js'
import type {Store} from '../../shared/store.js'
import {createRaster} from '../raster.js'

export function snapshotFiles(shot: Shot): {width: number; kind: Kind; bytes: Uint8Array}[] {
  const {width, tree} = shot
  const images = [
    {kind: 'screenshot' as const, bytes: shot.screenshot},
    ...(shot.diff === undefined ? [] : [{kind: 'diff' as const, bytes: shot.diff}]),
    ...(shot.mask === undefined ? [] : [{kind: 'mask' as const, bytes: maskPng(shot.mask)}]),
  ]
  const trees =
    tree === undefined
      ? []
      : [
          {kind: 'dom' as const, body: {revoted: tree.revoted, gone: tree.gone, root: domOf(tree.root)}},
          {kind: 'cssom' as const, body: {queries: shot.queries ?? [], root: cssomOf(tree.root)}},
          {kind: 'fom' as const, body: {root: fomOf(tree.root)}},
        ]
  return [
    ...images.filter((image) => image.bytes.length > 0).map((image) => ({...image, width})),
    ...trees.map(({kind, body}) => ({kind, width, bytes: new TextEncoder().encode(JSON.stringify(body))})),
  ]
}

type Shot = NonNullable<Parameters<Store['writeRound']>[0]['shots']>[number]

type Kind = 'screenshot' | 'diff' | 'mask' | 'dom' | 'cssom' | 'fom'

type FomSite = {id: string; fom: IdNode['fom']; children: FomSite[]}

const OPAQUE = 255

function domOf(node: IdNode): DomSite {
  return {id: node.id, dom: node.dom, src: node.src, children: node.children.map(domOf)}
}

function cssomOf(node: IdNode): CssomSite {
  return {id: node.id, cssom: node.cssom, children: node.children.map(cssomOf)}
}

function fomOf(node: IdNode): FomSite {
  return {id: node.id, fom: node.fom, children: node.children.map(fomOf)}
}

function maskPng(mask: {pixels: Uint8Array; width: number}): Uint8Array {
  const {pixels, width} = mask
  const height = width === 0 ? 0 : pixels.length / width
  const rgba = new Uint8Array(pixels.length * 4).map((_, index) =>
    index % 4 === 3 ? OPAQUE : (pixels[(index - (index % 4)) / 4] ?? 0) * OPAQUE,
  )
  return createRaster({pixels: rgba, width, height}).png()
}
