import type {z} from 'zod'
import type {PageNodeShot, screenshotNodeDef} from '../shared/defs.js'

export async function screenshotNode(
  input: z.output<(typeof screenshotNodeDef)['inputSchema']>,
): Promise<PageNodeShot> {
  const element = document.querySelector(input.selector)
  if (element === null) throw new Error(`no element matches ${input.selector}`)
  const width = Math.max(1, Math.round(input.width * input.scale))
  const height = Math.max(1, Math.round(input.height * input.scale))
  const {snapdom} = await import('@zumer/snapdom')
  const captured = await snapdom(element, {dpr: input.scale, embedFonts: true})
  const canvas = await captured.toCanvas()
  const reference =
    input.reference === undefined ? null : await pngOf({source: await loaded(input.reference), width, height})
  return {image: await pngOf({source: canvas, width, height}), reference, mask: reference, width, height}
}

const DATA_URL_COMMA = ','

function loaded(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => reject(new Error(`the image ${url} did not load`)))
    image.src = url
  })
}

async function pngOf(input: {source: CanvasImageSource; width: number; height: number}): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = input.width
  canvas.height = input.height
  canvas.getContext('2d')?.drawImage(input.source, 0, 0, input.width, input.height)
  const url = canvas.toDataURL('image/png')
  return url.slice(url.indexOf(DATA_URL_COMMA) + 1)
}
