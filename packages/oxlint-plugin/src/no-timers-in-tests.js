const TIMER_NAMES = new Set(['setTimeout', 'setInterval', 'setImmediate'])

function isReadOfHostObject(node, parent) {
  if (parent?.type !== 'MemberExpression') return false
  return parent.object === node
}

function isPropertyKey(node, parent) {
  if (parent?.type !== 'Property') return false
  return parent.key === node && parent.computed !== true
}

export default {
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
