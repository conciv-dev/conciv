import {createMemo, createSignal, type Accessor} from 'solid-js'
import {createMutationObserver} from '@solid-primitives/mutation-observer'
import {createMediaQuery} from './media-query.js'

export type ColorScheme = 'light' | 'dark'

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

const SCHEME_ATTRIBUTES = ['class', 'style', 'data-theme']

function asScheme(value: string | null | undefined): ColorScheme | null {
  if (value === 'light' || value === 'dark') return value
  return null
}

function declaredScheme(element: Element): ColorScheme | null {
  return asScheme(element.ownerDocument.defaultView?.getComputedStyle(element).colorScheme.trim())
}

function signalledScheme(element: Element): ColorScheme | null {
  if (element.classList.contains('dark')) return 'dark'
  if (element.classList.contains('light')) return 'light'
  return asScheme(element.getAttribute('data-theme'))
}

function schemeRoots(doc: Document): Element[] {
  return [doc.documentElement, doc.body].filter((element): element is HTMLElement => element !== null)
}

function readHostScheme(doc: Document): ColorScheme | null {
  const roots = schemeRoots(doc)
  const declared = roots.map(declaredScheme).find((scheme) => scheme !== null)
  if (declared) return declared
  return roots.map(signalledScheme).find((scheme) => scheme !== null) ?? null
}

export function applySchemeClass(element: Element, scheme: ColorScheme): void {
  element.classList.toggle('dark', scheme === 'dark')
  element.classList.toggle('light', scheme === 'light')
}

export function createHostColorScheme(doc: Document = document): Accessor<ColorScheme> {
  const prefersDark = createMediaQuery(DARK_MEDIA_QUERY)
  const [hostScheme, setHostScheme] = createSignal(readHostScheme(doc))
  createMutationObserver(
    () => schemeRoots(doc),
    {attributes: true, attributeFilter: SCHEME_ATTRIBUTES},
    () => setHostScheme(readHostScheme(doc)),
  )
  const scheme = createMemo(() => hostScheme() ?? (prefersDark() ? 'dark' : 'light'))
  return scheme
}
