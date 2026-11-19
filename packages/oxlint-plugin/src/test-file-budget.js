import {existsSync, readdirSync} from 'node:fs'
import {basename, dirname, join, relative, sep} from 'node:path'

const TEST_FILE = /\.test\.(?:ts|tsx|js)$/
const CODE_FILE = /(?<!\.d)\.(?:ts|tsx|js|jsx)$/
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', '__screenshots__', 'fixtures', 'host'])
const EXAMPLE_APPS = /(^|[\\/])apps[\\/]examples[\\/]/
const DEFAULT_MAX = 2
const filesByPackage = new Map()

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
  return !IGNORED_DIRECTORIES.has(name) && !hasPackageJson(path)
}

function entryCodeFiles(directory, entry) {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return isWalkedDirectory(path, entry.name) ? codeFilesUnder(path) : []
  return CODE_FILE.test(entry.name) ? [path] : []
}

function codeFilesUnder(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => entryCodeFiles(directory, entry))
}

function isColocated(filename, packageDirectory) {
  return relative(packageDirectory, filename).split(sep)[0] === 'src'
}

function readPackageFiles(packageDirectory) {
  const files = codeFilesUnder(packageDirectory).toSorted()
  const tests = files.filter((file) => TEST_FILE.test(basename(file)))
  return {
    budgeted: tests.filter((file) => !isColocated(file, packageDirectory)),
    colocated: tests.filter((file) => isColocated(file, packageDirectory)),
    sources: files.filter((file) => !TEST_FILE.test(basename(file)) && isColocated(file, packageDirectory)),
  }
}

function packageFiles(packageDirectory) {
  const cached = filesByPackage.get(packageDirectory)
  if (cached !== undefined) return cached
  const files = readPackageFiles(packageDirectory)
  filesByPackage.set(packageDirectory, files)
  return files
}

function isCountedTestFile(filename, packageDirectory) {
  if (!TEST_FILE.test(basename(filename)) || EXAMPLE_APPS.test(filename)) return false
  return relative(packageDirectory, filename)
    .split(sep)
    .slice(0, -1)
    .every((segment) => !IGNORED_DIRECTORIES.has(segment))
}

function readMax(options) {
  const max = options[0]?.max
  return typeof max === 'number' ? max : DEFAULT_MAX
}

function displayDirectory(packageDirectory) {
  return relative(process.cwd(), packageDirectory) || basename(packageDirectory)
}

function findCountedPackage(filename) {
  const packageDirectory = findPackageDirectory(filename)
  if (packageDirectory === undefined || !isCountedTestFile(filename, packageDirectory)) return undefined
  return packageDirectory
}

function checkColocated(node, context, packageDirectory) {
  const {colocated, sources} = packageFiles(packageDirectory)
  if (colocated.length <= sources.length || colocated[0] !== context.filename) return
  context.report({
    node,
    messageId: 'overSources',
    data: {packageDirectory: displayDirectory(packageDirectory), count: colocated.length, sources: sources.length},
  })
}

function checkBudgeted(node, context, packageDirectory) {
  const {budgeted} = packageFiles(packageDirectory)
  const max = readMax(context.options)
  if (budgeted.length <= max || budgeted[0] !== context.filename) return
  context.report({
    node,
    messageId: 'overBudget',
    data: {packageDirectory: displayDirectory(packageDirectory), count: budgeted.length, max},
  })
}

function checkProgram(node, context) {
  const packageDirectory = findCountedPackage(context.filename)
  if (packageDirectory === undefined) return
  if (isColocated(context.filename, packageDirectory)) {
    checkColocated(node, context, packageDirectory)
    return
  }
  checkBudgeted(node, context, packageDirectory)
}

export default {
  meta: {
    type: 'problem',
    messages: {
      overBudget:
        '{{packageDirectory}} has {{count}} test files, over its budget of {{max}}. A package keeps one node test file and one browser or e2e test file under test/: fold new tests into the existing file as a describe, or put a node, unit or happy-dom test next to the source it tests under src/.',
      overSources:
        '{{packageDirectory}} has {{count}} test files next to its {{sources}} source files under src/. A package never has more colocated test files than source files: fold the new tests into the test file of the source they test.',
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
