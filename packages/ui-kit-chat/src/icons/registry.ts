import {createRoot} from 'solid-js'
import {makeMediaQueryListener} from '@solid-primitives/media'
import {isDocument, prefersReducedMotion} from '@conciv/ui-kit-system'
import {chatKitErrors} from '../errors/errors.js'

export type RegisteredIconName = `${string}:${string}`

export type IconRoot = Document | ShadowRoot

type Artwork = {
  readonly viewBox: string
  readonly attributes: readonly Attr[]
  readonly content: DocumentFragment
}

const namespace = 'http://www.w3.org/2000/svg'

const spriteID = 'conciv-icon-registered'

const structural = ['xmlns', 'width', 'height', 'viewBox', 'id']

export function isRegisteredIconName(name: string): name is RegisteredIconName {
  return name.includes(':')
}

export type IconRegistry = {
  readonly registerIcons: (sources: Readonly<Record<RegisteredIconName, string>>) => () => void
  readonly mountRegisteredIcon: (name: RegisteredIconName, root: IconRoot) => () => void
  readonly registeredIconSymbol: (name: string) => string
}

export function createIconRegistry(): IconRegistry {
  const state = {
    artwork: new Map<string, Artwork>(),
    mounted: new Map<IconRoot, Map<string, number>>(),
    drawn: new Map<IconRoot, Map<string, Artwork>>(),
    symbols: new Map<string, string>(),
    sprites: new Map<IconRoot, () => void>(),
  }

  function registerIcons(sources: Readonly<Record<RegisteredIconName, string>>): () => void {
    const parsed = Object.entries(sources).map(([name, source]) => ({name, artwork: parse(name, source)}))

    parsed.forEach((entry) => {
      state.artwork.set(entry.name, entry.artwork)
      draw(entry.name)
    })

    return () =>
      parsed.forEach((entry) => {
        if (state.artwork.get(entry.name) !== entry.artwork) return

        state.artwork.delete(entry.name)
        draw(entry.name)
      })
  }

  function mountRegisteredIcon(name: RegisteredIconName, root: IconRoot): () => void {
    const names = state.mounted.get(root) ?? new Map<string, number>()
    const count = names.get(name) ?? 0

    names.set(name, count + 1)
    state.mounted.set(root, names)

    if (count === 0) draw(name)

    return () => {
      const left = (names.get(name) ?? 1) - 1

      if (left > 0) return void names.set(name, left)

      names.delete(name)
      if (names.size === 0 && state.mounted.get(root) === names) state.mounted.delete(root)
      queueMicrotask(() => {
        draw(name)
        if (!state.mounted.has(root)) release(root)
      })
    }
  }

  function release(root: IconRoot) {
    state.drawn.delete(root)
    state.sprites.get(root)?.()
    state.sprites.delete(root)
    root.getElementById(spriteID)?.remove()
  }

  function registeredIconSymbol(name: string): string {
    const existing = state.symbols.get(name)

    if (existing) return existing

    const id = `${spriteID}-${state.symbols.size + 1}`

    state.symbols.set(name, id)

    return id
  }

  function draw(name: string) {
    new Set([...state.mounted.keys(), ...state.drawn.keys()]).forEach((root) => drawIn(root, name))
  }

  function drawIn(root: IconRoot, name: string) {
    const id = registeredIconSymbol(name)
    const drawn = state.drawn.get(root) ?? new Map<string, Artwork>()
    const artwork = state.mounted.get(root)?.has(name) ? state.artwork.get(name) : undefined
    const current = root.getElementById(id)

    if (!artwork) {
      drawn.delete(name)
      if (drawn.size === 0) state.drawn.delete(root)

      return void current?.remove()
    }

    if (current && drawn.get(name) === artwork) return

    drawn.set(name, artwork)
    state.drawn.set(root, drawn)

    const symbol = document.createElementNS(namespace, 'symbol')

    symbol.id = id
    symbol.setAttribute('viewBox', artwork.viewBox)
    artwork.attributes.forEach((attribute) =>
      symbol.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value),
    )
    symbol.append(artwork.content.cloneNode(true))

    if (current) return void current.replaceWith(symbol)

    sprite(root).append(symbol)
  }

  function sprite(root: IconRoot) {
    const existing = root.getElementById(spriteID)

    if (existing) return existing

    const svg = document.createElementNS(namespace, 'svg')

    svg.id = spriteID
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.style.position = 'absolute'
    svg.style.overflow = 'hidden'
    const parent = isDocument(root) ? root.body : root
    parent.insertBefore(svg, parent.firstChild)

    const settle = (reduced: boolean) => {
      if (!reduced) return svg.unpauseAnimations()

      svg.pauseAnimations()
      svg.setCurrentTime(0)
    }

    state.sprites.set(
      root,
      createRoot((dispose) => {
        makeMediaQueryListener('(prefers-reduced-motion: reduce)', (event) => settle(event.matches))

        return dispose
      }),
    )
    settle(prefersReducedMotion())

    return svg
  }

  return {registerIcons, mountRegisteredIcon, registeredIconSymbol}
}

function parse(name: string, source: string): Artwork {
  const root = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement

  if (root.localName !== 'svg' || root.getElementsByTagName('parsererror').length > 0)
    throw chatKitErrors.ICON_NOT_SVG({name})

  const content = document.createDocumentFragment()

  content.append(...Array.from(root.childNodes, (node) => document.importNode(node, true)))

  return {
    viewBox: root.getAttribute('viewBox') ?? frame(name, root),
    attributes: Array.from(root.attributes).filter(
      (attribute) => !structural.includes(attribute.name) && attribute.prefix !== 'xmlns',
    ),
    content,
  }
}

function frame(name: string, root: Element) {
  const width = Number.parseFloat(root.getAttribute('width') ?? '')
  const height = Number.parseFloat(root.getAttribute('height') ?? '')

  if (width > 0 && height > 0) return `0 0 ${width} ${height}`

  throw chatKitErrors.ICON_NO_FRAME({name})
}
