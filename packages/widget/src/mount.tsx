import {createRoot} from 'react-dom/client'
import {createShadowRoot} from './shadow.js'
import {ChatFeature} from './chat-shell.js'
import {VitestCard} from './vitest-card.js'
import {initPageBus} from './page-bus.js'
import {probeChatAvailable} from './chat-api.js'

// Entry point: create the open Shadow DOM, probe the dev server, and mount the React chat
// agent + page-bus when the devgent routes are live. Replaces the solid chat-feature.ts +
// bootstrap.ts. The widget auto-mounts on load (the global bundle is a plain <script>), and
// also exports mountWidget for programmatic embedding.

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

type TestSeam = {__DEVGENT_RENDER_VITEST_CARD__?: () => void}

// Test-only seam (browser IT): render a standalone VitestCard in LIVE mode (result=null →
// subscribes to /__pw/vitest/stream) into the widget's shadow root, so the IT exercises the
// card's real SSE → tree → expand-failure path without booting the full chat stack. The page
// explicitly calls it; production pages never invoke it, so the card never appears otherwise.
function mountVitestCardForTest(root: ShadowRoot, apiBase: string): void {
  const container = document.createElement('div')
  root.appendChild(container)
  createRoot(container).render(<VitestCard apiBase={apiBase} onFix={() => {}} result={null} />)
}

export function mountWidget(): void {
  if (document.querySelector('[data-devgent-root]')) return
  const {root} = createShadowRoot()
  const apiBase = metaContent('pw-api-base')
  const w = window as unknown as TestSeam
  w.__DEVGENT_RENDER_VITEST_CARD__ = () => mountVitestCardForTest(root, apiBase)
  // Chat + page-bus only exist on the devgent dev server. Probe first so a plain app (no
  // chat route) shows nothing instead of a dead FAB and a retrying EventSource.
  void probeChatAvailable(apiBase).then((available) => {
    if (!available) return
    const container = document.createElement('div')
    root.appendChild(container)
    createRoot(container).render(<ChatFeature apiBase={apiBase} />)
    initPageBus({apiBase})
  })
}

mountWidget()
