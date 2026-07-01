import {OpenSourceResultSchema, type OpenSourceResult} from '@conciv/protocol/page-types'
import type {LocateResult} from '@conciv/protocol/page-introspect-types'

export const EFFECTS_SURFACE_ATTR = 'data-conciv-effects'

// The host is NOT aria-hidden: extensions mount interactive UI here (whiteboard comments), which must
// reach the accessibility tree. Purely decorative effects (e.g. the highlight overlay) mark their own
// subtree aria-hidden instead — an ancestor aria-hidden can't be undone by a descendant.
function createEffectsHost(): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute(EFFECTS_SURFACE_ATTR, '')
  host.style.position = 'fixed'
  host.style.zIndex = '2147483000'
  document.body.appendChild(host)
  return host
}

export function ensureEffectsSurface(options?: {styles?: string}): HTMLElement {
  const host = document.querySelector<HTMLElement>(`[${EFFECTS_SURFACE_ATTR}]`) ?? createEffectsHost()
  const root = host.shadowRoot ?? host.attachShadow({mode: 'open'})
  const existing = root.querySelector<HTMLElement>('[data-effect-root]')
  if (existing) return existing
  if (options?.styles) {
    const style = document.createElement('style')
    style.textContent = options.styles
    root.appendChild(style)
  }
  const container = document.createElement('div')
  container.setAttribute('data-effect-root', '')
  root.appendChild(container)
  return container
}

export async function openSource(apiBase: string, locateResult: LocateResult): Promise<OpenSourceResult> {
  const post = (path: string, body: unknown) =>
    fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    })
  try {
    if (locateResult.source) {
      await post('/api/editor/open', {file: locateResult.source.file, line: locateResult.source.line})
      return 'opened'
    }
    if (locateResult.frames.length)
      return OpenSourceResultSchema.parse(
        await (await post('/api/page/open-source', {frames: locateResult.frames})).json(),
      ).status
    return 'no-source'
  } catch {
    return 'failed'
  }
}
