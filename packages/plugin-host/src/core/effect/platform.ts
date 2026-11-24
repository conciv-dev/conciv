import * as NodeChildProcessSpawner from '@effect/platform-node/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as NodePath from '@effect/platform-node/NodePath'
import {FileSystem, Path} from 'effect'
import {FetchHttpClient, HttpClient} from 'effect/http'
import {ChildProcessSpawner} from 'effect/process/ChildProcessSpawner'
import {makeGlobalNode} from './app-node.js'

export * as Platform from './platform.js'

export const fileSystem = makeGlobalNode({service: FileSystem.FileSystem, layer: NodeFileSystem.layer, deps: []})

export const path = makeGlobalNode({service: Path.Path, layer: NodePath.layer, deps: []})

export const spawner = makeGlobalNode({
  service: ChildProcessSpawner,
  layer: NodeChildProcessSpawner.layer,
  deps: [fileSystem, path],
})

export const httpClient = makeGlobalNode({service: HttpClient.HttpClient, layer: FetchHttpClient.layer, deps: []})
