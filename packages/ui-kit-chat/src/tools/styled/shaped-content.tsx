import {Match, Switch, splitProps, type JSX} from 'solid-js'
import {CodeBlock} from './code-block.js'
import {JsonTree} from './json-tree.js'

type ContentShape = {kind: 'tree'; data: object} | {kind: 'code'; lang: string; contents: string}

function valueShape(value: unknown): ContentShape {
  if (typeof value === 'object' && value !== null) return {kind: 'tree', data: value}
  if (typeof value === 'string') return {kind: 'code', lang: 'text', contents: value}
  return {kind: 'code', lang: 'json', contents: String(value)}
}

function textShape(text: string): ContentShape {
  try {
    return valueShape(JSON.parse(text))
  } catch {
    return {kind: 'code', lang: 'text', contents: text}
  }
}

function ShapedContent(props: {name: string; shape: ContentShape}): JSX.Element {
  const [local, rest] = splitProps(props, ['name', 'shape'])
  return (
    <Switch>
      <Match when={local.shape.kind === 'tree' && local.shape}>
        {(shape) => <JsonTree {...rest} data={shape().data} />}
      </Match>
      <Match when={local.shape.kind === 'code' && local.shape}>
        {(shape) => (
          <CodeBlock
            {...rest}
            file={{name: `${local.name}.${shape().lang}`, lang: shape().lang, contents: shape().contents}}
          />
        )}
      </Match>
    </Switch>
  )
}

export function ShapedValue(props: {name: string; value: unknown}): JSX.Element {
  const [local, rest] = splitProps(props, ['name', 'value'])
  return <ShapedContent {...rest} name={local.name} shape={valueShape(local.value)} />
}

export function ShapedText(props: {name: string; text: string}): JSX.Element {
  const [local, rest] = splitProps(props, ['name', 'text'])
  return <ShapedContent {...rest} name={local.name} shape={textShape(local.text)} />
}
