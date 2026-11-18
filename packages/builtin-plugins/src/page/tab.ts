import {z} from 'zod'
import {dehydrate} from '@conciv/page'
import {Tab} from '@conciv/plugin-page/rpc'

const TAB_EVENTS = ['focus', 'blur']

const URL_MAX = Tab.shape.url.maxLength ?? Number.POSITIVE_INFINITY

const TITLE_MAX = Tab.shape.title.maxLength ?? Number.POSITIVE_INFINITY

const RedactedPair = z.record(z.string(), z.string())

function redactedValue(key: string, value: string): string {
  const pair = RedactedPair.safeParse(dehydrate({[key]: value}, {stringCap: Number.POSITIVE_INFINITY}))

  return pair.success ? (pair.data[key] ?? value) : value
}

function redactedPairs(text: string): string {
  const pairs = [...new URLSearchParams(text.slice(1))]
  const redacted = pairs.map(([key, value]) => [key, redactedValue(key, value)])

  if (redacted.every(([, value], index) => value === pairs[index]?.[1])) return text
  return new URLSearchParams(redacted).toString()
}

function redactedUrl(href: string): string {
  const url = new URL(href)

  url.username = ''
  url.password = ''
  url.search = redactedPairs(url.search)
  url.hash = redactedPairs(url.hash)
  return url.href
}

export function readTab(id: string): Tab {
  return {
    id,
    url: redactedUrl(location.href).slice(0, URL_MAX),
    title: document.title.slice(0, TITLE_MAX),
    focused: document.hasFocus(),
    visible: document.visibilityState === 'visible',
  }
}

export function reportChanges(report: () => void, signal: AbortSignal) {
  TAB_EVENTS.forEach((type) => window.addEventListener(type, report, {signal}))
  document.addEventListener('visibilitychange', report, {signal})
  navigation.addEventListener('currententrychange', report, {signal})
  let title = document.title
  const titles = new MutationObserver(() => {
    if (document.title === title) return
    title = document.title
    report()
  })

  titles.observe(document.head, {childList: true, subtree: true, characterData: true})
  signal.addEventListener('abort', () => titles.disconnect(), {once: true})
}
