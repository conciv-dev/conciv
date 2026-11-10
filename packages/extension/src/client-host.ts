import {makeBrowserRpcClient} from '@conciv/contract'
import type {OpenSourceResult} from '@conciv/protocol/page-types'
import type {LocateResult} from '@conciv/protocol/page-introspect-types'

export const EFFECTS_SURFACE_ATTR = 'data-conciv-effects'

export const CONCIV_UI_SELECTOR = `[data-conciv-root], [${EFFECTS_SURFACE_ATTR}], [data-conciv-fonts], [data-conciv-properties], [data-conciv-toast]`

function createEffectsHost(): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute(EFFECTS_SURFACE_ATTR, '')
  host.style.position = 'fixed'
  host.style.zIndex = '2147483000'
  document.body.appendChild(host)
  return host
}

function ensureEffectsContainer(root: ShadowRoot, styles?: string): HTMLElement {
  const existing = root.querySelector<HTMLElement>('[data-effect-root]')
  if (existing) return existing
  if (styles) {
    const style = document.createElement('style')
    style.textContent = styles
    root.appendChild(style)
  }
  const container = document.createElement('div')
  container.setAttribute('data-effect-root', '')
  root.appendChild(container)
  return container
}

export function ensureEffectsSurface(options?: {styles?: string}): HTMLElement {
  const host = document.querySelector<HTMLElement>(`[${EFFECTS_SURFACE_ATTR}]`) ?? createEffectsHost()
  const root = host.shadowRoot ?? host.attachShadow({mode: 'open'})
  const container = ensureEffectsContainer(root, options?.styles)
  const layer = document.createElement('div')
  layer.setAttribute('data-effect-layer', '')
  container.appendChild(layer)
  return layer
}

export async function openSource(
  apiBase: string,
  locateResult: LocateResult,
  session: () => string | null,
): Promise<OpenSourceResult> {
  const client = makeBrowserRpcClient(apiBase, {session})
  try {
    if (locateResult.source) {
      await client.rpc.editor.open({file: locateResult.source.file, line: locateResult.source.line})
      return 'opened'
    }
    if (locateResult.frames.length)
      return (await client.rpc.editor.openFromFrames({frames: locateResult.frames})).status
    return 'no-source'
  } catch {
    return 'failed'
  } finally {
    client.close()
  }
}
