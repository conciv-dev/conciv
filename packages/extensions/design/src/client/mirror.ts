import {
  absolutifyURLs,
  createCache,
  createMirror,
  rebuildIntoSandboxedIframe,
  snapshot,
  visitSnapshot,
} from 'rrweb-snapshot'
import {OVERLAYS} from '../shared/overlays.js'

export async function buildMirror(input: {
  size: {width: number; height: number}
  marker: string
}): Promise<HTMLIFrameElement> {
  const {size} = input
  const source = createMirror()
  const tree = snapshot(document, {
    mirror: source,
    blockSelector: MIRROR_BLOCKED,
    maskAllInputs: true,
    inlineStylesheet: true,
  })
  if (tree === null) throw new Error('the page could not be snapshotted for the mirror')
  visitSnapshot(tree, (node) => {
    if (!('tagName' in node) || node.tagName !== STYLE || typeof node.attributes[CSS_TEXT] !== 'string') return
    const text = source.getNode(node.id)?.textContent ?? ''
    if (text.trim() !== '') node.attributes[CSS_TEXT] = absolutifyURLs(text, document.baseURI)
  })
  const host = offscreenHost(input.marker)
  const rebuilt = createMirror()
  const {iframe} = rebuildIntoSandboxedIframe(tree, {
    root: host,
    mirror: rebuilt,
    cache: createCache(),
    hackCss: false,
    iframeAttributes: {
      width: String(size.width),
      height: String(size.height),
      style: 'border:0',
      tabindex: '-1',
      'aria-hidden': 'true',
    },
  })
  const widget = document.querySelector(WIDGET_ROOT_SELECTOR)
  const placeholder = widget === null ? null : rebuilt.getNode(source.getId(widget))
  placeholder?.parentNode?.removeChild(placeholder)
  return iframe
}

const [WIDGET_ROOT_SELECTOR] = OVERLAYS

const MIRROR_BLOCKED = `${OVERLAYS.join(', ')}, iframe, video, audio, object, embed`

const OFFSCREEN_STYLE = 'position:fixed;left:-100000px;top:0;pointer-events:none'

const STYLE = 'style'

const CSS_TEXT = '_cssText'

function offscreenHost(marker: string): HTMLDivElement {
  const host = document.createElement('div')
  host.setAttribute(marker, '')
  host.setAttribute('aria-hidden', 'true')
  host.setAttribute('style', OFFSCREEN_STYLE)
  document.body.append(host)
  return host
}
