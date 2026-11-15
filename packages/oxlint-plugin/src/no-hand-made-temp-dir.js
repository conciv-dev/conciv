import {isIdentifier, isNode, walk} from './ast-walk.js'

const TEST_FILE = /(^|[\\/])test[\\/].*\.[jt]sx?$|\.(?:test|spec)\.[jt]sx?$/
const HELPER_FILE = /(^|[\\/])packages[\\/]vitest-config[\\/]src[\\/]/
const FS_SOURCES = new Set(['node:fs', 'node:fs/promises', 'fs', 'fs/promises'])
const MKDTEMP_NAMES = new Set(['mkdtemp', 'mkdtempSync'])

function appliesToFile(filename) {
  return TEST_FILE.test(filename) && !HELPER_FILE.test(filename)
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

function isMkdtempCallee(callee, bindings) {
  if (isIdentifier(callee)) return bindings.functions.has(callee.name)
  if (callee.type !== 'MemberExpression' || callee.computed) return false
  if (!isIdentifier(callee.object) || !isIdentifier(callee.property)) return false
  return bindings.modules.has(callee.object.name) && MKDTEMP_NAMES.has(callee.property.name)
}

function isTmpdirCall(node) {
  if (node.type !== 'CallExpression') return false
  if (isIdentifier(node.callee)) return node.callee.name === 'tmpdir'
  return (
    node.callee.type === 'MemberExpression' &&
    isIdentifier(node.callee.property) &&
    node.callee.property.name === 'tmpdir'
  )
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
  if (node.type !== 'CallExpression' || !isMkdtempCallee(node.callee, bindings)) return
  const [target] = node.arguments
  if (!isNode(target) || !isBuiltOnTmpdir(target)) return
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
