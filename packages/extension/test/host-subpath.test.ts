import {expect, test} from 'vitest'

async function distExports(entry: string): Promise<object> {
  return await import(new URL(`../dist/${entry}.js`, import.meta.url).href)
}

test('the root entry hides the host wiring surface', async () => {
  const root = await distExports('index')
  expect(Object.keys(root)).not.toContain('getHostApi')
  expect(Object.keys(root)).not.toContain('HostApiProvider')
})

test('the host entry exposes the host wiring surface', async () => {
  const host = await distExports('host')
  expect(Object.keys(host)).toContain('getHostApi')
  expect(Object.keys(host)).toContain('HostApiProvider')
})
