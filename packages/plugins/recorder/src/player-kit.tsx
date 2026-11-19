import {Match, Switch, createResource, type JSX, type Resource} from 'solid-js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {loadPlayerKit, type PlayerKit} from './player.js'

export function usePlayerKit(): Resource<PlayerKit> {
  const [playerKit] = createResource(loadPlayerKit)
  return playerKit
}

export function PlayerKitSwitch(props: {
  kit: Resource<PlayerKit>
  children: (kit: PlayerKit) => JSX.Element
}): JSX.Element {
  const loaded = (): PlayerKit | undefined => (props.kit.state === 'ready' ? props.kit() : undefined)
  return (
    <Switch fallback={<RecorderNotice text="Loading player…" />}>
      <Match when={props.kit.error}>
        <RecorderErrorNotice retry={() => location.reload()} text="Could not load the player." />
      </Match>
      <Match keyed when={loaded()}>
        {(kit) => props.children(kit)}
      </Match>
    </Switch>
  )
}
