import {createEffect, createResource, on, onCleanup, Show, type JSX} from 'solid-js'

export function StoredImage(props: {
  load: (path: string) => Promise<Blob | null>
  path: string
  alt: string
  class: string
  missing: JSX.Element
}): JSX.Element {
  const [url] = createResource(
    () => props.path,
    async (path) => {
      const blob = await props.load(path)
      return blob === null ? null : URL.createObjectURL(blob)
    },
  )
  createEffect(
    on(
      () => url.latest,
      (current) => {
        if (current === null || current === undefined) return
        onCleanup(() => URL.revokeObjectURL(current))
      },
    ),
  )
  return (
    <Show when={!url.error && url.latest !== null} fallback={props.missing}>
      <Show when={url.latest}>{(src) => <img alt={props.alt} class={props.class} src={src()} />}</Show>
    </Show>
  )
}
