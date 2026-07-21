import {spawn, type ChildProcess} from 'node:child_process'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'

const SITE_PORT = 8792
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
let site: ChildProcess

beforeAll(async () => {
  site = spawn('pnpm', ['exec', 'wrangler', 'dev', '--port', String(SITE_PORT)], {cwd: import.meta.dirname + '/..'})
  await new Promise<void>((resolve, reject) => {
    const output: string[] = []
    site.stdout?.on('data', (chunk: Buffer) => {
      output.push(String(chunk))
      if (String(chunk).includes('Ready')) resolve()
    })
    site.stderr?.on('data', (chunk: Buffer) => output.push(String(chunk)))
    site.on('exit', () => reject(new Error(`wrangler dev exited:\n${output.join('')}`)))
  })
}, 120_000)

afterAll(() => {
  site?.kill()
})

async function docsRoutes(): Promise<string[]> {
  const response = await fetch(`${ORIGIN}/llms.txt`)
  expect(response.status).toBe(200)
  const index = await response.text()
  return [...new Set([...index.matchAll(/\((\/docs[^)]*)\)/g)].flatMap((match) => match[1] ?? []))]
}

describe('the built worker renders every route it serves', () => {
  it('serves each docs page from the fumadocs index without a server error', async () => {
    const routes = await docsRoutes()
    expect(routes.length).toBeGreaterThan(5)

    const failures = await Promise.all(
      routes.map(async (route) => {
        const response = await fetch(`${ORIGIN}${route}`)
        const body = await response.text()
        const broken = /Internal Server Error|Cannot find module|is not defined|ReferenceError/i.test(body)
        return response.status === 200 && !broken
          ? null
          : `${route} -> ${response.status}${broken ? ' (error in body)' : ''}`
      }),
    )

    expect(failures.filter((failure) => failure !== null)).toEqual([])
  }, 120_000)
})
