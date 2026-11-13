import {Context} from 'effect'
import {Info} from '../schema/location.js'

export * as Location from './location.js'

export {Info}

export interface Interface extends Info {}

export const Service = Context.Service<Interface>('@opencode/Location')
