import {isIdentifier} from './ast-walk.js'
import lucidePerIcon from './lucide-per-icon.js'
import noAwaitEffectQuery from './no-await-effect-query.js'
import noComments from './no-comments.js'
import noHandMadeTempDir from './no-hand-made-temp-dir.js'
import noLocatorPoll from './no-locator-poll.js'
import noPredicateWaits from './no-predicate-waits.js'
import noSignalRef from './no-signal-ref.js'
import pluginViewReadsThroughQuery from './plugin-view-reads-through-query.js'
import routerIdioms from './router-idioms.js'
import testFileBudget from './test-file-budget.js'
import {bannedVocabulary, corePurity, noOfSuffix} from './vocabulary.js'

const DELEGATED_FOCUS = new Set(['onfocusin', 'onfocusout'])

const TIMER_NAMES = new Set(['setTimeout', 'setInterval', 'setImmediate'])

const KIT_FILE = /(^|[\\/])packages[\\/]ui-kit-chat[\\/]/
const KIT_INTERNAL_NAME = 'CollapsibleCard'
const KIT_SOURCE = /^@conciv\/ui-kit-chat(\/|$)/

const TEST_FILE = /(^|[\\/])test[\\/].*\.[jt]sx?$|\.(?:test|spec)\.[jt]sx?$/
const RENDER_EXEMPT_FILE = /[\\/]test[\\/]fixtures[\\/]host[\\/]main\.tsx$/
const SOLID_WEB_SOURCE = 'solid-js/web'
const SOLID_WEB_RENDER_NAMES = new Set(['render', 'hydrate'])

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

function isReadOfHostObject(node, parent) {
  if (parent?.type !== 'MemberExpression') return false
  return parent.object === node
}

function isPropertyKey(node, parent) {
  if (parent?.type !== 'Property') return false
  return parent.key === node && parent.computed !== true
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

const noTimersInTests = {
  meta: {
    type: 'problem',
    messages: {
      noTimer:
        '{{name}} schedules test-side time. Await the async surface the product already exposes (a callback, a stream chunk, a websocket message, a web-first assertion) instead of a timer.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Identifier(node) {
        if (!TIMER_NAMES.has(node.name)) return
        const parent = node.parent
        if (isReadOfHostObject(node, parent)) return
        if (isPropertyKey(node, parent)) return
        context.report({node, messageId: 'noTimer', data: {name: node.name}})
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
    'no-locator-poll': noLocatorPoll,
    'no-of-suffix': noOfSuffix,
    'no-predicate-waits': noPredicateWaits,
    'no-signal-ref': noSignalRef,
    'no-timers-in-tests': noTimersInTests,
    'plugin-view-reads-through-query': pluginViewReadsThroughQuery,
    'router-idioms': routerIdioms,
    'solid-test-render': solidTestRender,
    'test-file-budget': testFileBudget,
    'tool-card-shell': toolCardShell,
  },
}
