import {Renderer} from '@takumi-rs/core'
import {container, image, percentage} from '@takumi-rs/helpers'
import {Effect} from 'effect'
import {toolErrors} from './errors/tool-errors.js'
import {causeFrom} from './errors/cause.js'

export const makeRenderer = Effect.sync(() => new Renderer())

export const renderDraftPng = Effect.fn('whiteboard.canvas.renderDraftPng')(function* (
  renderer: Renderer,
  svg: string,
  width: number,
  height: number,
) {
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const node = container({
    style: {width: percentage(100), height: percentage(100), backgroundColor: '#ffffff'},
    children: [image({src: dataUri, width, height})],
  })
  const buffer = yield* Effect.tryPromise({
    try: () => renderer.render(node, {width, height, format: 'png'}),
    catch: (error) =>
      toolErrors.RENDER_FAILED({
        reason: error instanceof Error ? error.message : String(error),
        ...causeFrom(error),
      }),
  })
  return buffer.toString('base64')
})
