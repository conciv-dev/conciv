import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'setup-throws',
  async setup() {
    throw new Error('setup exploded')
  },
})
