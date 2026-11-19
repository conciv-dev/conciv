import {Match, Switch, type JSX} from 'solid-js'
import {useQuery, type UseQueryResult} from '@conciv/client'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {loadPlayerKit, type PlayerKit} from './player.js'

export function usePlayerKit(): UseQueryResult<PlayerKit> {
  return useQuery(() => ({
    queryKey: ['plugin', 'recorder', 'player-kit'],
    queryFn: loadPlayerKit,
    retry: false,
    refetchOnWindowFocus: false,
  }))
}

export function PlayerKitSwitch(props: {
  kit: UseQueryResult<PlayerKit>
  children: (kit: PlayerKit) => JSX.Element
}): JSX.Element {
  const loaded = (): PlayerKit | undefined => (props.kit.isSuccess ? props.kit.data : undefined)
  return (
    <Switch fallback={<RecorderNotice text="Loading player…" />}>
      <Match when={props.kit.isError}>
        <RecorderErrorNotice retry={() => location.reload()} text="Could not load the player." />
      </Match>
      <Match keyed when={loaded()}>
        {(kit) => props.children(kit)}
      </Match>
    </Switch>
  )
}
