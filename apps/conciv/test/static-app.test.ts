import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {serveStandaloneApp} from './helpers/static-app.js'

let app: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  app = await serveStandaloneApp()
})

afterAll(async () => {
  await app.close()
})

describe('serveStandaloneApp static file server', () => {
  it('falls back to index.html instead of crashing on EISDIR when a request path names a directory', async () => {
    const response = await fetch(`${app.base}/assets`)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('<html')
  })
})
