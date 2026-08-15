import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {test} from '@playwright/test'
import {bootCoreKit, type CoreKit} from '../../src/core-kit.js'
import {serveHost} from '../../src/serve-host.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export type ProbeSuite = {
  kit: () => CoreKit
  host: () => {base: string; close: () => Promise<void>}
  socketUrl: () => string
}

function wsProbeHostPage(): string {
  const probeBundle = fs.readFileSync(path.join(dirname, '../dist/conciv-ws-probe.global.js'), 'utf8')
  return `<!doctype html><html><head></head><body>
    <div id="probe">page-bus-ok</div>
    <script>${probeBundle}</script>
  </body></html>`
}

export function setupWsProbeSuite(): ProbeSuite {
  let kit: CoreKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeAll(async () => {
    kit = await bootCoreKit({id: 'fake-probe'})
    host = await serveHost(() => wsProbeHostPage())
  })

  test.afterAll(async () => {
    try {
      await host.close()
    } finally {
      await kit.cleanup()
    }
  })

  return {
    kit: () => kit,
    host: () => host,
    socketUrl: () => `${kit.wsBase}/rpc-ws`,
  }
}
