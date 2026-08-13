import {Show, splitProps, type ComponentProps, type JSX} from 'solid-js'
import {Progress as Ark} from '@ark-ui/solid/progress'

export type LoaderSize = 'sm' | 'md' | 'lg'

const ROOT = 'loader-size flex flex-col items-center justify-center gap-8 p-8'
const ORB = 'loader-orb'
const TEXT = 'loader-text'
const LABEL = 'loader-label'
const DESCRIPTION = 'loader-description'

const DEFAULT_TRANSLATIONS = {value: () => 'Loading'}

function LoaderArcs(): JSX.Element {
  return (
    <>
      <span class="loader-arc loader-arc-a" />
      <span class="loader-arc loader-arc-b" />
      <span class="loader-arc loader-arc-c" />
      <span class="loader-arc loader-arc-d" />
    </>
  )
}

function Root(props: ComponentProps<typeof Ark.Root> & {size?: LoaderSize}): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'size'])
  return (
    <Ark.Root
      value={null}
      translations={DEFAULT_TRANSLATIONS}
      {...rest}
      class={`${ROOT}  ${local.class ?? ''}`}
      data-size={local.size ?? 'md'}
    />
  )
}

function Indicator(props: ComponentProps<typeof Ark.Track>): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <Ark.Track {...rest} class={`${ORB}  ${local.class ?? ''}`}>
      <Show when={local.children !== undefined} fallback={<LoaderArcs />}>
        {local.children}
      </Show>
    </Ark.Track>
  )
}

function Text(props: ComponentProps<'div'>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <div {...rest} class={`${TEXT}  ${local.class ?? ''}`} />
}

function Label(props: ComponentProps<typeof Ark.Label>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Label {...rest} class={`${LABEL}  ${local.class ?? ''}`} />
}

function Description(props: ComponentProps<'p'>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <p {...rest} class={`${DESCRIPTION}  ${local.class ?? ''}`} />
}

export const Loader = Object.assign({}, Ark, {Root, Indicator, Text, Label, Description})
