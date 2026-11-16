import {isIdentifier, walk} from './ast-walk.js'

const SOURCE_EXTENSION = /\.[jt]sx?$/
const TEST_SUFFIX = /\.(?:test|spec)\.[jt]sx?$/
const HELPER_FILE = /(^|[\\/])packages[\\/]vitest-config[\\/]src[\\/]/
const FS_SOURCES = new Set(['node:fs', 'node:fs/promises', 'fs', 'fs/promises'])
const OS_SOURCES = new Set(['node:os', 'os'])
const MKDTEMP_NAMES = new Set(['mkdtemp', 'mkdtempSync'])
const TMPDIR_NAMES = new Set(['tmpdir'])
const EXIT_LISTENERS = new Set(['on', 'once'])
const CONFIG_FILE = /^(?:vitest|playwright)(?:\.[\w-]+)?\.config\.[cm]?[jt]s$/

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

function isConfigFile(filename) {
  return CONFIG_FILE.test(filename.split(/[\\/]/).at(-1) ?? '')
}

function isUndeclared(identifier, sourceCode) {
  const reference = sourceCode.getScope(identifier).references.find((entry) => entry.identifier === identifier)
  return (reference?.resolved?.defs.length ?? 0) === 0
}

function isExitHook(node, sourceCode) {
  const {callee} = node
  if (!isNamedMember(callee, EXIT_LISTENERS) || callee.object.name !== 'process') return false
  if (!isUndeclared(callee.object, sourceCode)) return false
  const [event] = node.arguments
  return event?.type === 'Literal' && event.value === 'exit'
}

function reportHandMade(node, context, inTestFile) {
  if (node.type !== 'CallExpression') return
  const {sourceCode} = context
  if (isExitHook(node, sourceCode)) {
    context.report({node, messageId: 'exitHook'})
    return
  }
  if (!inTestFile) return
  if (!isModuleFunction(node.callee, sourceCode, FS_SOURCES, MKDTEMP_NAMES)) return
  if (!isBuiltOnTmpdir(node.arguments[0], sourceCode)) return
  context.report({node, messageId: 'handMadeTempDir'})
}

export default {
  meta: {
    type: 'problem',
    messages: {
      handMadeTempDir:
        'A test that makes its own folder under the OS temp dir leaks it when the test fails before removing it. Take it from tempDir(prefix) (@conciv/vitest-config/temp-dir: one folder per test file, removed after the file) or, in a vitest config or browser command, a folder under test-results/conciv-home beside the config (the CONCIV_HOME of the run, emptied at the start of every run by the globalSetup ciTest() carries).',
      exitHook:
        'A process exit hook is cleanup that a crashed or killed run can skip, and the folder it removes is usually under the OS temp dir. In a test take the folder from tempDir(prefix) (@conciv/vitest-config/temp-dir); in a vitest config or browser command put it under test-results/conciv-home beside the config, which the globalSetup ciTest() carries empties at the start of every run.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Program(node) {
        const inTestFile = appliesToFile(context.filename)
        if (!inTestFile && !isConfigFile(context.filename)) return
        walk(node, (child) => reportHandMade(child, context, inTestFile))
      },
    }
  },
}
