import {Predicate} from 'effect'
import {z} from 'zod'
import {isEqual} from 'es-toolkit'
import type {ReactFiber} from '@conciv/frontend-plugin-api/page'
import {dehydrate} from './dehydrate.js'
import {rootFibers} from './react.js'

const RedactedPair = z.record(z.string(), z.string())

const MAX_FIBER_NODES = 50_000

const RouteMatch = z.object({fullPath: z.string(), params: z.record(z.string(), z.unknown())})

const Params = z.record(z.string(), z.unknown())

type Router = {
  readonly state: {readonly matches: readonly unknown[]}
  readonly buildLocation: (options: {to: string; params: Record<string, unknown>}) => {pathname: string}
}

function isRouter(candidate: unknown): candidate is Router {
  if (!Predicate.isObject(candidate)) return false
  const state = candidate.state
  return Predicate.isObject(state) && Array.isArray(state.matches) && Predicate.isFunction(candidate.buildLocation)
}

function routerIn(fiber: ReactFiber): Router | undefined {
  const props: unknown = fiber.memoizedProps
  const candidate = Predicate.isObject(props) ? props.router : undefined
  return isRouter(candidate) ? candidate : undefined
}

function findRouter(): Router | undefined {
  const stack: ReactFiber[] = [...rootFibers()]
  for (let seen = 0; seen < MAX_FIBER_NODES; seen++) {
    const fiber = stack.pop()
    if (!fiber) return undefined
    const router = routerIn(fiber)
    if (router) return router
    if (fiber.child) stack.push(fiber.child)
    if (fiber.sibling) stack.push(fiber.sibling)
  }
  return undefined
}

function redactedPathname(pathname: string): string {
  const router = findRouter()
  const match = RouteMatch.safeParse(router?.state.matches.at(-1))
  if (!router || !match.success) return pathname
  const redacted = Params.safeParse(dehydrate(match.data.params))
  if (!redacted.success || isEqual(redacted.data, match.data.params)) return pathname
  return router.buildLocation({to: match.data.fullPath, params: redacted.data}).pathname
}

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

export function redactedUrl(href: string): string {
  const url = new URL(href)

  url.username = ''
  url.password = ''
  url.pathname = redactedPathname(url.pathname)
  url.search = redactedPairs(url.search)
  url.hash = redactedPairs(url.hash)
  return url.href
}
