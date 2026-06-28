import {OpenSourceResultSchema, type OpenSourceResult} from '@mandarax/protocol/page-types'
import type {LocateResult} from '@mandarax/protocol/page-introspect-types'

export const EFFECTS_SURFACE_ATTR = 'data-mandarax-effects'

function createEffectsHost(): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute(EFFECTS_SURFACE_ATTR, '')
  host.setAttribute('aria-hidden', 'true')
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
