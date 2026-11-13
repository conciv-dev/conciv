import {createHash} from 'crypto'

export namespace Hash {
  export function sha256(input: string | Buffer): string {
    return createHash('sha256').update(input).digest('hex')
  }
}
