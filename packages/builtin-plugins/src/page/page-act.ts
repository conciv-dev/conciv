import {LETTER_KEYS, NUMBER_KEYS, PUNCTUATION_CODE_MAP, parseHotkey} from '@tanstack/hotkeys'
import {isSensitiveField, MASKED_VALUE} from '@conciv/page'
import {frameDocument} from './agent-cursor.js'
import {setNativeValue, simulateClick, simulateFill, typeByCommands, typeByEvents} from './simulator.js'

const XHTML = 'http://www.w3.org/1999/xhtml'
const CODE_EDITORS = '.cm-editor, .CodeMirror, .monaco-editor'
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

function pageTurn(): Promise<void> {
  const channel = new MessageChannel()
  return new Promise((resolve) => {
    channel.port1.addEventListener(
      'message',
      () => {
        channel.port1.close()
        resolve()
      },
      {once: true},
    )
    channel.port1.start()
    channel.port2.postMessage(null)
    channel.port2.close()
  })
}

function editableHost(element: Element): HTMLElement | null {
  const host = element.closest('[contenteditable]')
  return host && isHtml(host) ? host : null
}

function squashed(text: string): string {
  return text.replace(/[\s\u200B\uFEFF]+/g, ' ').trim()
}

function holds(options: {host: HTMLElement; value: string}): boolean {
  return squashed(options.host.innerText) === squashed(options.value)
}

function reported(options: {element: Element; value: string}): {value: string} {
  return {value: isSensitiveField(options.element) ? MASKED_VALUE : options.value}
}

async function fillEditor(options: {
  host: HTMLElement
  value: string
  agent: string
}): Promise<{value: string} | string> {
  const {host, value, agent} = options
  simulateClick({element: host, agent})
  typeByEvents({host, value})
  await pageTurn()
  if (!holds({host, value})) typeByCommands({host, value})
  host.dispatchEvent(new Event('change', {bubbles: true}))
  await pageTurn()
  if (!holds({host, value})) return `The editor rejected ${shown({element: host, value})}; its text does not match it.`
  return reported({element: host, value: host.innerText.trim()})
}

export async function fill(options: {
  element: Element
  value: string
  agent: string
}): Promise<{value: string} | string> {
  const {element, value, agent} = options
  if (element.closest(CODE_EDITORS)) return 'That is a code editor (CodeMirror or Monaco); fill cannot type into it.'
  const readOnly = element.closest('[aria-readonly]')?.getAttribute('aria-readonly') === 'true'
  if (!isInput(element) && !isTextArea(element)) {
    const host = editableHost(element)
    if (!host) return 'That element is not a text field.'
    if (readOnly || !host.isContentEditable) return 'That field is read-only.'
    return fillEditor({host, value, agent})
  }
  if (readOnly || element.readOnly) return 'That field is read-only.'
  simulateFill({element, value, agent})
  await pageTurn()
  if (value !== '' && element.value === '') return `The field rejected ${shown({element, value})} and stayed empty.`
  return reported({element, value: element.value})
}

export async function select(options: {element: Element; value: string}): Promise<{value: string} | string> {
  const {element, value} = options
  if (!isSelect(element)) return 'That element is not a select.'
  const choices = Array.from(element.options)
  const option = choices.find((each) => each.value === value) ?? choices.find((each) => each.label.trim() === value)
  if (!option) return `No option ${shown({element, value})}; options: ${choices.map(described).join(', ')}.`
  setNativeValue({element, value: option.value})
  changed(element)
  await pageTurn()
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
    simulateClick({element, agent})
    await pageTurn()
    return reached({now: element.checked, checked})
  }
  const aria = element.getAttribute('aria-checked')
  if (aria === null) return 'That element is not a checkbox.'
  if ((aria === 'true') === checked) return {checked}
  simulateClick({element, agent})
  await pageTurn()
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
  const init = {...keyInit(key), view: element.ownerDocument.defaultView}
  element.dispatchEvent(new KeyboardEvent('keydown', init))
  element.dispatchEvent(new KeyboardEvent('keyup', init))
}

const LETTERS: ReadonlySet<string> = LETTER_KEYS
const DIGITS: ReadonlySet<string> = NUMBER_KEYS

function keyInit(binding: string): KeyboardEventInit {
  const parsed = parseHotkey(binding.trim() === '' ? 'Space' : binding)
  const name = parsed.key ?? parsed.code
  return {
    key: typedKey({name, shift: parsed.shift}),
    code: parsed.code ?? resolveKeyCode(name),
    ctrlKey: parsed.ctrl,
    shiftKey: parsed.shift,
    altKey: parsed.alt,
    metaKey: parsed.meta,
    bubbles: true,
    cancelable: true,
    composed: true,
  }
}

function typedKey(options: {name: string; shift: boolean}): string {
  const {name, shift} = options
  if (name === 'Space') return ' '
  if (!LETTERS.has(name) || shift) return name
  return name.toLowerCase()
}

function resolveKeyCode(key: string): string {
  const upper = key.toUpperCase()
  if (LETTERS.has(upper)) return `Key${upper}`
  if (DIGITS.has(key)) return `Digit${key}`
  return Object.entries(PUNCTUATION_CODE_MAP).find(([, character]) => character === key)?.[0] ?? key
}
