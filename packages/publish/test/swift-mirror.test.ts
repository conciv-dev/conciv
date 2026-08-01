import {test, expect} from 'vitest'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execa} from 'execa'
import {
  assembleMirrorTree,
  assertBareSemver,
  extractCommitSubtree,
  fingerprintTree,
  readBridgeVersion,
  resolveVersionCommit,
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

const MANIFEST_REL = 'packages/extensions/ios/package.json'
const SOURCE_REL = 'native/swift/ConcivWidget'

async function initRepo(): Promise<{repo: string; git: (...args: string[]) => Promise<unknown>}> {
  const repo = await mkdtemp(join(tmpdir(), 'swift-mirror-repo-'))
  const git = (...args: string[]) => execa('git', ['-C', repo, ...args])
  await git('init', '-q')
  await git('config', 'user.email', 'mirror@conciv.dev')
  await git('config', 'user.name', 'mirror-test')
  await git('config', 'commit.gpgsign', 'false')
  return {repo, git}
}

async function commitVersion(
  repo: string,
  git: (...args: string[]) => Promise<unknown>,
  version: string,
  swiftBody: string,
  message: string,
): Promise<void> {
  await mkdir(join(repo, 'packages', 'extensions', 'ios'), {recursive: true})
  await mkdir(join(repo, 'native', 'swift', 'ConcivWidget', 'Sources'), {recursive: true})
  await writeFile(join(repo, MANIFEST_REL), `${JSON.stringify({name: '@conciv/extension-ios', version}, null, 2)}\n`)
  await writeFile(join(repo, 'native', 'swift', 'ConcivWidget', 'Sources', 'W.swift'), swiftBody)
  await git('add', '-A')
  await git('commit', '-qm', message)
}

test('resolveVersionCommit + extractCommitSubtree anchor the tree to the release commit, not HEAD', async () => {
  const {repo, git} = await initRepo()
  await commitVersion(repo, git, '1.0.0', 'let a = 1\n', 'release 1.0.0')
  await commitVersion(repo, git, '2.0.0', 'let b = 2\n', 'release 2.0.0')
  await writeFile(join(repo, 'native', 'swift', 'ConcivWidget', 'Sources', 'W.swift'), 'let c = 3\n')
  await git('add', '-A')
  await git('commit', '-qm', 'post-release swift edit, manifest still 2.0.0')

  const commit = await resolveVersionCommit(repo, MANIFEST_REL, '2.0.0')
  const head = await execa('git', ['-C', repo, 'rev-parse', 'HEAD'])
  expect(commit).not.toBe(head.stdout.trim())

  const dest = join(repo, '_extract')
  await extractCommitSubtree(repo, commit, SOURCE_REL, dest)
  const extracted = await readFile(join(dest, 'Sources', 'W.swift'), 'utf8')
  expect(extracted).toBe('let b = 2\n')
  expect(extracted).not.toBe('let c = 3\n')
  await rm(repo, {recursive: true, force: true})
})

test('resolveVersionCommit throws when the version was never set in history', async () => {
  const {repo, git} = await initRepo()
  await commitVersion(repo, git, '1.0.0', 'let a = 1\n', 'release 1.0.0')
  await expect(resolveVersionCommit(repo, MANIFEST_REL, '9.9.9')).rejects.toThrow(/could not find the commit/)
  await rm(repo, {recursive: true, force: true})
})

test('assertBareSemver rejects scoped tags, prefixes, and ranges', () => {
  for (const good of ['1.0.0', '0.0.15', '12.34.56']) {
    expect(() => assertBareSemver(good), good).not.toThrow()
  }
  for (const bad of ['v1.0.0', '1.0', '1.0.0-beta', '@conciv/extension-ios@0.0.15', '', '1.0.0 ']) {
    expect(() => assertBareSemver(bad), bad).toThrow(/invalid swift sdk version/)
  }
})
