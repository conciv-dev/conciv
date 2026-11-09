import {isSensitiveField, MASKED_VALUE} from '@conciv/page'
import {frameDocument} from './agent-cursor.js'
import {setNativeValue, simulateClick, simulateFill} from './simulator.js'

const XHTML = 'http://www.w3.org/1999/xhtml'
const MOUSE_POINTER = {pointerId: 1, pointerType: 'mouse', isPrimary: true}
const HOVER_EVENTS = ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove']

export function isHtml(element: Element): element is HTMLElement {
  return element.namespaceURI === XHTML
}

function isInput(element: Element): element is HTMLInputElement {
  return element.localName === 'input'
}

function isTextArea(element: Element): element is HTMLTextAreaElement {
  return element.localName === 'textarea'
}

function isSelect(element: Element): element is HTMLSelectElement {
  return element.localName === 'select'
}

function isVisible(element: Element): boolean {
  if (!element.checkVisibility({visibilityProperty: true})) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0
}

export function isDisabled(element: Element): boolean {
  return element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true'
}

export function actionable(element: Element): Element | string {
  if (!isVisible(element)) return 'That element is not visible.'
  if (isDisabled(element)) return 'That element is disabled.'
  return element
}

function center(element: Element): {clientX: number; clientY: number} {
  const rect = element.getBoundingClientRect()
  return {clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2}
}

function pointer(options: {element: Element; type: string}): void {
  const {element, type} = options
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: element.ownerDocument.defaultView,
    ...center(element),
  }
  if (type.startsWith('pointer')) return void element.dispatchEvent(new PointerEvent(type, {...init, ...MOUSE_POINTER}))
  element.dispatchEvent(new MouseEvent(type, init))
}

export function hover(element: Element): void {
  for (const type of HOVER_EVENTS) pointer({element, type})
}

function changed(element: Element): void {
  element.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
  element.dispatchEvent(new Event('change', {bubbles: true}))
}

export async function fill(options: {element: Element; value: string; agent: string}): Promise<string | null> {
  const {element, value, agent} = options
  if (!isInput(element) && !isTextArea(element)) return 'That element is not a text field.'
  if (element.readOnly) return 'That field is read-only.'
  await simulateFill({element, value, agent})
  if (value !== '' && element.value === '') return `The field rejected ${shown({element, value})} and stayed empty.`
  return null
}

export function select(options: {element: Element; value: string}): {value: string} | string {
  const {element, value} = options
  if (!isSelect(element)) return 'That element is not a select.'
  const choices = Array.from(element.options)
  const option = choices.find((each) => each.value === value) ?? choices.find((each) => each.label.trim() === value)
  if (!option) return `No option ${shown({element, value})}; options: ${choices.map(described).join(', ')}.`
  setNativeValue({element, value: option.value})
  changed(element)
  return {value: element.value}
}

export async function setChecked(options: {
  element: Element
  checked: boolean
  agent: string
}): Promise<{checked: boolean} | string> {
  const {element, checked, agent} = options
  if (isInput(element) && (element.type === 'checkbox' || element.type === 'radio')) {
    if (element.checked === checked) return {checked}
    if (element.type === 'radio' && !checked) return 'A radio is unchecked by checking another one.'
    await simulateClick({element, agent})
    return reached({now: element.checked, checked})
  }
  const aria = element.getAttribute('aria-checked')
  if (aria === null) return 'That element is not a checkbox.'
  if ((aria === 'true') !== checked) await simulateClick({element, agent})
  return reached({now: element.getAttribute('aria-checked') === 'true', checked})
}

function shown(options: {element: Element; value: string}): string {
  return isSensitiveField(options.element) ? MASKED_VALUE : JSON.stringify(options.value)
}

function described(option: HTMLOptionElement): string {
  return `${option.value} ${JSON.stringify(option.label)}`
}

function reached(options: {now: boolean; checked: boolean}): {checked: boolean} | string {
  const {now, checked} = options
  if (now === checked) return {checked}
  return `The box is still ${now ? 'checked' : 'unchecked'}; the page prevented the change.`
}

function deepActive(element: Element): Element {
  const inner = frameDocument(element)?.activeElement
  return inner ? deepActive(inner) : element
}

export function focusedElement(): Element {
  return deepActive(document.activeElement ?? document.body)
}

export function press(options: {element: Element; key: string}): void {
  const {element, key} = options
  const init = {key, bubbles: true, cancelable: true, composed: true, view: element.ownerDocument.defaultView}
  element.dispatchEvent(new KeyboardEvent('keydown', init))
  element.dispatchEvent(new KeyboardEvent('keyup', init))
}
