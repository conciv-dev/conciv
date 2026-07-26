import {test, expect} from 'vitest'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  assembleMirrorTree,
  assertBareSemver,
  fingerprintTree,
  readBridgeVersion,
  treesMatch,
} from '../src/swift-mirror.ts'

async function scaffold(
  version: string,
): Promise<{sourceDir: string; templateDir: string; destDir: string; bridgeManifestPath: string; root: string}> {
  const root = await mkdtemp(join(tmpdir(), 'swift-mirror-'))
  const sourceDir = join(root, 'source')
  const templateDir = join(root, 'template')
  const destDir = join(root, 'dest')
  const bridgeManifestPath = join(root, 'bridge-package.json')
  await mkdir(join(sourceDir, 'Sources', 'ConcivWidget'), {recursive: true})
  await mkdir(join(sourceDir, 'Tests', 'ConcivWidgetTests', 'Fixtures', 'bridge'), {recursive: true})
  await mkdir(join(sourceDir, '.build'), {recursive: true})
  await mkdir(templateDir, {recursive: true})
  await writeFile(bridgeManifestPath, `${JSON.stringify({name: '@conciv/extension-ios', version}, null, 2)}\n`)
  await writeFile(join(sourceDir, 'Package.swift'), 'let package = 1\n')
  await writeFile(join(sourceDir, 'Sources', 'ConcivWidget', 'ConcivWidget.swift'), 'public struct ConcivWidget {}\n')
  await writeFile(join(sourceDir, 'Tests', 'ConcivWidgetTests', 'Fixtures', 'bridge', 'n2p.open.json'), '{}\n')
  await writeFile(join(sourceDir, '.build', 'build.db'), 'binary-artifact\n')
  await writeFile(join(templateDir, 'README.md'), '# ConcivWidget\n')
  await writeFile(join(templateDir, 'RELEASE_HYGIENE.md'), '# hygiene\n')
  await writeFile(join(templateDir, 'LICENSE'), 'MIT License\n')
  return {sourceDir, templateDir, destDir, bridgeManifestPath, root}
}

test('assembleMirrorTree promotes the nested tree, copies templates, and returns the version', async () => {
  const {sourceDir, templateDir, destDir, bridgeManifestPath, root} = await scaffold('1.2.3')
  const tree = await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})
  expect(tree.version).toBe('1.2.3')
  expect(tree.files).toContain('Package.swift')
  expect(await readFile(join(destDir, 'Package.swift'), 'utf8')).toBe('let package = 1\n')
  expect(await readFile(join(destDir, 'Sources', 'ConcivWidget', 'ConcivWidget.swift'), 'utf8')).toContain(
    'ConcivWidget',
  )
  expect(
    await readFile(join(destDir, 'Tests', 'ConcivWidgetTests', 'Fixtures', 'bridge', 'n2p.open.json'), 'utf8'),
  ).toBe('{}\n')
  expect(await readFile(join(destDir, 'README.md'), 'utf8')).toBe('# ConcivWidget\n')
  expect(await readFile(join(destDir, 'RELEASE_HYGIENE.md'), 'utf8')).toBe('# hygiene\n')
  expect(tree.files).toContain('LICENSE')
  expect(await readFile(join(destDir, 'LICENSE'), 'utf8')).toBe('MIT License\n')
  await rm(root, {recursive: true, force: true})
})

test('assembleMirrorTree excludes the .build artifact directory', async () => {
  const {sourceDir, templateDir, destDir, bridgeManifestPath, root} = await scaffold('1.0.0')
  await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})
  await expect(readFile(join(destDir, '.build', 'build.db'), 'utf8')).rejects.toThrow()
  await rm(root, {recursive: true, force: true})
})

test('assembleMirrorTree is idempotent: a second run leaves no stale files', async () => {
  const {sourceDir, templateDir, destDir, bridgeManifestPath, root} = await scaffold('2.0.1')
  await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})
  await writeFile(join(destDir, 'Sources', 'ConcivWidget', 'Stale.swift'), 'stale\n')
  const tree = await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})
  expect(tree.version).toBe('2.0.1')
  await expect(readFile(join(destDir, 'Sources', 'ConcivWidget', 'Stale.swift'), 'utf8')).rejects.toThrow()
  await rm(root, {recursive: true, force: true})
})

test('treesMatch is true for two identical assembled trees and false after a source edit', async () => {
  const first = await scaffold('4.0.0')
  const secondDest = join(first.root, 'dest2')
  await assembleMirrorTree({
    sourceDir: first.sourceDir,
    templateDir: first.templateDir,
    destDir: first.destDir,
    bridgeManifestPath: first.bridgeManifestPath,
  })
  await assembleMirrorTree({
    sourceDir: first.sourceDir,
    templateDir: first.templateDir,
    destDir: secondDest,
    bridgeManifestPath: first.bridgeManifestPath,
  })
  expect(await treesMatch(first.destDir, secondDest)).toBe(true)

  await writeFile(
    join(first.sourceDir, 'Sources', 'ConcivWidget', 'ConcivWidget.swift'),
    'public struct ConcivWidget { let v = 2 }\n',
  )
  const driftedDest = join(first.root, 'dest3')
  await assembleMirrorTree({
    sourceDir: first.sourceDir,
    templateDir: first.templateDir,
    destDir: driftedDest,
    bridgeManifestPath: first.bridgeManifestPath,
  })
  expect(await treesMatch(first.destDir, driftedDest)).toBe(false)
  await rm(first.root, {recursive: true, force: true})
})

test('fingerprintTree ignores a .git directory so a clone compares equal to the assembled tree', async () => {
  const {sourceDir, templateDir, destDir, bridgeManifestPath, root} = await scaffold('4.1.0')
  await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})
  const withGit = join(root, 'withGit')
  await assembleMirrorTree({sourceDir, templateDir, destDir: withGit, bridgeManifestPath})
  await mkdir(join(withGit, '.git'), {recursive: true})
  await writeFile(join(withGit, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  expect(await fingerprintTree(destDir)).toBe(await fingerprintTree(withGit))
  await rm(root, {recursive: true, force: true})
})

test('readBridgeVersion reads the manifest version and validates bare semver', async () => {
  const {bridgeManifestPath, root} = await scaffold('3.4.5')
  expect(await readBridgeVersion(bridgeManifestPath)).toBe('3.4.5')
  await rm(root, {recursive: true, force: true})
})

test('readBridgeVersion rejects a manifest whose version is not bare semver', async () => {
  const root = await mkdtemp(join(tmpdir(), 'swift-mirror-'))
  const bridgeManifestPath = join(root, 'bridge-package.json')
  await writeFile(bridgeManifestPath, `${JSON.stringify({name: '@conciv/extension-ios', version: '0.0.15-beta.1'})}\n`)
  await expect(readBridgeVersion(bridgeManifestPath)).rejects.toThrow(/invalid swift sdk version/)
  await rm(root, {recursive: true, force: true})
})

test('assertBareSemver rejects scoped tags, prefixes, and ranges', () => {
  for (const good of ['1.0.0', '0.0.15', '12.34.56']) {
    expect(() => assertBareSemver(good), good).not.toThrow()
  }
  for (const bad of ['v1.0.0', '1.0', '1.0.0-beta', '@conciv/extension-ios@0.0.15', '', '1.0.0 ']) {
    expect(() => assertBareSemver(bad), bad).toThrow(/invalid swift sdk version/)
  }
})
