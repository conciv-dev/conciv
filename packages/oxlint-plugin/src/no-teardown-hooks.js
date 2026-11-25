import {isIdentifier, readCalleeName} from './ast-walk.js'
import {isNewLayerTestFile} from '@internal/vitest-config/test-layout'

const HOOK_NAMES = new Set(['afterEach', 'onTestFinished'])

function isDestructuredHook(node) {
  if (node.parent?.type !== 'ObjectPattern' || !isIdentifier(node.key)) return false
  return HOOK_NAMES.has(node.key.name)
}

function report(node, name, context) {
  context.report({node, messageId: 'noTeardownHook', data: {name}})
}

export default {
  meta: {
    type: 'problem',
    messages: {
      noTeardownHook:
        '{{name}} tears a resource down by hand. Build it as a test.extend fixture and put the teardown after await use(value), so every test that takes it is cleaned up the same way.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isNewLayerTestFile(context.filename)) return
        const name = readCalleeName(node.callee)
        if (!HOOK_NAMES.has(name)) return
        report(node, name, context)
      },
      Property(node) {
        if (!isNewLayerTestFile(context.filename)) return
        if (!isDestructuredHook(node)) return
        report(node, node.key.name, context)
      },
    }
  },
}
