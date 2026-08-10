import {splitProps, type JSX} from 'solid-js'

const IMAGE_CLASS =
  'rounded-[var(--chat-radius-sm)] max-h-60 max-w-full [border:1px_solid_var(--chat-line)] self-start block'

export function ResultImage(props: {src: string; alt: string; class?: string}): JSX.Element {
  const [local] = splitProps(props, ['src', 'alt', 'class'])
  const imageClass = (): string => `${IMAGE_CLASS} ${local.class ?? ''}`
  return <img src={local.src} alt={local.alt} class={imageClass()} />
}
