import {Context} from 'effect'
import {Info, Ref} from '@conciv/plugin/schema/location'

export * as Location from './location.js'

export {Info, Ref}

export interface Interface extends Info {}

export const Service = Context.Service<Interface>('@conciv/Location')
