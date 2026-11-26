import selectorParser, {type Pseudo, type Selector} from 'postcss-selector-parser'

export const PLUGIN_AREA_ATTRIBUTE = 'data-conciv-plugin'

function areaAttribute(plugin: string) {
  const attribute = selectorParser.attribute({
    attribute: PLUGIN_AREA_ATTRIBUTE,
    operator: '=',
    value: '',
    quoteMark: '"',
    raws: {},
  })

  attribute.setValue(plugin, {quoteMark: '"'})

  return attribute
}

function createFence(plugin: string): Pseudo {
  return selectorParser.pseudo({
    value: ':where',
    nodes: [
      selectorParser.selector({nodes: [areaAttribute(plugin)], value: ''}),
      selectorParser.selector({
        nodes: [areaAttribute(plugin), selectorParser.combinator({value: ' '}), selectorParser.universal()],
        value: '',
      }),
    ],
  })
}

function fenceOne(selector: Selector, plugin: string): void {
  const subject = selector.nodes.slice(selector.nodes.findLastIndex(selectorParser.isCombinator) + 1)
  const pseudoElement = subject.find(selectorParser.isPseudoElement)

  if (pseudoElement) {
    const fence = createFence(plugin)

    fence.spaces.before = pseudoElement.spaces.before
    pseudoElement.spaces.before = ''
    selector.insertBefore(pseudoElement, fence)
    return
  }
  selector.append(createFence(plugin))
}

export function fenceSelector(selector: string, plugin: string): string {
  return selectorParser((list) => list.each((each) => fenceOne(each, plugin))).processSync(selector)
}
