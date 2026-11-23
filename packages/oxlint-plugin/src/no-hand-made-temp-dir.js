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
const SOURCE_PLACES = [
  [E2E_FILE, 'e2e'],
  [TESTKIT_SOURCE, 'testkit'],
]
const ENV_NAMES = new Set(['env'])
const TMPDIR_ENV_NAMES = new Set(['TMPDIR'])
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
  const place = SOURCE_PLACES.find(([pattern]) => pattern.test(filename))
  if (place !== undefined) return place[1]
  return isTestFile(filename) ? 'test' : undefined
}

function resolveDefinition(identifier, sourceCode) {
  const reference = sourceCode.getScope(identifier).references.find((entry) => entry.identifier === identifier)
  return reference?.resolved?.defs[0]
}

function resolveImport(identifier, sourceCode) {
  const definition = resolveDefinition(identifier, sourceCode)
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

function isNamedProperty(member, names) {
  return (
    member.type === 'MemberExpression' &&
    !member.computed &&
    isIdentifier(member.property) &&
    names.has(member.property.name)
  )
}

function isNamedMember(callee, names) {
  return isNamedProperty(callee, names) && isIdentifier(callee.object)
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
    isNamedProperty(node, TMPDIR_ENV_NAMES) &&
    isNamedMember(node.object, ENV_NAMES) &&
    isGlobalProcess(node.object.object, sourceCode)
  )
}

function readStaticPrefix(node) {
  if (node.type === 'TemplateLiteral') return String(node.quasis[0].value.cooked)
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  return ''
}

function isSystemTempText(node) {
  return SYSTEM_TEMP.test(readStaticPrefix(node))
}

function isTempRoot(node, sourceCode) {
  return isTmpdirCall(node, sourceCode) || isTmpdirEnv(node, sourceCode) || isSystemTempText(node)
}

function containsNode(root, matches) {
  let found = false
  walk(root, (node) => {
    if (!matches(node)) return undefined
    found = true
    return 'skip'
  })
  return found
}

function isConstDefinition(definition) {
  return definition?.type === 'Variable' && definition.parent.kind === 'const' && Boolean(definition.node.init)
}

function unwrapAwait(node) {
  return node.type === 'AwaitExpression' ? node.argument : node
}

function isMadeFolder(initializer, sourceCode) {
  const call = unwrapAwait(initializer)
  return call.type === 'CallExpression' && createdPathArgument(call, sourceCode) !== undefined
}

function constInitializer(identifier, sourceCode) {
  const definition = resolveDefinition(identifier, sourceCode)
  if (!isConstDefinition(definition)) return undefined
  return isMadeFolder(definition.node.init, sourceCode) ? undefined : definition.node.init
}

function isConstOnTempRoot(node, sourceCode) {
  if (!isIdentifier(node)) return false
  const initializer = constInitializer(node, sourceCode)
  return containsNode(initializer, (child) => isTempRoot(child, sourceCode))
}

function isBuiltOnTmpdir(argument, sourceCode) {
  return containsNode(argument, (node) => isTempRoot(node, sourceCode) || isConstOnTempRoot(node, sourceCode))
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
        'An e2e helper or spec that makes a folder or file under the OS temp dir leaves it behind when the run ends. Put it under the app run state folder e2e/.conciv-e2e/<app> (e2eDevEndpointDir in @conciv/e2e-utils/state-dir shows the path), which the e2e web server empties at start and the shared state cleanup reporter removes when the run ends; a folder that must stay outside the repo goes in the runFolders the same reporter removes.',
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
