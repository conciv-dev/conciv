const DIRECTIVE_RE =
  /^(?:\/|!|@ts-|@__PURE__|#__PURE__|@__NO_SIDE_EFFECTS__|#__NO_SIDE_EFFECTS__|eslint-|oxlint-|global\b|globals\b|exported\b|prettier-ignore|oxfmt-ignore|@vite-ignore|webpack[A-Z]|v8 ignore|c8 ignore|istanbul ignore|@license|@preserve|sourceMappingURL|#\s*sourceMappingURL)/

const noComments = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    messages: {noComment: 'Comments are not allowed. Delete it, or make the code self-explanatory.'},
    schema: [],
  },
  createOnce(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (DIRECTIVE_RE.test(comment.value.trim())) continue
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

export default {
  meta: {name: 'conciv'},
  rules: {'no-comments': noComments},
}
