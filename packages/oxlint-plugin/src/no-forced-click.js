import {isIdentifier, readCalleeName} from './ast-walk.js'

const TEST_SUFFIX = /\.(?:test|spec)\.[jt]sx?$/
const CLICK_NAMES = new Set(['click', 'dblclick'])
const FORCE_KEY = 'force'

function readKeyName(property) {
  if (isIdentifier(property.key)) return property.key.name
  if (property.key.type === 'Literal') return property.key.value
  return undefined
}

function isForceTrue(property) {
  if (property.type !== 'Property' || property.computed) return false
  if (readKeyName(property) !== FORCE_KEY) return false
  return property.value.type === 'Literal' && property.value.value === true
}

function findForceTrue(argument) {
  if (argument.type !== 'ObjectExpression') return undefined
  return argument.properties.find(isForceTrue)
}

export default {
  meta: {
    type: 'problem',
    messages: {
      noForcedClick:
        '{{name}} with force: true clicks past what a user could reach. Click the element the way a user does, through the layer that covers it; a forced click is allowed only on a line the maintainer approved, with a disable directive for this rule.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!TEST_SUFFIX.test(context.filename)) return
        const name = readCalleeName(node.callee)
        if (!CLICK_NAMES.has(name)) return
        for (const argument of node.arguments) {
          const force = findForceTrue(argument)
          if (force) context.report({node: force, messageId: 'noForcedClick', data: {name}})
        }
      },
    }
  },
}
