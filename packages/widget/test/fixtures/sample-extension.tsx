import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

export const sampleClientProbe = {opens: 0, closes: 0, live: 0, apiBase: ''}

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
})
  .client(() => {
    sampleClientProbe.opens += 1
    sampleClientProbe.live += 1
    sampleClientProbe.apiBase = sampleExtension.useClientApi().apiBase
    return {
      value: {sampleReady: () => true},
      dispose: () => {
        sampleClientProbe.closes += 1
        sampleClientProbe.live -= 1
      },
    }
  })
  .server(() => ({context: {}}))

function SampleSurface() {
  const slot = sampleExtension.useSlot()
  const insert = sampleExtension.useContext((context) => context.insert)
  const harnessId = sampleExtension.useContext((context) => context.harnessId)
  const ready = sampleExtension.useContext((context) => context.sampleReady)
  if (slot() === 'header') return <div>sample header for {harnessId}</div>
  if (slot() === 'status') return <span>sample status {ready() ? 'ready' : 'pending'}</span>
  if (slot() === 'composer')
    return (
      <button type="button" onClick={() => insert('drew a square')}>
        Sample Draw
      </button>
    )
  return null
}
