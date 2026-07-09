import {describe, expect, it} from 'vitest'
import {uuidv7Base64} from './uuid.js'

describe('uuidv7Base64', () => {
  it('emits url-safe base64 of 16 bytes with version and variant bits', () => {
    const id = uuidv7Base64(() => 1783545917000)
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}==$/)
    const bytes = Uint8Array.from(atob(id.replaceAll('-', '+').replaceAll('_', '/')), (ch) => ch.charCodeAt(0))
    expect(bytes).toHaveLength(16)
    expect((bytes[6] ?? 0) >> 4).toBe(7)
    expect((bytes[8] ?? 0) >> 6).toBe(2)
  })

  it('encodes the timestamp big-endian in the first 6 bytes', () => {
    const id = uuidv7Base64(() => 0x0102030405aa)
    const bytes = Uint8Array.from(atob(id.replaceAll('-', '+').replaceAll('_', '/')), (ch) => ch.charCodeAt(0))
    expect([...bytes.slice(0, 6)]).toEqual([0x01, 0x02, 0x03, 0x04, 0x05, 0xaa])
  })
})
