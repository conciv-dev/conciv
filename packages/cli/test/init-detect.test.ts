import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {detectFramework, detectProject} from '../src/init/detect.js'

const dir = (): string => mkdtempSync(join(tmpdir(), 'conciv-detect-'))

const seed = (cwd: string, manifest: object): void => {
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(manifest))
}

describe('detectFramework', () => {
  it('prefers nextjs when next and vite are both present', () => {
    const cwd = dir()
    seed(cwd, {dependencies: {next: '15.0.0'}, devDependencies: {vite: '6.0.0'}})
    writeFileSync(join(cwd, 'next.config.ts'), 'export default {}')
    expect(detectFramework(cwd)).toEqual({framework: 'nextjs', configFile: 'next.config.ts'})
  })
  it('finds the vite config under its actual extension', () => {
    const cwd = dir()
    seed(cwd, {devDependencies: {vite: '6.0.0'}})
    writeFileSync(join(cwd, 'vite.config.mts'), 'export default {}')
    expect(detectFramework(cwd)).toEqual({framework: 'vite', configFile: 'vite.config.mts'})
  })
  it('reports unknown with no config for a deps-less manifest', () => {
    const cwd = dir()
    seed(cwd, {name: 'bare'})
    expect(detectFramework(cwd)).toEqual({framework: 'unknown', configFile: null})
  })
  it('ranks rspack above webpack and reports a missing config as null', () => {
    const cwd = dir()
    seed(cwd, {devDependencies: {'@rspack/cli': '1.0.0', webpack: '5.0.0'}})
    expect(detectFramework(cwd)).toEqual({framework: 'rspack', configFile: null})
  })
  it('detects esbuild with no config file convention', () => {
    const cwd = dir()
    seed(cwd, {devDependencies: {esbuild: '0.24.0'}})
    expect(detectFramework(cwd)).toEqual({framework: 'esbuild', configFile: null})
  })
})

describe('detectProject', () => {
  it('honors the packageManager manifest field', async () => {
    const cwd = dir()
    seed(cwd, {packageManager: 'pnpm@10.0.0', devDependencies: {vite: '6.0.0'}})
    writeFileSync(join(cwd, 'vite.config.ts'), 'export default {}')
    expect(await detectProject(cwd)).toEqual({framework: 'vite', configFile: 'vite.config.ts', packageManager: 'pnpm'})
  })
  it('falls back to npm when nothing marks a manager', async () => {
    const cwd = dir()
    seed(cwd, {})
    expect(await detectProject(cwd)).toEqual({framework: 'unknown', configFile: null, packageManager: 'npm'})
  })
})
