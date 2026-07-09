import {createCollection} from '@tanstack/db'
import {trailBaseCollectionOptions} from '@tanstack/trailbase-db-collection'
import {initClient, type Client} from 'trailbase'
import type {SessionRow, DraftRow, MarkerRow} from './rows.js'

export type StateClient = Client

export function stateClient(baseUrl: string): StateClient {
  return initClient(baseUrl)
}

export function sessionsCollection(client: StateClient) {
  return createCollection(
    trailBaseCollectionOptions<SessionRow>({
      id: 'sessions',
      recordApi: client.records('sessions'),
      getKey: (row) => row.id,
      parse: {},
      serialize: {},
    }),
  )
}

export function draftsCollection(client: StateClient) {
  return createCollection(
    trailBaseCollectionOptions<DraftRow>({
      id: 'drafts',
      recordApi: client.records('drafts'),
      getKey: (row) => row.id,
      parse: {},
      serialize: {},
    }),
  )
}

export function markersCollection(client: StateClient) {
  return createCollection(
    trailBaseCollectionOptions<MarkerRow>({
      id: 'markers',
      recordApi: client.records('markers'),
      getKey: (row) => row.id,
      parse: {},
      serialize: {},
    }),
  )
}
