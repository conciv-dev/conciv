const ATTRIBUTE = 'suppressHydrationWarning'

function propertyKeyName(key) {
  if (key.type === 'Identifier') return key.name
  if (key.type === 'Literal') return key.value
  return undefined
}

function report(node, context) {
  context.report({node, messageId: 'suppressed'})
}

export default {
  meta: {
    type: 'problem',
    messages: {
      suppressed:
        '`suppressHydrationWarning` hides a server/client mismatch instead of fixing it. Make the server render what the client renders (or move the client-only write off the element React hydrates); never silence the warning.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type === 'JSXIdentifier' && node.name.name === ATTRIBUTE) report(node, context)
      },
      Property(node) {
        if (node.computed !== true && propertyKeyName(node.key) === ATTRIBUTE) report(node, context)
      },
    }
  },
}
