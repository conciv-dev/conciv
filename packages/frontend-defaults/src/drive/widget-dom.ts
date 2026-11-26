import {computeAccessibleName, getRole} from 'dom-accessibility-api'
import type {
  ClickParams,
  KeyModifiers,
  SemanticNode,
  SemanticSnapshot,
  UiElement,
  UiState,
} from '@conciv/protocol/simulation'

export type DriveRoot = ParentNode & DocumentOrShadowRoot

export type WidgetDom = {
  readonly state: () => UiState
  readonly snapshot: () => SemanticSnapshot
  readonly matches: (text: string) => boolean
  readonly type: (text: string) => void
  readonly press: (key: string, modifiers?: KeyModifiers) => void
  readonly focus: (target: number) => void
  readonly click: (params: ClickParams) => void
}

const NAMED_KEYS: Readonly<Record<string, string>> = {
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  space: ' ',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
}

const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex],[contenteditable="true"],[contenteditable=""]'

const CLICKABLE_ROLES: readonly string[] = [
  'button',
  'link',
  'checkbox',
  'radio',
  'option',
  'menuitem',
  'tab',
  'switch',
]

function readRole(element: Element): string | undefined {
  return getRole(element) ?? undefined
}

function readLabel(element: Element): string | undefined {
  return computeAccessibleName(element) || undefined
}

function shadowRoots(scope: ParentNode): ShadowRoot[] {
  return Array.from(scope.querySelectorAll('*')).flatMap((element) =>
    element.shadowRoot === null ? [] : [element.shadowRoot, ...shadowRoots(element.shadowRoot)],
  )
}

function scopes(root: DriveRoot): ParentNode[] {
  return [root, ...shadowRoots(root)]
}

function deepActive(scope: DocumentOrShadowRoot): Element | null {
  const active = scope.activeElement
  if (active === null || active.shadowRoot === null) return active
  return deepActive(active.shadowRoot) ?? active
}

function parentAcrossShadow(element: Element): Element | null {
  if (element.parentElement !== null) return element.parentElement
  return element.parentNode instanceof ShadowRoot ? element.parentNode.host : null
}

function outside(rect: DOMRect, x: number, y: number): boolean {
  return x < 0 || x >= rect.width || y < 0 || y >= rect.height
}

function pointAt(found: Element, x: number, y: number): MouseEventInit {
  const rect = found.getBoundingClientRect()
  if (outside(rect, x, y)) throw new Error('the click position must be within the target element')
  return {bubbles: true, composed: true, cancelable: true, clientX: rect.x + x, clientY: rect.y + y, button: 0}
}

function clickAt(found: Element, at: MouseEventInit): void {
  found.dispatchEvent(new PointerEvent('pointerdown', {...at, pointerType: 'mouse', isPrimary: true}))
  found.dispatchEvent(new MouseEvent('mousedown', at))
  if (found instanceof HTMLElement && found.matches(FOCUSABLE)) found.focus()
  found.dispatchEvent(new PointerEvent('pointerup', {...at, pointerType: 'mouse', isPrimary: true}))
  found.dispatchEvent(new MouseEvent('mouseup', at))
  found.dispatchEvent(new MouseEvent('click', at))
}

function visible(element: Element): boolean {
  return element.checkVisibility({visibilityProperty: true})
}

function flag(element: Element, attribute: string): boolean | undefined {
  const value = element.getAttribute(attribute)
  if (value === null) return undefined
  return value === 'true'
}

function editor(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) return true
  const role = readRole(element)
  if (role === 'textbox' || role === 'searchbox') return true
  return element instanceof HTMLElement && element.isContentEditable
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
}

function insertText(element: Element, text: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? element.value.length
    setNativeValue(element, `${element.value.slice(0, start)}${text}${element.value.slice(end)}`)
    element.setSelectionRange(start + text.length, start + text.length)
    element.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, inputType: 'insertText', data: text}))
    return
  }
  element.ownerDocument.execCommand('insertText', false, text)
}

function keyName(key: string): string {
  return NAMED_KEYS[key.toLowerCase()] ?? key
}

export function createWidgetDom(root: DriveRoot): WidgetDom {
  const numbers = new WeakMap<Element, number>()
  const counter = {next: 1}

  const numberElement = (element: Element): number => {
    const known = numbers.get(element)
    if (known !== undefined) return known
    const assigned = counter.next
    counter.next += 1
    numbers.set(element, assigned)
    return assigned
  }

  const shown = (): Element[] =>
    scopes(root)
      .flatMap((scope) => Array.from(scope.querySelectorAll('*')))
      .filter(visible)

  const find = (target: number): Element => {
    const element = shown().find((candidate) => numbers.get(candidate) === target)
    if (element === undefined) throw new Error(`the target element is stale or unavailable: ${target}`)
    return element
  }

  const focused = (): Element => {
    const active = deepActive(root)
    if (active === null) throw new Error('nothing in the widget has focus')
    return active
  }

  const element = (candidate: Element): UiElement => {
    const rect = candidate.getBoundingClientRect()
    const num = numberElement(candidate)
    const role = readRole(candidate)
    return {
      id: candidate.id || `element-${num}`,
      num,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      focusable: candidate.matches(FOCUSABLE),
      focused: candidate === deepActive(root),
      clickable: role !== undefined && CLICKABLE_ROLES.includes(role),
      editor: editor(candidate),
    }
  }

  const state = (): UiState => {
    const active = deepActive(root)
    return {
      focused: {
        ...(active === null ? {} : {renderable: numberElement(active)}),
        editor: active !== null && editor(active),
      },
      elements: shown()
        .map(element)
        .filter((item) => item.focusable || item.clickable || item.editor),
    }
  }

  const snapshot = (): SemanticSnapshot => {
    const semantic = shown().filter((candidate) => readRole(candidate) !== undefined)
    const semanticElements = new Set(semantic)
    const findSemanticParent = (candidate: Element): Element | undefined => {
      const above = parentAcrossShadow(candidate)
      if (above === null) return undefined
      return semanticElements.has(above) ? above : findSemanticParent(above)
    }
    const nodes = semantic.map((candidate): SemanticNode => {
      const num = numberElement(candidate)
      const parent = findSemanticParent(candidate)
      const label = readLabel(candidate)
      const selected = flag(candidate, 'aria-selected')
      const expanded = flag(candidate, 'aria-expanded')
      const disabled = candidate.matches(':disabled') || flag(candidate, 'aria-disabled') === true
      return {
        id: `node-${num}`,
        role: readRole(candidate) ?? 'generic',
        element: num,
        ...(label === undefined ? {} : {label}),
        ...(parent === undefined ? {} : {parent: `node-${numberElement(parent)}`}),
        ...(candidate === deepActive(root) ? {focused: true} : {}),
        ...(selected === undefined ? {} : {selected}),
        ...(expanded === undefined ? {} : {expanded}),
        ...(disabled ? {disabled} : {}),
      }
    })
    return {format: 'conciv-ui-snapshot-v1', nodes}
  }

  const matches = (text: string): boolean =>
    scopes(root)
      .flatMap((scope) => Array.from(scope.children))
      .some((child) => child instanceof HTMLElement && child.innerText.includes(text))

  const press = (key: string, modifiers: KeyModifiers = {}): void => {
    const target = focused()
    const init: KeyboardEventInit = {
      key: keyName(key),
      bubbles: true,
      composed: true,
      cancelable: true,
      ctrlKey: modifiers.ctrl === true,
      shiftKey: modifiers.shift === true,
      altKey: modifiers.meta === true,
      metaKey: modifiers.super === true,
    }
    target.dispatchEvent(new KeyboardEvent('keydown', init))
    target.dispatchEvent(new KeyboardEvent('keyup', init))
  }

  const focus = (target: number): void => {
    const found = find(target)
    if (!(found instanceof HTMLElement)) throw new Error(`the target element cannot take focus: ${target}`)
    found.focus()
  }

  const confirmSemantic = (params: ClickParams): void => {
    const semantic = params.semantic
    if (semantic === undefined) return
    const current = snapshot().nodes.find((node) => node.element === params.target)
    if (current?.id !== semantic.id || current.instance !== semantic.instance)
      throw new Error(`the semantic click target is stale or unavailable: ${semantic.id}`)
  }

  const click = (params: ClickParams): void => {
    const found = find(params.target)
    confirmSemantic(params)
    clickAt(found, pointAt(found, params.x, params.y))
  }

  return {state, snapshot, matches, type: (text) => insertText(focused(), text), press, focus, click}
}
