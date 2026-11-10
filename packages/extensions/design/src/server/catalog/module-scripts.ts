import {parse} from 'parse5'

export function moduleScripts(html: string): string[] {
  return scripts(parse(html))
}

type HtmlNode = {nodeName: string; attrs?: {name: string; value: string}[]; childNodes?: HtmlNode[]}

function scripts(node: HtmlNode): string[] {
  const own =
    node.nodeName === 'script' && attribute(node, 'type') === 'module' && attribute(node, 'src') !== null
      ? [attribute(node, 'src') ?? '']
      : []
  return [...own, ...(node.childNodes ?? []).flatMap((child) => scripts(child))]
}

function attribute(node: HtmlNode, name: string): string | null {
  return node.attrs?.find((attr) => attr.name === name)?.value ?? null
}
