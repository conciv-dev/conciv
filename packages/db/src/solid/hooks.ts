import {createComponent, createContext, useContext, type Accessor, type JSX} from 'solid-js'
import {useLiveQuery, eq} from '@tanstack/solid-db'
import type {CollectionStatus} from '@tanstack/db'
import {sessionsCollection, draftsCollection, markersCollection, type StateClient} from '../collections.js'
import {stateError} from '../errors.js'
import type {DraftRow, MarkerRow, SessionRow} from '../rows.js'

type StateCollections = {
  sessions: ReturnType<typeof sessionsCollection>
  drafts: ReturnType<typeof draftsCollection>
  markers: ReturnType<typeof markersCollection>
}

type LiveQueryFlags = {
  status: CollectionStatus
  isLoading: boolean
  isReady: boolean
  isIdle: boolean
  isError: boolean
  isCleanedUp: boolean
}

export type LiveRows<T> = Accessor<Array<T>> & LiveQueryFlags
export type LiveRow<T> = Accessor<T | undefined> & LiveQueryFlags

const StateContext = createContext<StateCollections>()

export function StateProvider(props: {client: StateClient; children: JSX.Element}): JSX.Element {
  const value: StateCollections = {
    sessions: sessionsCollection(props.client),
    drafts: draftsCollection(props.client),
    markers: markersCollection(props.client),
  }
  return createComponent(StateContext.Provider, {
    value,
    get children() {
      return props.children
    },
  })
}

export function useStateCollections(): StateCollections {
  const value = useContext(StateContext)
  if (!value) throw stateError('missing-provider', 'useStateCollections must be used within StateProvider')
  return value
}

export function useSessions(): LiveRows<SessionRow> {
  const {sessions} = useStateCollections()
  return useLiveQuery((q) => q.from({session: sessions}))
}

export function useSession(sessionId: () => string | null): LiveRow<SessionRow> {
  const {sessions} = useStateCollections()
  return useLiveQuery((q) =>
    q
      .from({session: sessions})
      .where(({session}) => eq(session.session_id, sessionId() ?? ''))
      .findOne(),
  )
}

export function useDraft(sessionId: () => string): LiveRow<DraftRow> {
  const {drafts} = useStateCollections()
  return useLiveQuery((q) =>
    q
      .from({draft: drafts})
      .where(({draft}) => eq(draft.session_id, sessionId()))
      .findOne(),
  )
}

export function useMarkers(sessionId: () => string): LiveRows<MarkerRow> {
  const {markers} = useStateCollections()
  return useLiveQuery((q) => q.from({marker: markers}).where(({marker}) => eq(marker.session_id, sessionId())))
}
