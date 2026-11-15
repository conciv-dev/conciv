import {isIdentifier, walk} from './ast-walk.js'

const SOURCE_EXTENSION = /\.[jt]sx?$/
const TEST_SUFFIX = /\.(?:test|spec)\.[jt]sx?$/
const HELPER_FILE = /(^|[\\/])packages[\\/]vitest-config[\\/]src[\\/]/
const FS_SOURCES = new Set(['node:fs', 'node:fs/promises', 'fs', 'fs/promises'])
const MKDTEMP_NAMES = new Set(['mkdtemp', 'mkdtempSync'])

function isTestFile(filename) {
  const segments = filename.split(/[\\/]/)
  const baseName = segments.at(-1) ?? ''
  if (TEST_SUFFIX.test(baseName)) return true
  return SOURCE_EXTENSION.test(baseName) && segments.slice(0, -1).includes('test')
}

function appliesToFile(filename) {
  return isTestFile(filename) && !HELPER_FILE.test(filename)
}

function bindingsFrom(program) {
  const declarations = program.body.filter(
    (statement) => statement.type === 'ImportDeclaration' && FS_SOURCES.has(statement.source.value),
  )
  const specifiers = declarations.flatMap((declaration) => declaration.specifiers)
  const named = specifiers.filter(
    (specifier) =>
      specifier.type === 'ImportSpecifier' &&
      isIdentifier(specifier.imported) &&
      MKDTEMP_NAMES.has(specifier.imported.name),
  )
  const modules = specifiers.filter((specifier) => specifier.type !== 'ImportSpecifier')
  return {
    functions: new Set(named.map((specifier) => specifier.local.name)),
    modules: new Set(modules.map((specifier) => specifier.local.name)),
  }
}

function calledName(callee) {
  if (isIdentifier(callee)) return callee.name
  if (callee.type !== 'MemberExpression' || !isIdentifier(callee.property)) return undefined
  return callee.property.name
}

function memberObjectName(callee) {
  if (callee.type !== 'MemberExpression' || !isIdentifier(callee.object)) return undefined
  return callee.object.name
}

function isMkdtempCallee(callee, bindings) {
  if (isIdentifier(callee)) return bindings.functions.has(callee.name)
  return bindings.modules.has(memberObjectName(callee)) && MKDTEMP_NAMES.has(calledName(callee))
}

function isTmpdirCall(node) {
  return node.type === 'CallExpression' && calledName(node.callee) === 'tmpdir'
}

function isBuiltOnTmpdir(argument) {
  let found = false
  walk(argument, (node) => {
    if (!isTmpdirCall(node)) return undefined
    found = true
    return 'skip'
  })
  return found
}

function reportHandMade(node, bindings, context) {
  if (node.type !== 'CallExpression') return
  if (!isMkdtempCallee(node.callee, bindings) || !isBuiltOnTmpdir(node.arguments[0])) return
  context.report({node, messageId: 'handMadeTempDir'})
}

export default {
  meta: {
    type: 'problem',
    messages: {
      handMadeTempDir:
        'A test that makes its own folder under the OS temp dir leaks it when the test fails before removing it. Take it from tempDir(prefix) (@conciv/vitest-config/temp-dir: one folder per test file, removed after the file) or, in a vitest config or browser command, processTempDir(prefix) (@conciv/vitest-config: removed when the process exits).',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Program(node) {
        if (!appliesToFile(context.filename)) return
        const bindings = bindingsFrom(node)
        walk(node, (child) => reportHandMade(child, bindings, context))
      },
    }
  },
}
