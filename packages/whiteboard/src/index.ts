import {z} from 'zod'
import {defineEffect, defineExtension, defineTool} from '@mandarax/extensions'

const ping = defineTool({
  name: 'whiteboard.ping',
  label: 'Whiteboard ping',
  description: 'Health check for the whiteboard extension.',
  parameters: z.object({}),
  execute: async () => 'pong',
})

const marker = defineEffect({
  name: 'whiteboard',
  label: 'Whiteboard',
  description: 'The whiteboard canvas overlay.',
  render: () => {
    const el = document.createElement('div')
    el.setAttribute('data-whiteboard-marker', '')
    el.textContent = 'whiteboard'
    return el
  },
})

export default defineExtension({id: 'whiteboard', tools: [ping], effects: [marker]})
  .server(() => {})
  .client(() => {})
