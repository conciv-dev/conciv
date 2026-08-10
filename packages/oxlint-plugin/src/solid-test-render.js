import {isIdentifier} from './ast-walk.js'

const TEST_FILE = /(^|[\\/])test[\\/].*\.[jt]sx?$|\.(?:test|spec)\.[jt]sx?$/
const EXEMPT_FILE = /[\\/]test[\\/]fixtures[\\/]host[\\/]main\.tsx$/
const FORBIDDEN_SOURCE = 'solid-js/web'
const FORBIDDEN_NAMES = new Set(['render', 'hydrate'])

function importedName(specifier) {
  if (specifier.type !== 'ImportSpecifier') return undefined
  if (!isIdentifier(specifier.imported)) return undefined
  return specifier.imported.name
}

function reportSpecifier(specifier, context) {
  const name = importedName(specifier)
  if (name === undefined || !FORBIDDEN_NAMES.has(name)) return
  context.report({node: specifier, messageId: 'solidWebRenderInTest', data: {name}})
}

function appliesToFile(filename) {
  return TEST_FILE.test(filename) && !EXEMPT_FILE.test(filename)
}

function checkImportDeclaration(node, context) {
  if (!appliesToFile(context.filename)) return
  if (node.source.value !== FORBIDDEN_SOURCE) return
  for (const specifier of node.specifiers) reportSpecifier(specifier, context)
}

export default {
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
        checkImportDeclaration(node, context)
      },
    }
  },
}
