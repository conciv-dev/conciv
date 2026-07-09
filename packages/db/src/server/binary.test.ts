import {describe, expect, it} from 'vitest'
import {createHash} from 'node:crypto'
import {assertAssetChecksum, TRAILBASE_CHECKSUMS, TRAILBASE_VERSION} from './binary.js'

describe('trailbase asset checksums', () => {
  it('pins a sha-256 for every supported platform asset', () => {
    const platforms = ['arm64_apple_darwin', 'arm64_linux', 'x86_64_apple_darwin', 'x86_64_linux', 'x86_64_windows']
    for (const platform of platforms) {
      const asset = `trailbase_${TRAILBASE_VERSION}_${platform}.zip`
      expect(TRAILBASE_CHECKSUMS[asset]).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('accepts bytes matching the pinned hash', () => {
    const asset = `trailbase_${TRAILBASE_VERSION}_arm64_apple_darwin.zip`
    const bytes = new Uint8Array([1, 2, 3])
    const digest = createHash('sha256').update(bytes).digest('hex')
    expect(() => assertAssetChecksum(asset, bytes, {[asset]: digest})).not.toThrow()
  })

  it('rejects bytes that do not match the pinned hash', () => {
    const asset = `trailbase_${TRAILBASE_VERSION}_arm64_apple_darwin.zip`
    expect(() => assertAssetChecksum(asset, new Uint8Array([1, 2, 3]))).toThrowError(
      expect.objectContaining({code: 'checksum-mismatch', userCode: 'state.checksum-mismatch'}),
    )
  })

  it('rejects assets with no pinned hash', () => {
    expect(() => assertAssetChecksum('trailbase_v9.9.9_arm64_apple_darwin.zip', new Uint8Array())).toThrowError(
      expect.objectContaining({code: 'checksum-mismatch'}),
    )
  })
})
