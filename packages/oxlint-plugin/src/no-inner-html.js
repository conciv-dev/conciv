const HTML_PROPERTIES = ['innerHTML', 'outerHTML']
const HTML_METHODS = ['insertAdjacentHTML', 'write', 'writeln']

function memberName(node) {
  if (node.type !== 'MemberExpression') return undefined
  if (node.computed !== true && node.property.type === 'Identifier') return node.property.name
  if (node.computed === true && node.property.type === 'Literal') return node.property.value
  return undefined
}

function isDocumentWrite(callee, name) {
  if (name === 'insertAdjacentHTML') return true
  return callee.object.type === 'Identifier' && callee.object.name === 'document'
}

export default {
  meta: {
    type: 'problem',
    messages: {
      htmlWrite:
        '`{{name}}` writes a string of HTML into the page. Build the nodes instead: text through `textContent`, elements through the framework or `createElement`/`append`/`replaceChildren`, static markup in the HTML file.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      AssignmentExpression(node) {
        const name = memberName(node.left)
        if (HTML_PROPERTIES.includes(name)) context.report({node, messageId: 'htmlWrite', data: {name}})
      },
      CallExpression(node) {
        const name = memberName(node.callee)
        if (!HTML_METHODS.includes(name) || !isDocumentWrite(node.callee, name)) return
        context.report({node, messageId: 'htmlWrite', data: {name}})
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !HTML_PROPERTIES.includes(node.name.name)) return
        context.report({node, messageId: 'htmlWrite', data: {name: node.name.name}})
      },
    }
  },
}
