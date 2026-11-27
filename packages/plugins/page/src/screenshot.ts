import {CONCIV_UI_SELECTOR} from './conciv-ui.js'
import type {SnapdomPlugin} from '@zumer/snapdom'

const WEBP_QUALITY = 0.8

const UNPAINTED: readonly string[] = ['transparent', 'rgba(0, 0, 0, 0)']

export function paintedBackground(element: Element | null): string | undefined {
  if (element === null) return undefined
  const color = getComputedStyle(element).backgroundColor
  return UNPAINTED.includes(color) ? paintedBackground(element.parentElement) : color
}

export type PageScreenshot = {width: number; height: number; warnings?: string[]; data: Uint8Array<ArrayBuffer>}

function readable(selector: string): boolean {
  try {
    document.querySelector(selector)
    return true
  } catch {
    return false
  }
}

export async function screenshot(
  input: {exclude?: string[]},
  {snapdom}: typeof import('@zumer/snapdom'),
): Promise<PageScreenshot> {
  const requested = input.exclude ?? []
  const warnings = requested
    .filter((selector) => !readable(selector))
    .map((selector) => `ignored invalid selector: ${selector}`)
  const capture = await snapdom(document.documentElement, {
    clip: 'viewport',
    dpr: 1,
    exclude: [CONCIV_UI_SELECTOR, ...requested.filter(readable)],
    excludeMode: 'remove',
    embedFonts: true,
    plugins: capturePlugins,
    backgroundColor: paintedBackground(document.documentElement) ?? paintedBackground(document.body),
  })
  const blob = await capture.toBlob({format: 'webp', quality: WEBP_QUALITY})
  const bitmap = await createImageBitmap(blob)
  const {width, height} = bitmap
  bitmap.close()
  return {width, height, ...(warnings.length > 0 ? {warnings} : {}), data: new Uint8Array(await blob.arrayBuffer())}
}

const keepBodyMargins: SnapdomPlugin = {
  name: 'keep-body-margins',
  afterClone: (context) => {
    const root = context.clone
    const body = root?.querySelector(':scope > body')
    if (!(root instanceof HTMLElement) || !(body instanceof HTMLElement)) return
    body.style.removeProperty('margin-top')
    body.style.removeProperty('margin-bottom')
    root.style.display = 'flow-root'
  },
}

const keepOneLineText: SnapdomPlugin = {
  name: 'keep-one-line-text',
  afterClone: (context) => {
    const root = context.clone
    const sources = context.nodeMap
    if (!root || !(sources instanceof Map)) return
    const pinnedToOneLine = (box: Element): boolean => {
      const source = sources.get(box)
      return (
        box instanceof HTMLElement &&
        box.style.getPropertyValue('text-wrap-mode') === 'nowrap' &&
        source instanceof Element &&
        getComputedStyle(source).getPropertyValue('text-wrap-mode') !== 'nowrap'
      )
    }
    const carryOneLine = (box: Element, pinned: boolean): void => {
      for (const child of box.children) {
        if (pinned && child instanceof HTMLElement) child.style.setProperty('text-wrap-mode', 'nowrap')
        carryOneLine(child, pinned || pinnedToOneLine(child))
      }
    }
    carryOneLine(root, pinnedToOneLine(root))
  },
}

export const capturePlugins: SnapdomPlugin[] = [keepBodyMargins, keepOneLineText]
