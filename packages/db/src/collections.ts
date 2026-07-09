import {createCollection} from '@tanstack/db'
import {trailBaseCollectionOptions} from '@tanstack/trailbase-db-collection'
import {initClient, type Client} from 'trailbase'
import type {SessionRow, DraftRow, MarkerRow} from './rows.js'
import {extensionTableName} from './table-names.js'

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

export type ExtensionRow = {id: string} & Record<string, unknown>

export function extensionTableCollection(client: StateClient, extension: string, name: string) {
  const physical = extensionTableName({extension, name})
  return createCollection(
    trailBaseCollectionOptions<ExtensionRow>({
      id: physical,
      recordApi: client.records(physical),
      getKey: (row) => row.id,
      parse: {},
      serialize: {},
    }),
  )
}

export type ExtensionTableCollection = ReturnType<typeof extensionTableCollection>

export function makeTableFactory(client: StateClient, extension: string): (name: string) => ExtensionTableCollection {
  const cache = new Map<string, ExtensionTableCollection>()
  return (name) => {
    const cached = cache.get(name)
    if (cached) return cached
    const collection = extensionTableCollection(client, extension, name)
    cache.set(name, collection)
    return collection
  }
}
