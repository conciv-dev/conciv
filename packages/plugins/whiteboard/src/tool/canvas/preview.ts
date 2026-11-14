import {Renderer} from '@takumi-rs/core'
import {container, image, percentage} from '@takumi-rs/helpers'

let renderer: Renderer | undefined

function getRenderer(): Renderer {
  if (!renderer) renderer = new Renderer()
  return renderer
}

export async function renderDraftPng(svg: string, width: number, height: number): Promise<string> {
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const node = container({
    style: {width: percentage(100), height: percentage(100), backgroundColor: '#ffffff'},
    children: [image({src: dataUri, width, height})],
  })
  const buffer = await getRenderer().render(node, {width, height, format: 'png'})
  return buffer.toString('base64')
}
