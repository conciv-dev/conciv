import type {Capture} from '../../shared/types.js'
import {tabCapture} from '../captures/tab.js'

export const captures: Record<string, Capture> = {[tabCapture.name]: tabCapture}
