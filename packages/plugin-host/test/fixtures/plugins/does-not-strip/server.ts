import {Plugin} from '@conciv/plugin'

enum Mood {
  Calm,
}

export default Plugin.define({
  id: 'does-not-strip',
  async setup() {
    void Mood.Calm
  },
})
