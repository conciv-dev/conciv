import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {basename, dirname, join, relative, sep} from 'node:path'

const TEST_FILE = /\.test\.(?:ts|tsx|js)$/
const BROWSER_TEST_FILE = /\.browser\.test\.(?:ts|tsx|js)$/
const RUNNER_TAG = /\.(?:dom|perf)$/
const CODE_FILE = /(?<!\.d)\.(?:ts|tsx|js|jsx)$/
const SOURCE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx']
const AREA_BROWSER_FILE = /^src\/[a-z0-9-]+\.browser\.test\.tsx$/
const AREA_PACKAGE = '@conciv/app'
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

function readPackageName(packageDirectory) {
  const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'))
  return typeof manifest.name === 'string' ? manifest.name : ''
}

function readPackageFiles(packageDirectory) {
  const files = codeFilesUnder(packageDirectory).toSorted()
  const tests = files.filter((file) => TEST_FILE.test(basename(file)))
  return {
    name: readPackageName(packageDirectory),
    tests,
    browserTests: tests.filter((file) => BROWSER_TEST_FILE.test(basename(file))),
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

function packagePath(packageDirectory, filename) {
  return relative(packageDirectory, filename).split(sep).join('/')
}

function findCountedPackage(filename) {
  const packageDirectory = findPackageDirectory(filename)
  if (packageDirectory === undefined || !isCountedTestFile(filename, packageDirectory)) return undefined
  return packageDirectory
}

function testedSourceName(filename) {
  return basename(filename).replace(TEST_FILE, '').replace(RUNNER_TAG, '')
}

function hasSourceBeside(filename) {
  const source = testedSourceName(filename)
  return SOURCE_EXTENSIONS.some((extension) => existsSync(join(dirname(filename), `${source}.${extension}`)))
}

function checkSourceBeside(node, context) {
  if (hasSourceBeside(context.filename)) return
  context.report({node, messageId: 'noSourceBeside', data: {source: testedSourceName(context.filename)}})
}

function checkAreaBrowserFile(node, context, packageDirectory) {
  const file = packagePath(packageDirectory, context.filename)
  if (AREA_BROWSER_FILE.test(file)) return
  context.report({node, messageId: 'outsideArea', data: {file}})
}

function checkPackageBrowserFile(node, context, packageDirectory) {
  const [first] = packageFiles(packageDirectory).browserTests
  if (first === undefined || first === context.filename) return
  context.report({
    node,
    messageId: 'secondBrowserFile',
    data: {packageDirectory: displayDirectory(packageDirectory), first: packagePath(packageDirectory, first)},
  })
}

function checkBrowserFile(node, context, packageDirectory) {
  if (packageFiles(packageDirectory).name === AREA_PACKAGE) {
    checkAreaBrowserFile(node, context, packageDirectory)
    return
  }
  checkPackageBrowserFile(node, context, packageDirectory)
}

function checkOverSources(node, context, packageDirectory) {
  const {tests, sources} = packageFiles(packageDirectory)
  if (tests.length <= sources.length || tests[0] !== context.filename) return
  context.report({
    node,
    messageId: 'overSources',
    data: {packageDirectory: displayDirectory(packageDirectory), count: tests.length, sources: sources.length},
  })
}

function checkProgram(node, context) {
  const packageDirectory = findCountedPackage(context.filename)
  if (packageDirectory === undefined) return
  checkOverSources(node, context, packageDirectory)
  if (BROWSER_TEST_FILE.test(basename(context.filename))) {
    checkBrowserFile(node, context, packageDirectory)
    return
  }
  checkSourceBeside(node, context)
}

export default {
  meta: {
    type: 'problem',
    messages: {
      overSources:
        '{{packageDirectory}} has {{count}} test files and {{sources}} source files under src/. A package never has more test files than source files: fold new tests into the test file of the source they test.',
      secondBrowserFile:
        '{{packageDirectory}} already has its browser-mode test file, {{first}}. A package has one browser-mode test file: add a describe to it, never a second file.',
      outsideArea:
        '{{file}} is a browser-mode test file outside src/<area>.browser.test.tsx. apps/conciv has one browser-mode file per product area, named src/<area>.browser.test.tsx: move these cases into their area file.',
      noSourceBeside:
        'This test has no {{source}}.ts, {{source}}.tsx, {{source}}.js or {{source}}.jsx beside it. A node or happy-dom test lives beside the source it tests: src/x.test.ts beside src/x.ts, src/x.dom.test.tsx beside src/x.tsx.',
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
