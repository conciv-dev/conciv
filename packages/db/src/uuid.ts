import {v7} from 'uuid'
import {urlSafeBase64Encode} from 'trailbase'

export function uuidv7Base64(now: () => number = Date.now): string {
  return urlSafeBase64Encode(v7({msecs: now()}, new Uint8Array(16)))
}
