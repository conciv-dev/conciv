import type {ToolLabel} from '@conciv/protocol/tool-icon-types'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {Operations, PAGE_NAMESPACE, type Method} from '@conciv/plugin-page/rpc'

export const PAGE_TOOL_PREFIX = `${PAGE_NAMESPACE}_`

export const PAGE_ACT_TOOL_NAMES: ReadonlySet<string> = new Set(
  Operations.filter((operation) => operation.mutating).map((operation) => `${PAGE_TOOL_PREFIX}${operation.name}`),
)

const PAGE_LABELS: Partial<Record<Method, ToolLabel>> = {
  route: {running: 'Reading the route', done: 'Read the route'},
  dom: {running: 'Reading the DOM', done: 'Read the DOM'},
  query: {running: 'Querying the page', done: 'Queried the page'},
  console: {running: 'Reading the console', done: 'Read the console'},
  text: {running: 'Reading text', done: 'Read the text'},
  value: {running: 'Reading a value', done: 'Read a value'},
  attr: {running: 'Reading an attribute', done: 'Read an attribute'},
  exists: {running: 'Checking existence', done: 'Checked existence'},
  snapshot: {running: 'Capturing a snapshot', done: 'Captured a snapshot'},
  screenshot: {running: 'Taking a screenshot', done: 'Took a screenshot'},
  hmr: {running: 'Waiting for the hot update', done: 'Waited for the hot update'},
  css: {running: 'Injecting CSS', done: 'Injected CSS'},
  eval: {running: 'Running a script', done: 'Ran a script'},
  locate: {running: 'Locating the source', done: 'Located the source'},
  inspect: {running: 'Inspecting a component', done: 'Inspected a component'},
  tree: {running: 'Reading the page tree', done: 'Read the page tree'},
  find: {running: 'Finding components', done: 'Found components'},
  override: {running: 'Overriding a value', done: 'Overrode a value'},
  track: {running: 'Tracking renders', done: 'Tracked renders'},
  effect: {running: 'Driving an effect', done: 'Drove an effect'},
  wait: {running: 'Waiting for the page', done: 'Waited for the page'},
  reload: {running: 'Reloading the page', done: 'Reloaded the page'},
  click: {running: 'Clicking', done: 'Clicked'},
  hover: {running: 'Hovering', done: 'Hovered'},
  scroll: {running: 'Scrolling', done: 'Scrolled'},
  submit: {running: 'Submitting the form', done: 'Submitted the form'},
  fill: {running: 'Typing', done: 'Typed'},
  select: {running: 'Selecting an option', done: 'Selected'},
  check: {running: 'Checking a box', done: 'Checked a box'},
  uncheck: {running: 'Unchecking a box', done: 'Unchecked a box'},
  press: {running: 'Pressing a key', done: 'Pressed'},
  queue: {running: 'Playing page actions', done: 'Played page actions'},
  queue_async: {running: 'Queueing page actions', done: 'Queued page actions'},
  setattr: {running: 'Setting an attribute', done: 'Set an attribute'},
  removeattr: {running: 'Removing an attribute', done: 'Removed an attribute'},
  addclass: {running: 'Adding a class', done: 'Added a class'},
  removeclass: {running: 'Removing a class', done: 'Removed a class'},
  setstyle: {running: 'Styling an element', done: 'Styled an element'},
  settext: {running: 'Setting text', done: 'Set the text'},
  sethtml: {running: 'Setting HTML', done: 'Set the HTML'},
  remove: {running: 'Removing an element', done: 'Removed an element'},
  insert: {running: 'Inserting content', done: 'Inserted content'},
}

export function builtinToolMeta(name: string): ToolViewMeta | undefined {
  const operation = Operations.find((candidate) => `${PAGE_TOOL_PREFIX}${candidate.name}` === name)
  if (!operation) return undefined
  return {summary: operation.description, mutating: operation.mutating, label: PAGE_LABELS[operation.name]}
}

export function pageVerbOfTool(name: string): string {
  if (!name.startsWith(PAGE_TOOL_PREFIX)) throw new Error(`"${name}" is not a page tool`)
  return name.slice(PAGE_TOOL_PREFIX.length)
}

export function pageVerbGerund(verb: string): string {
  const word = builtinToolMeta(`${PAGE_TOOL_PREFIX}${verb}`)?.label?.running.split(' ')[0] ?? ''
  return word.length > 0 ? word : verb
}
