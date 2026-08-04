import {expect, vi} from 'vitest'

export function captureStdout(written: string[]): void {
  written.length = 0
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    written.push(String(chunk))
    return true
  })
}

export function onlyDocument(written: string[]): unknown {
  expect(written).toHaveLength(1)
  return JSON.parse(written[0] ?? 'null')
}
