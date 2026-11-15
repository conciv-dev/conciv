const DELEGATED_FOCUS = new Set(['onfocusin', 'onfocusout'])

function checkAttribute(node, context) {
  if (node.name.type !== 'JSXIdentifier') return
  if (!DELEGATED_FOCUS.has(node.name.name.toLowerCase())) return
  context.report({node, messageId: 'delegatedFocus', data: {name: node.name.name}})
}

export default {
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
        checkAttribute(node, context)
      },
    }
  },
}
