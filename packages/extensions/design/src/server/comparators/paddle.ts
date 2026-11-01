import type {TextReader} from '../../shared/types.js'

export const paddleReader: TextReader = {
  name: 'paddle',
  read: () => Promise.resolve([]),
}
