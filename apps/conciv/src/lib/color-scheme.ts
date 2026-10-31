import {createEffect, createMemo, type Accessor} from 'solid-js'
import {createStore} from 'solid-js/store'
import {createMutationObserver} from '@solid-primitives/mutation-observer'
import {DEFAULT_SKIN_NAME, SKIN_NAMES, isSkinName, skinClassName, type SkinName} from '@conciv/ui-kit-system'
import {createMediaQuery} from './media-query.js'

export type ColorScheme = 'light' | 'dark'

export type HostTheme = {scheme: ColorScheme; skin: SkinName}

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

const THEME_ATTRIBUTES = ['class', 'style', 'data-theme']

const SKIN_PROPERTY = '--conciv-skin'

type HostSignals = {scheme: ColorScheme | null; declaredSkin: string}

function asScheme(value: string | null | undefined): ColorScheme | null {
  if (value === 'light' || value === 'dark') return value
  return null
}

function computed(element: Element): CSSStyleDeclaration | null {
  return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null
}

function declaredScheme(element: Element): ColorScheme | null {
  return asScheme(computed(element)?.colorScheme.trim())
}

function signalledScheme(element: Element): ColorScheme | null {
  if (element.classList.contains('dark')) return 'dark'
  if (element.classList.contains('light')) return 'light'
  return asScheme(element.getAttribute('data-theme'))
}

function parentAcrossShadow(element: Element): Element | null {
  if (element.parentElement) return element.parentElement
  const root = element.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

function ancestorsOf(element: Element): Element[] {
  const parent = parentAcrossShadow(element)
  return parent ? [parent, ...ancestorsOf(parent)] : []
}

function themeRoots(mountHost: Element | undefined): Element[] {
  if (mountHost) return ancestorsOf(mountHost)
  return [document.body, document.documentElement].filter((element): element is HTMLElement => element !== null)
}

function readHostScheme(roots: Element[]): ColorScheme | null {
  const declared = roots.map(declaredScheme).find((scheme) => scheme !== null)
  if (declared) return declared
  return roots.map(signalledScheme).find((scheme) => scheme !== null) ?? null
}

function readDeclaredSkin(roots: Element[]): string {
  const declared = roots
    .map((element) => computed(element)?.getPropertyValue(SKIN_PROPERTY).trim() ?? '')
    .find((value) => value.length > 0)
  return declared ?? ''
}

function readHostSignals(roots: Element[]): HostSignals {
  return {scheme: readHostScheme(roots), declaredSkin: readDeclaredSkin(roots)}
}

export function applySchemeClass(element: Element, scheme: ColorScheme): void {
  element.classList.toggle('dark', scheme === 'dark')
  element.classList.toggle('light', scheme === 'light')
}

export function applySkinClass(element: Element, skin: SkinName): void {
  for (const name of SKIN_NAMES) {
    element.classList.toggle(skinClassName(name), name !== DEFAULT_SKIN_NAME && name === skin)
  }
}

export function themeClasses(theme: HostTheme): string {
  if (theme.skin === DEFAULT_SKIN_NAME) return theme.scheme
  return `${theme.scheme} ${skinClassName(theme.skin)}`
}

export function createHostTheme(mountHost?: Element): Accessor<HostTheme> {
  const roots = themeRoots(mountHost)
  const prefersDark = createMediaQuery(DARK_MEDIA_QUERY)
  const [host, setHost] = createStore<HostSignals>(readHostSignals(roots))
  createMutationObserver(
    () => roots,
    {attributes: true, attributeFilter: THEME_ATTRIBUTES},
    () => setHost(readHostSignals(roots)),
  )
  createEffect(() => {
    const declared = host.declaredSkin
    if (declared.length === 0 || isSkinName(declared)) return
    console.warn(
      `[conciv] unknown ${SKIN_PROPERTY} value "${declared}"; falling back to the "${DEFAULT_SKIN_NAME}" skin.`,
    )
  })
  const theme = createMemo<HostTheme>(() => ({
    scheme: host.scheme ?? (prefersDark() ? 'dark' : 'light'),
    skin: isSkinName(host.declaredSkin) ? host.declaredSkin : DEFAULT_SKIN_NAME,
  }))
  return theme
}
