import {Plugin} from '@conciv/backend-plugin-api'

enum Mood {
  Calm,
}

export default Plugin.define({
  id: 'does-not-strip',
  async setup() {
    void Mood.Calm
  },
})
