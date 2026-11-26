import {z} from 'zod'
import type {Plugin} from '@conciv/frontend-plugin-api'
import {WidgetDrive, WidgetRequestSchema, type WidgetOutcome, type WidgetRequest} from '@conciv/protocol/simulation'
import {useAppData, useEnvironment} from '../app/context.js'
import {createWidgetDom, type WidgetDom} from './widget-dom.js'

const CALL: `rpc.${typeof WidgetDrive.id}.call` = `rpc.${WidgetDrive.id}.call`

const CallSchema = z.object({requestId: z.string(), request: WidgetRequestSchema})

const ARROW_KEYS = {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'} as const

function painted(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function acted(dom: WidgetDom, action: () => void): Promise<unknown> {
  action()
  await painted()
  return dom.state()
}

function perform(dom: WidgetDom, request: WidgetRequest): Promise<unknown> {
  if (request.type === 'ui.state') return Promise.resolve(dom.state())
  if (request.type === 'ui.snapshot') return Promise.resolve(dom.snapshot())
  if (request.type === 'ui.matches') return Promise.resolve(dom.matches(request.text))
  if (request.type === 'ui.type') return acted(dom, () => dom.type(request.text))
  if (request.type === 'ui.press') return acted(dom, () => dom.press(request.key, request.modifiers))
  if (request.type === 'ui.enter') return acted(dom, () => dom.press('enter'))
  if (request.type === 'ui.arrow') return acted(dom, () => dom.press(ARROW_KEYS[request.direction]))
  if (request.type === 'ui.focus') return acted(dom, () => dom.focus(request.target))
  return acted(dom, () => dom.click(request))
}

async function answer(dom: WidgetDom, request: WidgetRequest): Promise<WidgetOutcome> {
  try {
    return {type: 'success', value: z.json().parse(await perform(dom, request))}
  } catch (error) {
    return {type: 'failure', message: error instanceof Error ? error.message : String(error)}
  }
}

const drive: Plugin.Setup = (ctx) => {
  const dom = createWidgetDom(useEnvironment().rootNode)
  const client = useAppData().client
  const result = client.rpc(WidgetDrive).result
  const serve = async (): Promise<void> => {
    for await (const event of client.event.subscribe({types: [CALL], signal: ctx.signal})) {
      const call = CallSchema.safeParse(event.data)
      if (!call.success) continue
      const outcome = await answer(dom, call.data.request)
      await result({requestId: call.data.requestId, outcome}).catch((error: unknown) =>
        console.warn('[conciv] drive could not answer the engine', error),
      )
    }
  }
  serve().catch((error: unknown) => {
    if (!ctx.signal.aborted) console.error('[conciv] drive stopped answering the engine', error)
  })
}

export default drive
