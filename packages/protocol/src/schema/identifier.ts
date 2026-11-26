import {Context} from 'effect'

const length = 26
const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export type Maker = {readonly ascending: () => string; readonly descending: () => string}

export const Service = Context.Service<Maker>('@conciv/Identifier')

export function makeMaker(): Maker {
  const clock = {lastTimestamp: 0, counter: 0}
  const create = (descending: boolean) => {
    const timestamp = Date.now()
    if (timestamp !== clock.lastTimestamp) {
      clock.lastTimestamp = timestamp
      clock.counter = 0
    }
    clock.counter++
    const current = BigInt(timestamp) * 0x1000n + BigInt(clock.counter)
    const value = descending ? ~current : current
    const time = Array.from({length: 6}, (_, index) =>
      Number((value >> BigInt(40 - 8 * index)) & 0xffn)
        .toString(16)
        .padStart(2, '0'),
    ).join('')
    const bytes = crypto.getRandomValues(new Uint8Array(length - 12))
    return time + Array.from(bytes, (byte) => chars[byte % 62]).join('')
  }
  return {ascending: () => create(false), descending: () => create(true)}
}
