import {describe, expect, it, onTestFinished} from 'vitest'
import {browserRpcConnection} from './browser-transport.js'

const BASE = 'http://127.0.0.1:9/conciv-timings'

function held(timings?: Parameters<typeof browserRpcConnection>[2]) {
  const connection = browserRpcConnection(BASE, undefined, timings)
  onTestFinished(connection.release)
  return connection
}

describe('browser rpc connection pool by timings', () => {
  it('shares one connection for equal timings of a base and never one socket for different timings', () => {
    const plain = held()
    const sameAsDefaults = held({})
    const shortened = held({openTimeoutMs: 50})
    const shortenedAgain = held({openTimeoutMs: 50})
    expect(sameAsDefaults.link).toBe(plain.link)
    expect(shortenedAgain.link).toBe(shortened.link)
    expect(shortened.link).not.toBe(plain.link)
  })
})
