import {isIdentifier, walk} from './ast-walk.js'

const SOURCE_EXTENSION = /\.[jt]sx?$/
const TEST_SUFFIX = /\.(?:test|spec)\.[jt]sx?$/
const HELPER_FILE = /(^|[\\/])packages[\\/]vitest-config[\\/]src[\\/]/
const FS_SOURCES = new Set(['node:fs', 'node:fs/promises', 'fs', 'fs/promises'])
const OS_SOURCES = new Set(['node:os', 'os'])
const MKDTEMP_NAMES = new Set(['mkdtemp', 'mkdtempSync'])
const TMPDIR_NAMES = new Set(['tmpdir'])

function isTestFile(filename) {
  const segments = filename.split(/[\\/]/)
  const baseName = segments.at(-1) ?? ''
  if (TEST_SUFFIX.test(baseName)) return true
  return SOURCE_EXTENSION.test(baseName) && segments.slice(0, -1).includes('test')
}

function appliesToFile(filename) {
  return isTestFile(filename) && !HELPER_FILE.test(filename)
}

function resolveImport(identifier, sourceCode) {
  const reference = sourceCode.getScope(identifier).references.find((entry) => entry.identifier === identifier)
  const definition = reference?.resolved?.defs[0]
  if (definition?.type !== 'ImportBinding') return undefined
  const specifier = definition.node
  return {
    source: definition.parent.source.value,
    imported: specifier.type === 'ImportSpecifier' ? importedName(specifier.imported) : undefined,
  }
}

function importedName(imported) {
  return isIdentifier(imported) ? imported.name : imported.value
}

function isImportedFunction(identifier, sourceCode, sources, names) {
  const binding = resolveImport(identifier, sourceCode)
  return binding !== undefined && sources.has(binding.source) && names.has(binding.imported)
}

function isModuleObject(identifier, sourceCode, sources) {
  const binding = resolveImport(identifier, sourceCode)
  return binding !== undefined && sources.has(binding.source) && binding.imported === undefined
}

function hasNamedProperty(member, names) {
  return isIdentifier(member.object) && isIdentifier(member.property) && names.has(member.property.name)
}

function isNamedMember(callee, names) {
  return callee.type === 'MemberExpression' && !callee.computed && hasNamedProperty(callee, names)
}

function isModuleFunction(callee, sourceCode, sources, names) {
  if (isIdentifier(callee)) return isImportedFunction(callee, sourceCode, sources, names)
  return isNamedMember(callee, names) && isModuleObject(callee.object, sourceCode, sources)
}

function isTmpdirCall(node, sourceCode) {
  return node.type === 'CallExpression' && isModuleFunction(node.callee, sourceCode, OS_SOURCES, TMPDIR_NAMES)
}

function isBuiltOnTmpdir(argument, sourceCode) {
  let found = false
  walk(argument, (node) => {
    if (!isTmpdirCall(node, sourceCode)) return undefined
    found = true
    return 'skip'
  })
  return found
}

function reportHandMade(node, context) {
  if (node.type !== 'CallExpression') return
  const {sourceCode} = context
  if (!isModuleFunction(node.callee, sourceCode, FS_SOURCES, MKDTEMP_NAMES)) return
  if (!isBuiltOnTmpdir(node.arguments[0], sourceCode)) return
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
        walk(node, (child) => reportHandMade(child, context))
      },
    }
  },
}
