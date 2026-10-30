import {Visitor, type Argument, type Expression, type JSXExpression} from 'oxc-parser'
import type {ProvenanceMapper} from '../../shared/types.js'
import {declarationsOf} from './css-map.js'
import {attributeOf, located, siteOf, UNKNOWN, type Site} from './jsx.js'

type Piece = {text: string; start: number}

type Walk = {consts: Map<string, Expression>; seen: Set<string>}

const CLASS_HELPERS = ['clsx', 'cn']

const SELECTOR_DELIMITERS = [' ', '.', ':', '#', '[', ']', '>', '+', '~', ',', '(', ')', '*', '&']

function classToken(selector: string | null): string | null {
  if (selector === null || !selector.startsWith('.')) return null
  const token = selector.slice(1)
  if (token === '' || [...token].some((char) => SELECTOR_DELIMITERS.includes(char))) return null
  return token
}

function piecesOf(input: Walk & {node: Argument | JSXExpression}): Piece[] {
  const {node} = input
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? [{text: node.value, start: node.start + 1}] : []
    case 'TemplateLiteral':
      return [
        ...node.quasis.map((quasi) => ({text: quasi.value.cooked ?? quasi.value.raw, start: quasi.start + 1})),
        ...node.expressions.flatMap((expression) => piecesOf({...input, node: expression})),
      ]
    case 'CallExpression':
      if (node.callee.type !== 'Identifier' || !CLASS_HELPERS.includes(node.callee.name)) return []
      return node.arguments.flatMap((argument) => piecesOf({...input, node: argument}))
    case 'SpreadElement':
      return piecesOf({...input, node: node.argument})
    case 'ConditionalExpression':
      return [node.consequent, node.alternate].flatMap((branch) => piecesOf({...input, node: branch}))
    case 'LogicalExpression':
      return [node.left, node.right].flatMap((side) => piecesOf({...input, node: side}))
    case 'Identifier':
      return constPieces({...input, name: node.name})
    default:
      return []
  }
}

function constPieces(input: Walk & {name: string}): Piece[] {
  const init = input.consts.get(input.name)
  if (init === undefined || input.seen.has(input.name)) return []
  return piecesOf({consts: input.consts, seen: new Set([...input.seen, input.name]), node: init})
}

function constsOf(site: Site): Map<string, Expression> {
  const consts = new Map<string, Expression>()
  new Visitor({
    VariableDeclaration(node) {
      if (node.kind !== 'const') return
      for (const declarator of node.declarations) {
        if (declarator.id.type === 'Identifier' && declarator.init !== null)
          consts.set(declarator.id.name, declarator.init)
      }
    },
  }).visit(site.program)
  return consts
}

function classPieces(site: Site): Piece[] {
  const attribute = attributeOf({element: site.element, name: 'className'})
  if (attribute === null || attribute.value === null) return []
  const {value} = attribute
  if (value.type === 'Literal') return [{text: value.value, start: value.start + 1}]
  if (value.type !== 'JSXExpressionContainer') return []
  return piecesOf({consts: constsOf(site), seen: new Set(), node: value.expression})
}

function tokenOffset(input: {piece: Piece; token: string}): number | null {
  const words = input.piece.text.split(' ')
  const index = words.indexOf(input.token)
  if (index === -1) return null
  return input.piece.start + words.slice(0, index).reduce((sum, word) => sum + word.length + 1, 0)
}

export const classNameMapper: ProvenanceMapper = {
  via: 'className',
  applies: ({winner}) => classToken(winner.selector) !== null,
  async map(input) {
    const token = classToken(input.winner.selector)
    const {source} = input.component
    if (token === null || source === null) return UNKNOWN
    const site = await siteOf({cwd: input.cwd, source})
    if (site === null) return UNKNOWN
    const offset = classPieces(site)
      .map((piece) => tokenOffset({piece, token}))
      .find((found) => found !== null)
    if (offset === undefined || offset === null) return UNKNOWN
    const selector = `.${token}`
    const hit = input.cssMap.find({selector, property: input.property})
    if (hit !== null && (await declarationsOf({cwd: input.cwd, file: hit.file, selector})) > 1) return UNKNOWN
    const {line, column} = located({site, offset})
    return {via: 'className', file: source.file, line, column, declaration: token, selector}
  },
}
