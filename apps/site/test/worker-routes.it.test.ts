import {describe, expect, it} from 'vitest'
import {serveSite} from './site-fixture.js'

const ORIGIN = serveSite({port: 8792, inspectorPort: 9792})

function servedByWorker(response: Response): boolean {
  return response.headers.get('etag') === null && response.headers.get('cf-cache-status') === null
}

async function markdownRoutes(): Promise<string[]> {
  const response = await fetch(`${ORIGIN}/llms.txt`)
  expect(response.status).toBe(200)
  const index = await response.text()
  const docs = [...new Set([...index.matchAll(/\((\/docs[^)]*)\)/g)].flatMap((match) => match[1] ?? []))]
  return docs.map((route) => (route === '/docs' ? '/docs/index.md' : `${route}.md`))
}

describe('the built worker renders every route it serves', () => {
  it('renders the markdown of every documented page, from the worker itself', async () => {
    const routes = await markdownRoutes()
    expect(routes.length).toBeGreaterThan(5)

    const failures = await Promise.all(
      routes.map(async (route) => {
        const response = await fetch(`${ORIGIN}${route}`)
        const body = await response.text()
        const broken = /Internal Server Error|Cannot find module|No such module|ReferenceError/i.test(body)
        if (!servedByWorker(response)) return `${route} was served as a static asset, so the worker was never exercised`
        return response.status === 200 && !broken
          ? null
          : `${route} -> ${response.status}${broken ? ' (error in body)' : ''}`
      }),
    )

    expect(failures.filter((failure) => failure !== null)).toEqual([])
  }, 120_000)

  it('renders a not-found docs page through the worker rather than crashing', async () => {
    const response = await fetch(`${ORIGIN}/docs/this-page-does-not-exist`)
    expect(servedByWorker(response)).toBe(true)
    expect(response.status).toBe(404)
    expect(await response.text()).not.toMatch(/Internal Server Error|No such module/i)
  }, 60_000)
})
