import {Context} from 'effect'
import {Info, Ref} from '@conciv/protocol/schema/location'
import type * as Project from '../schema/project.js'

export {Info, Ref}

export interface Interface extends Info {
  readonly vcs?: Project.Vcs
}

export const Service = Context.Service<Interface>('@conciv/Location')
