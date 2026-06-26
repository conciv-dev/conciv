import {Show, createRoot, createSignal, onCleanup, type JSX} from 'solid-js'
import {Presentation} from 'lucide-solid'
import {defineExtension} from '@mandarax/extension'
import {Button} from '@mandarax/ui-kit-system'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {fetchJazzConfig} from './client/jazz-client.js'
import {mountOverlay} from './client/overlay.js'

const previewIdOf = (doc: Document): string =>
  doc.querySelector('meta[name="pw-preview-id"]')?.getAttribute('content') ?? 'local'

function Component(): JSX.Element {
  const slot = whiteboard.useSlot()
  const toggle = whiteboard.useContext((context) => context.toggle)
  return (
    <Show when={slot() === 'composer'}>
      <Button variant="ghost" size="icon" aria-label="Open the whiteboard canvas" onClick={() => toggle()}>
        <Presentation />
      </Button>
    </Show>
  )
}

const whiteboard = defineExtension({
  name: WHITEBOARD_NAME,
  tools: [],
  systemPrompt: WHITEBOARD_PROMPT,
  Component,
}).client(() =>
  createRoot((dispose) => {
    const api = whiteboard.useClientApi()
    const [open, setOpen] = createSignal(false)
    let disposeOverlay: (() => void) | undefined
    const start = async (): Promise<void> => {
      if (disposeOverlay) return
      const config = await fetchJazzConfig(`${api.apiBase}/api/ext/whiteboard`)
      disposeOverlay = mountOverlay({
        api,
        config,
        open,
        previewId: previewIdOf(api.env.doc),
        sessionId: () => api.client.sessionId() ?? '',
      })
    }
    const toggle = (): void => {
      void start()
      setOpen((value) => !value)
    }
    onCleanup(() => disposeOverlay?.())
    return {value: {toggle, open}, dispose}
  }),
)

export default whiteboard
