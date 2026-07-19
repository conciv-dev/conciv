import {createSignal, For, type JSX} from 'solid-js'

export function FixtureElement(): JSX.Element {
  const [markers, setMarkers] = createSignal<number[]>([])
  return (
    <div>
      <button type="button" aria-label="Comment target">
        Comment target
      </button>
      <button type="button" onClick={() => setMarkers((prev) => [...prev, prev.length + 1])}>
        Add marker
      </button>
      <label>
        Fixture input
        <input type="text" />
      </label>
      <For each={markers()}>{(marker) => <button type="button">{`Marker ${marker}`}</button>}</For>
    </div>
  )
}
