import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extension'

const draw = defineTool({
  name: 'sample_draw',
  description: 'Draw a shape on the canvas',
  inputSchema: z.object({shape: z.string()}),
}).server((input) => ({drawn: input.shape}))

export const sampleExtension = defineExtension({
  name: 'sample',
  Component: SampleSurface,
  systemPrompt: 'You can draw shapes.',
  tools: [draw],
}).server(() => ({systemPrompt: 'Draw runs in node.'}))

function SampleSurface() {
  const slot = sampleExtension.useSlot()
  const insert = sampleExtension.useContext((context) => context.insert)
  const harnessId = sampleExtension.useContext((context) => context.harnessId)
  if (slot() === 'header') return <div>sample header for {harnessId}</div>
  if (slot() === 'status') return <span>sample status line</span>
  if (slot() === 'composer')
    return (
      <button type="button" onClick={() => insert('drew a square')}>
        Sample Draw
      </button>
    )
  return null
}
