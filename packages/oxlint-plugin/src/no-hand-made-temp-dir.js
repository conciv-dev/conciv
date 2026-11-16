import {isIdentifier, walk} from './ast-walk.js'

const SOURCE_EXTENSION = /\.[jt]sx?$/
const TEST_SUFFIX = /\.(?:test|spec)\.[jt]sx?$/
const HELPER_FILE = /(^|[\\/])packages[\\/]vitest-config[\\/]src[\\/]/
const FS_SOURCES = new Set(['node:fs', 'node:fs/promises', 'fs', 'fs/promises'])
const OS_SOURCES = new Set(['node:os', 'os'])
const E2E_FILE = /(^|[\\/])e2e[\\/]/
const TESTKIT_SOURCE = /(^|[\\/])packages[\\/][^\\/]+-testkit[\\/]src[\\/]/
const CREATED_PATH_ARGUMENT = new Map([
  ['mkdtemp', 0],
  ['mkdtempSync', 0],
  ['mkdir', 0],
  ['mkdirSync', 0],
  ['writeFile', 0],
  ['writeFileSync', 0],
  ['appendFile', 0],
  ['appendFileSync', 0],
  ['cp', 1],
  ['cpSync', 1],
  ['copyFile', 1],
  ['copyFileSync', 1],
  ['symlink', 1],
  ['symlinkSync', 1],
])
const CREATING_NAMES = new Set(CREATED_PATH_ARGUMENT.keys())
const ENV_NAMES = new Set(['env'])
const SYSTEM_TEMP = /^\/tmp(?:\/|$)/
const TMPDIR_NAMES = new Set(['tmpdir'])
const EXIT_LISTENERS = new Set(['on', 'once'])
const CONFIG_FILE = /^(?:vitest|playwright)(?:\.[\w-]+)?\.config\.[cm]?[jt]s$/

function isTestFile(filename) {
  const segments = filename.split(/[\\/]/)
  const baseName = segments.at(-1) ?? ''
  if (TEST_SUFFIX.test(baseName)) return true
  return SOURCE_EXTENSION.test(baseName) && segments.slice(0, -1).includes('test')
}

function findFilePlace(filename) {
  if (HELPER_FILE.test(filename)) return undefined
  if (E2E_FILE.test(filename)) return 'e2e'
  if (TESTKIT_SOURCE.test(filename)) return 'testkit'
  if (isTestFile(filename)) return 'test'
  return undefined
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

function isTmpdirEnv(node, sourceCode) {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    isIdentifier(node.property) &&
    node.property.name === 'TMPDIR' &&
    isNamedMember(node.object, ENV_NAMES) &&
    isGlobalProcess(node.object.object, sourceCode)
  )
}

function isSystemTempText(node) {
  if (node.type === 'Literal') return typeof node.value === 'string' && SYSTEM_TEMP.test(node.value)
  return node.type === 'TemplateLiteral' && SYSTEM_TEMP.test(node.quasis[0]?.value.cooked ?? '')
}

function isTempRoot(node, sourceCode) {
  return isTmpdirCall(node, sourceCode) || isTmpdirEnv(node, sourceCode) || isSystemTempText(node)
}

function containsTempRoot(argument, sourceCode) {
  let found = false
  walk(argument, (node) => {
    if (!isTempRoot(node, sourceCode)) return undefined
    found = true
    return 'skip'
  })
  return found
}

function constInitializer(identifier, sourceCode) {
  const reference = sourceCode.getScope(identifier).references.find((entry) => entry.identifier === identifier)
  const definition = reference?.resolved?.defs[0]
  if (definition?.type !== 'Variable' || definition.parent.kind !== 'const') return undefined
  const initializer = definition.node.init ?? undefined
  if (isMadeFolder(initializer, sourceCode)) return undefined
  return initializer
}

function isMadeFolder(initializer, sourceCode) {
  const call = initializer?.type === 'AwaitExpression' ? initializer.argument : initializer
  return call?.type === 'CallExpression' && createdPathArgument(call, sourceCode) !== undefined
}

function isBuiltOnTmpdir(argument, sourceCode) {
  let found = false
  walk(argument, (node) => {
    const initializer = isIdentifier(node) ? constInitializer(node, sourceCode) : undefined
    if (!isTempRoot(node, sourceCode) && !containsTempRoot(initializer, sourceCode)) return undefined
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

function isGlobalProcess(object, sourceCode) {
  return object.name === 'process' && isUndeclared(object, sourceCode)
}

function isExitEvent(argument) {
  return argument?.type === 'Literal' && argument.value === 'exit'
}

function isExitHook(node, sourceCode) {
  const {callee} = node
  return (
    isNamedMember(callee, EXIT_LISTENERS) &&
    isGlobalProcess(callee.object, sourceCode) &&
    isExitEvent(node.arguments[0])
  )
}

function fsFunctionName(callee, sourceCode) {
  return isIdentifier(callee) ? resolveImport(callee, sourceCode)?.imported : callee.property.name
}

function createdPathArgument(node, sourceCode) {
  if (!isModuleFunction(node.callee, sourceCode, FS_SOURCES, CREATING_NAMES)) return undefined
  return node.arguments[CREATED_PATH_ARGUMENT.get(fsFunctionName(node.callee, sourceCode)) ?? 0]
}

function isHandMadeTempDir(node, sourceCode) {
  const argument = createdPathArgument(node, sourceCode)
  return argument !== undefined && isBuiltOnTmpdir(argument, sourceCode)
}

const TEMP_MESSAGE = {test: 'handMadeTempDir', e2e: 'e2eTempDir', testkit: 'testkitTempDir'}

function findingFor(node, sourceCode, place) {
  if (isExitHook(node, sourceCode)) return 'exitHook'
  if (place !== undefined && isHandMadeTempDir(node, sourceCode)) return TEMP_MESSAGE[place]
  return undefined
}

function reportHandMade(node, context, place) {
  if (node.type !== 'CallExpression') return
  const messageId = findingFor(node, context.sourceCode, place)
  if (messageId !== undefined) context.report({node, messageId})
}

export default {
  meta: {
    type: 'problem',
    messages: {
      e2eTempDir:
        'An e2e helper or spec that makes a folder or file under the OS temp dir leaves it behind when the run ends. Put it under the app run state folder e2e/.conciv-e2e/<app> (e2eDevEndpointDir in @conciv/e2e-utils/dev-endpoint shows the path), which the e2e web server empties at start and the shared state cleanup reporter removes when the run ends; a folder that must stay outside the repo goes in the runFolders the same reporter removes.',
      testkitTempDir:
        'A testkit that makes its own folder or file under the OS temp dir leaks it when setup throws or the caller never cleans up. Take a folder the caller owns and removes: pass it in.',
      handMadeTempDir:
        'A test that makes its own folder under the OS temp dir leaks it when the test fails before removing it. Take it from tempDir(prefix) (@conciv/vitest-config/temp-dir: one folder per test file, removed after the file) or, in a vitest config or browser command, a folder under test-results/conciv-home beside the config (the CONCIV_HOME of the run, emptied at the start and removed at the end of every run by the globalSetup ciTest() carries).',
      exitHook:
        'A process exit hook is cleanup that a crashed or killed run can skip, and the folder it removes is usually under the OS temp dir. In a test take the folder from tempDir(prefix) (@conciv/vitest-config/temp-dir); in a vitest config or browser command put it under test-results/conciv-home beside the config, which the globalSetup ciTest() carries empties at the start and removes at the end of every run.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Program(node) {
        const place = findFilePlace(context.filename)
        if (place === undefined && !isConfigFile(context.filename)) return
        walk(node, (child) => reportHandMade(child, context, place))
      },
    }
  },
}
