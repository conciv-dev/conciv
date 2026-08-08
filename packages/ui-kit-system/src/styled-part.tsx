import {type Component} from 'solid-js'

export function styledPart<Props extends {class?: string | undefined}>(
  Part: Component<Props>,
  base: string,
): Component<Props> {
  return (props) => <Part {...props} class={`${base}  ${props.class ?? ''}`} />
}
