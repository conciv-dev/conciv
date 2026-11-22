import {existsSync, readdirSync} from 'node:fs'
import {basename, dirname, join, relative, sep} from 'node:path'

const TEST_FILE = /\.test\.(?:ts|tsx|js)$/
const CODE_FILE = /(?<!\.d)\.(?:ts|tsx|js|jsx)$/
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', '__screenshots__', 'fixtures', 'host'])
const EXAMPLE_APPS = /(^|[\\/])apps[\\/]examples[\\/]/
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

function isSourceFile(filename, packageDirectory) {
  return relative(packageDirectory, filename).split(sep)[0] === 'src' && !TEST_FILE.test(basename(filename))
}

function readPackageFiles(packageDirectory) {
  const files = codeFilesUnder(packageDirectory).toSorted()
  return {
    tests: files.filter((file) => TEST_FILE.test(basename(file))),
    sources: files.filter((file) => isSourceFile(file, packageDirectory)),
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

function displayDirectory(packageDirectory) {
  return relative(process.cwd(), packageDirectory) || basename(packageDirectory)
}

function findCountedPackage(filename) {
  const packageDirectory = findPackageDirectory(filename)
  if (packageDirectory === undefined || !isCountedTestFile(filename, packageDirectory)) return undefined
  return packageDirectory
}

function checkProgram(node, context) {
  const packageDirectory = findCountedPackage(context.filename)
  if (packageDirectory === undefined) return
  const {tests, sources} = packageFiles(packageDirectory)
  if (tests.length <= sources.length || tests[0] !== context.filename) return
  context.report({
    node,
    messageId: 'overSources',
    data: {packageDirectory: displayDirectory(packageDirectory), count: tests.length, sources: sources.length},
  })
}

export default {
  meta: {
    type: 'problem',
    messages: {
      overSources:
        '{{packageDirectory}} has {{count}} test files and {{sources}} source files under src/. A package never has more test files than source files: a node, happy-dom or browser test lives next to the source it tests, and new tests fold into that test file.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        checkProgram(node, context)
      },
    }
  },
}
