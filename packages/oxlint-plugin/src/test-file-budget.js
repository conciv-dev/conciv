import {existsSync, readdirSync} from 'node:fs'
import {basename, dirname, join, matchesGlob, relative, sep} from 'node:path'
import {readTestKind} from '@internal/vitest-config/test-layout'

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const CODE_FILE = /(?<!\.d|\.gen)\.(?:ts|tsx|js|jsx)$/
const LAYOUT_FOLDERS = ['test/unit', 'test/it', 'test/e2e', 'test/fixtures', 'test/utils']
const KIND_FOLDER = /^test\/(unit|it|e2e)\//
const FIXTURE_FOLDER = /^test\/fixtures\//
const DEFAULT_PACKAGES = ['packages/*', 'packages/plugins/*', 'apps/*']
const IGNORED_DIRECTORIES = [
  'node_modules',
  'dist',
  '__screenshots__',
  'fixtures',
  'host',
  'build',
  'test-results',
  '.turbo',
  '.conciv',
]
const MAX_LINES = 1000

function hasPackageJson(directory) {
  return existsSync(join(directory, 'package.json'))
}

function findPackageDirectory(filename) {
  const parent = dirname(filename)
  if (hasPackageJson(parent)) return parent
  if (parent === dirname(parent)) return undefined
  return findPackageDirectory(parent)
}

function isWalkedDirectory(path, name) {
  return !IGNORED_DIRECTORIES.includes(name) && !hasPackageJson(path)
}

function entryCodeFiles(directory, entry) {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return isWalkedDirectory(path, entry.name) ? codeFilesUnder(path) : []
  return CODE_FILE.test(entry.name) ? [path] : []
}

function codeFilesUnder(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => entryCodeFiles(directory, entry))
}

function packagePath(packageDirectory, filename) {
  return relative(packageDirectory, filename).split(sep).join('/')
}

function isSourceFile(packageDirectory, filename) {
  return packagePath(packageDirectory, filename).startsWith('src/') && !TEST_FILE.test(basename(filename))
}

function readPackageFiles(packageDirectory) {
  const files = codeFilesUnder(packageDirectory).toSorted()
  return {
    files,
    tests: files.filter((file) => TEST_FILE.test(basename(file))),
    sources: files.filter((file) => isSourceFile(packageDirectory, file)),
    missing: LAYOUT_FOLDERS.filter((folder) => !existsSync(join(packageDirectory, folder))),
  }
}

function packageFiles(filesByPackage, packageDirectory) {
  const cached = filesByPackage.get(packageDirectory)
  if (cached !== undefined) return cached
  const files = readPackageFiles(packageDirectory)
  filesByPackage.set(packageDirectory, files)
  return files
}

function displayDirectory(packageDirectory) {
  return relative(process.cwd(), packageDirectory).split(sep).join('/') || basename(packageDirectory)
}

function findLayoutPackage(filename, patterns) {
  const packageDirectory = findPackageDirectory(filename)
  if (packageDirectory === undefined) return undefined
  const shown = displayDirectory(packageDirectory)
  return patterns.some((pattern) => matchesGlob(shown, pattern)) ? packageDirectory : undefined
}

function checkFolders(node, context, packageDirectory, filesByPackage) {
  const {files, missing} = packageFiles(filesByPackage, packageDirectory)
  if (missing.length === 0 || files[0] !== context.filename) return
  context.report({
    node,
    messageId: 'missingFolders',
    data: {packageDirectory: displayDirectory(packageDirectory), folders: missing.join(', ')},
  })
}

function checkOverSources(node, context, packageDirectory, filesByPackage) {
  const {tests, sources} = packageFiles(filesByPackage, packageDirectory)
  if (tests.length <= sources.length || tests[0] !== context.filename) return
  context.report({
    node,
    messageId: 'overSources',
    data: {packageDirectory: displayDirectory(packageDirectory), count: tests.length, sources: sources.length},
  })
}

function checkPlace(node, context, file) {
  const folder = KIND_FOLDER.exec(file)?.[1]
  if (folder === undefined) {
    context.report({node, messageId: 'outsideLayout', data: {file}})
    return
  }
  if (readTestKind(`/${file}`) === folder) return
  context.report({node, messageId: 'wrongKind', data: {file, kind: folder}})
}

function checkLength(node, context) {
  const lines = context.sourceCode.text.split('\n').length
  if (lines <= MAX_LINES) return
  context.report({node, messageId: 'tooLong', data: {lines, max: MAX_LINES}})
}

function checkProgram(node, context, filesByPackage) {
  const patterns = context.options[0]?.packages ?? DEFAULT_PACKAGES
  const packageDirectory = findLayoutPackage(context.filename, patterns)
  if (packageDirectory === undefined) return
  const file = packagePath(packageDirectory, context.filename)
  if (FIXTURE_FOLDER.test(file)) return
  checkFolders(node, context, packageDirectory, filesByPackage)
  if (!TEST_FILE.test(basename(context.filename))) return
  checkOverSources(node, context, packageDirectory, filesByPackage)
  checkPlace(node, context, file)
  checkLength(node, context)
}

export default {
  meta: {
    type: 'problem',
    messages: {
      missingFolders:
        '{{packageDirectory}} lacks {{folders}}. Every package and app has test/unit, test/it, test/e2e, test/fixtures and test/utils; an empty one holds a .gitkeep.',
      outsideLayout:
        '{{file}} is a test file outside test/unit, test/it and test/e2e, so vitest never runs it. Move it to test/unit/x.unit.test.ts (node or happy-dom, starts nothing), test/it/x.it.test.ts (node, starts real things) or test/e2e/x.e2e.test.tsx (vitest browser mode).',
      wrongKind:
        '{{file}} is in test/{{kind}} but its name does not end in .{{kind}}.test.ts, .{{kind}}.test.tsx or .{{kind}}.test.js. The name carries the kind of its folder.',
      tooLong: 'This test file has {{lines}} lines. A test file is at most {{max}} lines: cut duplicate cases.',
      overSources:
        '{{packageDirectory}} has {{count}} test files and {{sources}} source files under src/. A package never has more test files than source files: fold new tests into an existing test file.',
    },
    schema: [
      {
        type: 'object',
        properties: {packages: {type: 'array', items: {type: 'string'}}},
        additionalProperties: false,
      },
    ],
  },
  createOnce(context) {
    const filesByPackage = new Map()
    return {
      Program(node) {
        checkProgram(node, context, filesByPackage)
      },
    }
  },
}
