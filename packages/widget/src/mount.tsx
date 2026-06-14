import {render} from 'solid-js/web'
import {createShadowRoot} from './shadow.js'
import {ChatFeature} from './chat-shell.js'
import {TestCard} from './test-card.js'
import {initPageBus} from './page-bus.js'
import {probeChatAvailable} from './chat-api.js'

// Entry: create the open Shadow DOM, probe the dev server, and mount the Solid chat agent +
// page-bus when the aidx routes are live. Auto-mounts on load; also exports mountWidget.

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

declare global {
  interface Window {
    __AIDX_RENDER_TEST_CARD__?: () => void
  }
}

// Test-only seam (browser IT): render a standalone live TestCard into the widget's shadow root.
function mountTestCardForTest(root: ShadowRoot, apiBase: string): void {
  const container = document.createElement('div')
  root.appendChild(container)
  render(() => <TestCard apiBase={apiBase} onFix={() => {}} result={null} />, container)
}

export function mountWidget(): void {
  if (document.querySelector('[data-aidx-root]')) return
  const {root} = createShadowRoot()
  const apiBase = metaContent('pw-api-base')
  window.__AIDX_RENDER_TEST_CARD__ = () => mountTestCardForTest(root, apiBase)
  // Chat + page-bus only exist on the aidx dev server; probe first so a plain app shows nothing.
  void probeChatAvailable(apiBase).then((available) => {
    if (!available) return
    const container = document.createElement('div')
    root.appendChild(container)
    render(() => <ChatFeature apiBase={apiBase} />, container)
    initPageBus({apiBase})
  })
}

mountWidget()
