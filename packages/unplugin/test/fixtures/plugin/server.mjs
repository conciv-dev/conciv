import {writeFileSync} from 'node:fs'

export default {
  id: 'fixture',
  setup: (context) => () => {
    const marker = context.options.disposedMarker
    if (typeof marker === 'string') writeFileSync(marker, '')
  },
}
