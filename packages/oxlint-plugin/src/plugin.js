import {isIdentifier} from './ast-walk.js'
import lucidePerIcon from './lucide-per-icon.js'
import noAwaitEffectQuery from './no-await-effect-query.js'
import noComments from './no-comments.js'
import noHandMadeTempDir from './no-hand-made-temp-dir.js'
import {isDomTestFile} from '@conciv/vitest-config/new-layer'
import noLocatorPoll from './no-locator-poll.js'
import noMocks from './no-mocks.js'
import noPredicateWaits from './no-predicate-waits.js'
import noSignalRef from './no-signal-ref.js'
import noTeardownHooks from './no-teardown-hooks.js'
import pluginViewReadsThroughQuery from './plugin-view-reads-through-query.js'
import routerIdioms from './router-idioms.js'
import testFileBudget from './test-file-budget.js'
import {noInlineTimeouts, noTimersInTests} from './test-time.js'
import {bannedVocabulary, corePurity, noOfSuffix} from './vocabulary.js'

const DELEGATED_FOCUS = new Set(['onfocusin', 'onfocusout'])

const KIT_FILE = /(^|[\\/])packages[\\/]ui-kit-chat[\\/]/
const KIT_INTERNAL_NAME = 'CollapsibleCard'
const KIT_SOURCE = /^@conciv\/ui-kit-chat(\/|$)/

const TEST_FILE = /(^|[\\/])test[\\/].*\.[jt]sx?$|\.(?:test|spec)\.[jt]sx?$/
const RENDER_EXEMPT_FILE = /[\\/]test[\\/]fixtures[\\/]host[\\/]main\.tsx$/
const SOLID_WEB_SOURCE = 'solid-js/web'
const SOLID_WEB_RENDER_NAMES = new Set(['render', 'hydrate'])

const TESTING_LIBRARY_SOURCES = new Set(['@solidjs/testing-library', '@testing-library/dom'])
const FIRE_EVENT_NAME = 'fireEvent'

function importedName(specifier) {
  if (specifier.type !== 'ImportSpecifier') return undefined
  if (!isIdentifier(specifier.imported)) return undefined
  return specifier.imported.name
}

function checkDelegatedFocus(node, context) {
  if (node.name.type !== 'JSXIdentifier') return
  if (!DELEGATED_FOCUS.has(node.name.name.toLowerCase())) return
  context.report({node, messageId: 'delegatedFocus', data: {name: node.name.name}})
}

function reportKitSpecifier(specifier, context) {
  if (importedName(specifier) !== KIT_INTERNAL_NAME) return
  context.report({node: specifier, messageId: 'collapsibleCardOutsideKit'})
}

function checkKitImport(node, context) {
  if (KIT_FILE.test(context.filename)) return
  if (!KIT_SOURCE.test(node.source.value)) return
  for (const specifier of node.specifiers) reportKitSpecifier(specifier, context)
}

function rendersInTestFile(filename) {
  return TEST_FILE.test(filename) && !RENDER_EXEMPT_FILE.test(filename)
}

function reportSolidWebSpecifier(specifier, context) {
  const name = importedName(specifier)
  if (name === undefined || !SOLID_WEB_RENDER_NAMES.has(name)) return
  context.report({node: specifier, messageId: 'solidWebRenderInTest', data: {name}})
}

function checkSolidWebImport(node, context) {
  if (!rendersInTestFile(context.filename)) return
  if (node.source.value !== SOLID_WEB_SOURCE) return
  for (const specifier of node.specifiers) reportSolidWebSpecifier(specifier, context)
}

function reportFireEventSpecifier(specifier, context) {
  if (importedName(specifier) !== FIRE_EVENT_NAME) return
  context.report({node: specifier, messageId: 'fireEvent'})
}

function checkTestingLibraryImport(node, context) {
  if (!isDomTestFile(context.filename)) return
  if (!TESTING_LIBRARY_SOURCES.has(node.source.value)) return
  for (const specifier of node.specifiers) reportFireEventSpecifier(specifier, context)
}

function isTestingLibraryModuleObject(identifier, sourceCode) {
  const reference = sourceCode.getScope(identifier).references.find((entry) => entry.identifier === identifier)
  const definition = reference?.resolved?.defs[0]
  if (definition?.type !== 'ImportBinding') return false
  if (definition.node.type === 'ImportSpecifier') return false
  return TESTING_LIBRARY_SOURCES.has(definition.parent.source.value)
}

function isFireEventProperty(property) {
  return isIdentifier(property) && property.name === FIRE_EVENT_NAME
}

function isFireEventRead(node) {
  return !node.computed && isIdentifier(node.object) && isFireEventProperty(node.property)
}

function checkFireEventMember(node, context) {
  if (!isDomTestFile(context.filename)) return
  if (!isFireEventRead(node)) return
  if (!isTestingLibraryModuleObject(node.object, context.sourceCode)) return
  context.report({node, messageId: 'fireEvent'})
}

const noDelegatedFocus = {
  meta: {
    type: 'problem',
    messages: {
      delegatedFocus:
        "'{{name}}' is delegated to the document by Solid, so it never runs when focus moves between two elements inside the widget's shadow root. Use on:focusin / on:focusout, or, for an Ark part, render it through nativeFocusPart (packages/ui-kit-system/src/native-focus.tsx).",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      JSXAttribute(node) {
        checkDelegatedFocus(node, context)
      },
    }
  },
}

const toolCardShell = {
  meta: {
    type: 'problem',
    messages: {
      collapsibleCardOutsideKit:
        "CollapsibleCard is internal to @conciv/ui-kit-chat's tools kit. Compose CardShell/ToolCard instead of importing CollapsibleCard directly.",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        checkKitImport(node, context)
      },
    }
  },
}

const solidTestRender = {
  meta: {
    type: 'problem',
    messages: {
      solidWebRenderInTest:
        "Test files mount Solid components with @solidjs/testing-library's render, not {{name}} from solid-js/web: the package's browser vitest project wires afterEach(cleanup) via @conciv/vitest-config's ciTestSolidBrowser() setupFiles, which is what removes hand-rolled disposer arrays and leaked roots.",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        checkSolidWebImport(node, context)
      },
    }
  },
}

const userEventOnly = {
  meta: {
    type: 'problem',
    messages: {
      fireEvent:
        'Act like a user: drive dom tests with userEvent.setup() from @testing-library/user-event (await user.click, user.type, user.keyboard), never fireEvent, which skips the pointer, focus and keyboard events a real user produces.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        checkTestingLibraryImport(node, context)
      },
      MemberExpression(node) {
        checkFireEventMember(node, context)
      },
    }
  },
}

export default {
  meta: {name: 'conciv'},
  rules: {
    'banned-vocabulary': bannedVocabulary,
    'core-purity': corePurity,
    'lucide-per-icon': lucidePerIcon,
    'no-await-effect-query': noAwaitEffectQuery,
    'no-comments': noComments,
    'no-delegated-focus': noDelegatedFocus,
    'no-hand-made-temp-dir': noHandMadeTempDir,
    'no-inline-timeouts': noInlineTimeouts,
    'no-locator-poll': noLocatorPoll,
    'no-mocks': noMocks,
    'no-of-suffix': noOfSuffix,
    'no-predicate-waits': noPredicateWaits,
    'no-signal-ref': noSignalRef,
    'no-teardown-hooks': noTeardownHooks,
    'no-timers-in-tests': noTimersInTests,
    'plugin-view-reads-through-query': pluginViewReadsThroughQuery,
    'router-idioms': routerIdioms,
    'solid-test-render': solidTestRender,
    'test-file-budget': testFileBudget,
    'tool-card-shell': toolCardShell,
    'user-event-only': userEventOnly,
  },
}
