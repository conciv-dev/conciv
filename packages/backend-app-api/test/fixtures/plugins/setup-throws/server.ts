import {Plugin} from '@conciv/backend-plugin-api'

export default Plugin.define({
  id: 'setup-throws',
  async setup() {
    throw new Error('setup exploded')
  },
})
