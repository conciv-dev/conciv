import {Context} from 'effect'
import {Info, Ref} from '@conciv/plugin/schema/location'
import type {Project} from '../schema/project.js'
import {tags} from './effect/app-node.js'
import {LayerNode} from './effect/layer-node.js'

export * as Location from './location.js'

export {Info, Ref}

export interface Interface extends Info {
  readonly vcs?: Project.Vcs
}

export const Service = Context.Service<Interface>('@conciv/Location')

export const node = LayerNode.unbound(Service, tags.values.location)
