import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {readDevEndpoint} from '../src/lib/dev-endpoint.js'
import {start} from '../src/start.js'

describe('start pairing file', () => {
  it('writes the endpoint on boot when a native page is served and removes it on stop', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-start-endpoint-'))
    const endpointDir = mkdtempSync(join(tmpdir(), 'conciv-endpoint-dir-'))
    try {
      const engine = await start({
        options: {harnessBin: 'true', stateRoot: root, systemPrompt: false},
        root,
        launchEditor: () => {},
        port: 41811,
        accessToken: 'paired-token',
        nativePageDir: root,
        devEndpointDir: endpointDir,
      })
      const endpoint = readDevEndpoint(endpointDir)
      expect(endpoint).toEqual({
        apiBase: 'http://127.0.0.1:41811/t/paired-token',
        token: 'paired-token',
        pid: process.pid,
      })
      await engine.stop()
      expect(readDevEndpoint(endpointDir)).toBeNull()
    } finally {
      rmSync(root, {recursive: true, force: true})
      rmSync(endpointDir, {recursive: true, force: true})
    }
  })

  it('does not write the endpoint when no native page is served', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-start-endpoint-'))
    const endpointDir = mkdtempSync(join(tmpdir(), 'conciv-endpoint-dir-'))
    try {
      const engine = await start({
        options: {harnessBin: 'true', stateRoot: root, systemPrompt: false},
        root,
        launchEditor: () => {},
        port: 41812,
        devEndpointDir: endpointDir,
      })
      expect(readDevEndpoint(endpointDir)).toBeNull()
      await engine.stop()
    } finally {
      rmSync(root, {recursive: true, force: true})
      rmSync(endpointDir, {recursive: true, force: true})
    }
  })
})
