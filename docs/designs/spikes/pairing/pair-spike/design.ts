import {readFileSync, writeFileSync} from 'node:fs'
import {PNG} from '/private/tmp/claude-501/-Users-omrikatz-Public-web-mono/1371b864-cc6b-48a6-823b-ade1fe762a3e/scratchpad/seg-spike/node_modules/pngjs/lib/png.js'
import {initCv, makeImage, segment, VARIANTS, type SegNode} from '/private/tmp/claude-501/-Users-omrikatz-Public-web-mono/1371b864-cc6b-48a6-823b-ade1fe762a3e/scratchpad/seg-spike/segment.ts'
import {readTiled} from '/private/tmp/claude-501/-Users-omrikatz-Public-web-mono/1371b864-cc6b-48a6-823b-ade1fe762a3e/scratchpad/interp-spike/png/ocr-tiled.ts'
import {destroyPaddle} from '/Users/omrikatz/Public/web/aidx-text/packages/extensions/design/dist/server/comparators/paddle.js'
const PAGE = process.env.PAGE ?? 'dashboard'
const DIR = `raw/${PAGE}`
const flatten = (node: SegNode): {kind: string; box: {x: number; y: number; w: number; h: number}; depth: number; fill?: number[]}[] => node.children.flatMap((c) => [{kind: c.kind, box: c.box, depth: c.depth, fill: c.fill}, ...flatten(c)])
await initCv()
const png = PNG.sync.read(readFileSync(`${DIR}/stage-final.png`))
const raster = {width: png.width, height: png.height, data: new Uint8Array(png.data)}
const text = await readTiled(raster)
const frames = flatten(segment({image: makeImage({width: png.width, height: png.height, rgba: raster.data}), variant: VARIANTS['threshold-rgb-adaptive']}))
writeFileSync(`${DIR}/design.json`, JSON.stringify({width: png.width, height: png.height, text, frames}))
console.log('design: text runs', text.length, 'frames', frames.length)
await destroyPaddle()
