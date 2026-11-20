import {engineAddress} from './browser-engine.js'
import {makeMount, type Mount} from './mount.js'

export const mount: Mount = makeMount(engineAddress)
