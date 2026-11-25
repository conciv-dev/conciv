import {readCalleeName, readMemberObjectName} from './ast-walk.js'
import {isNewLayerTestFile} from '@internal/vitest-config/test-layout'

const STUB_NAMES = new Set([
  'mock',
  'doMock',
  'unmock',
  'doUnmock',
  'importMock',
  'mocked',
  'fn',
  'spyOn',
  'stubGlobal',
  'unstubAllGlobals',
  'stubEnv',
  'unstubAllEnvs',
])

function readStubName(node) {
  if (readMemberObjectName(node) !== 'vi') return undefined
  const name = readCalleeName(node)
  if (!STUB_NAMES.has(name)) return undefined
  return name
}

export default {
  meta: {
    type: 'problem',
    messages: {
      noMock:
        'vi.{{name}} stubs our own code or the environment. Use a real implementation of the interface (a fake service, the scripted harness, a kit fixture); env goes through the engine({env}) fixture.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      MemberExpression(node) {
        if (!isNewLayerTestFile(context.filename)) return
        const name = readStubName(node)
        if (name === undefined) return
        context.report({node, messageId: 'noMock', data: {name}})
      },
    }
  },
}
