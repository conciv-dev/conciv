import {isIdentifier} from './ast-walk.js'
import lucidePerIcon from './lucide-per-icon.js'
import noAwaitEffectQuery from './no-await-effect-query.js'
import noComments from './no-comments.js'
import noForcedClick from './no-forced-click.js'
import noHandMadeTempDir from './no-hand-made-temp-dir.js'
import noInnerHtml from './no-inner-html.js'
import {isDomTestFile} from '@internal/vitest-config/test-layout'
import noLocatorPoll from './no-locator-poll.js'
import maxTestTimeout from './max-test-timeout.js'
import noMocks from './no-mocks.js'
import noModuleState from './no-module-state.js'
import noPredicateWaits from './no-predicate-waits.js'
import noQueryExistenceAssert from './no-query-existence-assert.js'
import noSignalRef from './no-signal-ref.js'
import noSuppressHydrationWarning from './no-suppress-hydration-warning.js'
import noTeardownHooks from './no-teardown-hooks.js'
import playwrightTestInE2e from './playwright-test-in-e2e.js'
import pluginViewReadsThroughQuery from './plugin-view-reads-through-query.js'
import routerIdioms from './router-idioms.js'
import testFileBudget from './test-file-budget.js'
import testFileTopLevel from './test-file-top-level.js'
import {noInlineTimeouts, noTimersInTests} from './test-time.js'
import {bannedVocabulary, corePurity, noOfSuffix} from './vocabulary.js'

const DELEGATED_FOCUS = ['onfocusin', 'onfocusout']

const KIT_FILE = /(^|[\\/])packages[\\/]ui-kit-chat[\\/]/
const KIT_INTERNAL_NAME = 'CollapsibleCard'
const KIT_SOURCE = /^@conciv\/ui-kit-chat(\/|$)/

const SCRIPT_FILE = /\.[jt]sx?$/
const TEST_SUFFIX = /\.(?:test|spec)\.[jt]sx?$/
const TEST_DIRECTORY = /(?:^|[\\/])test[\\/]/
const LINE_TERMINATORS = ['\n', '\r', '\u2028', '\u2029']
const RENDER_EXEMPT_FILE = /[\\/]test[\\/]fixtures[\\/]host[\\/]main\.tsx$/
const SOLID_WEB_SOURCE = 'solid-js/web'
const SOLID_WEB_RENDER_NAMES = ['render', 'hydrate']

const TESTING_LIBRARY_SOURCES = ['@solidjs/testing-library', '@testing-library/dom']
const FIRE_EVENT_NAME = 'fireEvent'
const KEY_DOWN_NAME = 'keyDown'
const COMPOSING_NAME = 'isComposing'

function importedName(specifier) {
  if (specifier.type !== 'ImportSpecifier') return undefined
  if (!isIdentifier(specifier.imported)) return undefined
  return specifier.imported.name
}

function checkDelegatedFocus(node, context) {
  if (node.name.type !== 'JSXIdentifier') return
  if (!DELEGATED_FOCUS.includes(node.name.name.toLowerCase())) return
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

function readLastLine(filename) {
  return filename.slice(Math.max(0, ...LINE_TERMINATORS.map((terminator) => filename.lastIndexOf(terminator))))
}

function isTestFile(filename) {
  return TEST_SUFFIX.test(filename) || (SCRIPT_FILE.test(filename) && TEST_DIRECTORY.test(readLastLine(filename)))
}

function rendersInTestFile(filename) {
  return isTestFile(filename) && !RENDER_EXEMPT_FILE.test(filename)
}

function reportSolidWebSpecifier(specifier, context) {
  const name = importedName(specifier)
  if (name === undefined || !SOLID_WEB_RENDER_NAMES.includes(name)) return
  context.report({node: specifier, messageId: 'solidWebRenderInTest', data: {name}})
}

function checkSolidWebImport(node, context) {
  if (!rendersInTestFile(context.filename)) return
  if (node.source.value !== SOLID_WEB_SOURCE) return
  for (const specifier of node.specifiers) reportSolidWebSpecifier(specifier, context)
}

function isNamed(node, name) {
  return isIdentifier(node) && node.name === name
}

function isPropertyRead(node, name) {
  return node.type === 'MemberExpression' && !node.computed && isNamed(node.property, name)
}

function isLiteralTrue(node) {
  return node.type === 'Literal' && node.value === true
}

function isComposingTrue(property) {
  return (
    property.type === 'Property' &&
    !property.computed &&
    isNamed(property.key, COMPOSING_NAME) &&
    isLiteralTrue(property.value)
  )
}

function hasComposingInit(call) {
  const init = call.arguments[1]
  return init?.type === 'ObjectExpression' && init.properties.some(isComposingTrue)
}

function isCallOn(node, callee) {
  return node.type === 'CallExpression' && node.callee === callee
}

function isComposingKeyDown(fireEventNode) {
  const member = fireEventNode.parent
  if (!isPropertyRead(member, KEY_DOWN_NAME) || member.object !== fireEventNode) return false
  return isCallOn(member.parent, member) && hasComposingInit(member.parent)
}

function readFireEventReferences(specifier, context) {
  if (specifier.local.name !== FIRE_EVENT_NAME) return []
  return context.sourceCode.getDeclaredVariables(specifier).flatMap((variable) => variable.references)
}

function reportFireEventReference(reference, context) {
  if (isComposingKeyDown(reference.identifier)) return
  context.report({node: reference.identifier, messageId: 'fireEvent'})
}

function reportFireEventSpecifier(specifier, context) {
  if (importedName(specifier) !== FIRE_EVENT_NAME) return
  const references = readFireEventReferences(specifier, context)
  if (references.length === 0) context.report({node: specifier, messageId: 'fireEvent'})
  for (const reference of references) reportFireEventReference(reference, context)
}

function checkTestingLibraryImport(node, context) {
  if (!isDomTestFile(context.filename)) return
  if (!TESTING_LIBRARY_SOURCES.includes(node.source.value)) return
  for (const specifier of node.specifiers) reportFireEventSpecifier(specifier, context)
}

function isTestingLibraryModuleObject(identifier, sourceCode) {
  const reference = sourceCode.getScope(identifier).references.find((entry) => entry.identifier === identifier)
  const definition = reference?.resolved?.defs[0]
  if (definition?.type !== 'ImportBinding') return false
  if (definition.node.type === 'ImportSpecifier') return false
  return TESTING_LIBRARY_SOURCES.includes(definition.parent.source.value)
}

function isTestingLibraryFireEvent(node, sourceCode) {
  return (
    isPropertyRead(node, FIRE_EVENT_NAME) &&
    isIdentifier(node.object) &&
    isTestingLibraryModuleObject(node.object, sourceCode)
  )
}

function checkFireEventMember(node, context) {
  if (!isDomTestFile(context.filename)) return
  if (!isTestingLibraryFireEvent(node, context.sourceCode)) return
  if (isComposingKeyDown(node)) return
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
        "Test files mount Solid components with @solidjs/testing-library's render, not {{name}} from solid-js/web: the unit project of concivTest() and the kit's browser project run its cleanup after each test, which is what removes hand-rolled disposer arrays and leaked roots.",
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
        'Act like a user: drive unit dom tests with userEvent.setup() from @testing-library/user-event (await user.click, user.type, user.keyboard), never fireEvent, which skips the pointer, focus and keyboard events a real user produces. The one exception is fireEvent.keyDown(target, {isComposing: true}) for an IME guard, which user-event cannot produce.',
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
    'max-test-timeout': maxTestTimeout,
    'playwright-test-in-e2e': playwrightTestInE2e,
    'no-await-effect-query': noAwaitEffectQuery,
    'no-comments': noComments,
    'no-delegated-focus': noDelegatedFocus,
    'no-forced-click': noForcedClick,
    'no-hand-made-temp-dir': noHandMadeTempDir,
    'no-inline-timeouts': noInlineTimeouts,
    'no-inner-html': noInnerHtml,
    'no-locator-poll': noLocatorPoll,
    'no-mocks': noMocks,
    'no-module-state': noModuleState,
    'no-of-suffix': noOfSuffix,
    'no-predicate-waits': noPredicateWaits,
    'no-query-existence-assert': noQueryExistenceAssert,
    'no-signal-ref': noSignalRef,
    'no-suppress-hydration-warning': noSuppressHydrationWarning,
    'no-teardown-hooks': noTeardownHooks,
    'no-timers-in-tests': noTimersInTests,
    'plugin-view-reads-through-query': pluginViewReadsThroughQuery,
    'router-idioms': routerIdioms,
    'solid-test-render': solidTestRender,
    'test-file-budget': testFileBudget,
    'test-file-top-level': testFileTopLevel,
    'tool-card-shell': toolCardShell,
    'user-event-only': userEventOnly,
  },
}
