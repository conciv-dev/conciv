import {isIdentifier} from './ast-walk.js'

const ALLOWED_FILE = /(^|[\\/])packages[\\/]ui-kit-chat[\\/]/
const FORBIDDEN_NAME = 'CollapsibleCard'
const FORBIDDEN_SOURCE = /^@conciv\/ui-kit-chat(\/|$)/

function importedName(specifier) {
  if (specifier.type !== 'ImportSpecifier') return undefined
  if (!isIdentifier(specifier.imported)) return undefined
  return specifier.imported.name
}

function reportSpecifier(specifier, context) {
  if (importedName(specifier) !== FORBIDDEN_NAME) return
  context.report({node: specifier, messageId: 'collapsibleCardOutsideKit'})
}

function checkImportDeclaration(node, context) {
  if (ALLOWED_FILE.test(context.filename)) return
  if (!FORBIDDEN_SOURCE.test(node.source.value)) return
  for (const specifier of node.specifiers) reportSpecifier(specifier, context)
}

export default {
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
        checkImportDeclaration(node, context)
      },
    }
  },
}
