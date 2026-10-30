import {existsSync, readdirSync} from 'node:fs'
import {basename, dirname, join, relative, sep} from 'node:path'

const TEST_FILE = /\.test\.(?:ts|tsx|js)$/
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', '__screenshots__', 'fixtures', 'host'])
const EXAMPLE_APPS = /(^|[\\/])apps[\\/]examples[\\/]/
const DEFAULT_MAX = 2
const testFilesByPackage = new Map()

function hasPackageJson(directory) {
  return existsSync(join(directory, 'package.json'))
}

function packageDirectoryOf(filename) {
  const parent = dirname(filename)
  if (hasPackageJson(parent)) return parent
  if (parent === dirname(parent)) return undefined
  return packageDirectoryOf(parent)
}

function isWalkedDirectory(path, name) {
  return !IGNORED_DIRECTORIES.has(name) && !hasPackageJson(path)
}

function entryTestFiles(directory, entry) {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return isWalkedDirectory(path, entry.name) ? testFilesUnder(path) : []
  return TEST_FILE.test(entry.name) ? [path] : []
}

function testFilesUnder(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => entryTestFiles(directory, entry))
}

function packageTestFiles(packageDirectory) {
  const cached = testFilesByPackage.get(packageDirectory)
  if (cached !== undefined) return cached
  const files = testFilesUnder(packageDirectory).toSorted()
  testFilesByPackage.set(packageDirectory, files)
  return files
}

function isCountedTestFile(filename, packageDirectory) {
  if (!TEST_FILE.test(basename(filename)) || EXAMPLE_APPS.test(filename)) return false
  return relative(packageDirectory, filename)
    .split(sep)
    .slice(0, -1)
    .every((segment) => !IGNORED_DIRECTORIES.has(segment))
}

function maxOf(options) {
  const max = options[0]?.max
  return typeof max === 'number' ? max : DEFAULT_MAX
}

function displayDirectory(packageDirectory) {
  return relative(process.cwd(), packageDirectory) || basename(packageDirectory)
}

function countedPackageOf(filename) {
  const packageDirectory = packageDirectoryOf(filename)
  if (packageDirectory === undefined || !isCountedTestFile(filename, packageDirectory)) return undefined
  return packageDirectory
}

function checkProgram(node, context) {
  const filename = context.filename
  const packageDirectory = countedPackageOf(filename)
  if (packageDirectory === undefined) return
  const files = packageTestFiles(packageDirectory)
  const max = maxOf(context.options)
  if (files.length <= max || files[0] !== filename) return
  context.report({
    node,
    messageId: 'overBudget',
    data: {packageDirectory: displayDirectory(packageDirectory), count: files.length, max},
  })
}

export default {
  meta: {
    type: 'problem',
    messages: {
      overBudget:
        '{{packageDirectory}} has {{count}} test files, over its budget of {{max}}. A package keeps one node test file and one browser or e2e test file: fold new tests into the existing file as a describe instead of adding a file.',
    },
    schema: [
      {
        type: 'object',
        properties: {max: {type: 'integer', minimum: 1}},
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    return {
      Program(node) {
        checkProgram(node, context)
      },
    }
  },
}
