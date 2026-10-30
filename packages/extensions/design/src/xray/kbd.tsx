import type {JSX} from 'solid-js'

export function Kbd(props: {children: JSX.Element}): JSX.Element {
  return (
    <kbd class="text-[0.625rem] text-current leading-none font-chat-mono font-medium px-1 py-0.5 text-center rounded-chat-chip bg-chat-fill-strong opacity-80 min-w-3.5 inline-block">
      {props.children}
    </kbd>
  )
}
