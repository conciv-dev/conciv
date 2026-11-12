const DIRECTIVE_RE =
  /^(?:\/|!|@ts-|@__PURE__|#__PURE__|@__NO_SIDE_EFFECTS__|#__NO_SIDE_EFFECTS__|eslint-|oxlint-|global\b|globals\b|exported\b|prettier-ignore|oxfmt-ignore|@vite-ignore|@jsxImportSource\b|webpack[A-Z]|v8 ignore|c8 ignore|istanbul ignore|@license|@preserve|sourceMappingURL|#\s*sourceMappingURL)/

const DECLARATIONS = new Set([
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'FunctionDeclaration',
  'VariableDeclaration',
  'ClassDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
  'TSDeclareFunction',
])

const DECLARATION_PARENTS = new Set(['Program', 'ExportNamedDeclaration', 'ExportDefaultDeclaration', 'TSModuleBlock'])

const MEMBERS = new Set([
  'TSPropertySignature',
  'TSMethodSignature',
  'TSCallSignatureDeclaration',
  'TSConstructSignatureDeclaration',
  'TSIndexSignature',
  'TSEnumMember',
])

export default {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    messages: {noComment: 'Comments are not allowed. Delete it, or make the code self-explanatory.'},
    schema: [
      {
        type: 'object',
        properties: {keepDocComments: {type: 'boolean'}},
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const keepDocComments = context.options[0]?.keepDocComments === true
    return {
      Program() {
        const reported = context.sourceCode
          .getAllComments()
          .filter((comment) => !isKept(comment, context.sourceCode, keepDocComments))
        for (const comment of reported) {
          context.report({
            node: comment,
            messageId: 'noComment',
            fix: (fixer) => fixer.remove(comment),
          })
        }
      },
    }
  },
}

function isKept(comment, sourceCode, keepDocComments) {
  if (DIRECTIVE_RE.test(comment.value.trim())) return true
  return keepDocComments && documentsDeclaration(comment, sourceCode)
}

function documentsDeclaration(comment, sourceCode) {
  if (comment.type !== 'Block' || !comment.value.startsWith('*')) return false
  const start = nextCodeIndex(sourceCode.text, comment.range[1])
  return nodesStartingAt(sourceCode.getNodeByRangeIndex(start), start).some(isDocumentable)
}

function nextCodeIndex(text, from) {
  const offset = text.slice(from).search(/\S/)
  return offset === -1 ? text.length : from + offset
}

function nodesStartingAt(node, start) {
  if (node === null || node === undefined || node.range[0] !== start) return []
  return [node, ...nodesStartingAt(node.parent, start)]
}

function isDocumentable(node) {
  if (MEMBERS.has(node.type)) return true
  return DECLARATIONS.has(node.type) && DECLARATION_PARENTS.has(node.parent?.type)
}
