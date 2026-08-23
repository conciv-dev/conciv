import {Match, Switch, type JSX} from 'solid-js'
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
  return (
    <Switch>
      <Match when={props.shape.kind === 'tree' && props.shape}>{(shape) => <JsonTree data={shape().data} />}</Match>
      <Match when={props.shape.kind === 'code' && props.shape}>
        {(shape) => (
          <CodeBlock file={{name: `${props.name}.${shape().lang}`, lang: shape().lang, contents: shape().contents}} />
        )}
      </Match>
    </Switch>
  )
}

export function ShapedValue(props: {name: string; value: unknown}): JSX.Element {
  return <ShapedContent name={props.name} shape={valueShape(props.value)} />
}

export function ShapedText(props: {name: string; text: string}): JSX.Element {
  return <ShapedContent name={props.name} shape={textShape(props.text)} />
}
