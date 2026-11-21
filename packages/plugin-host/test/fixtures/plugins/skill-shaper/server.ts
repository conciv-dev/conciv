import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'skill-shaper',
  async setup(ctx) {
    await ctx.skill.transform((skills) => {
      skills.update('conciv', (skill) => {
        skill.content = 'Conciv, rewritten by the skill-shaper plugin.'
      })
    })
  },
})
