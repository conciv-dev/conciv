import {ComposerPill, Plugin} from '@conciv/frontend-plugin-api'
import {Page} from '@conciv/frontend-plugin-api/page'

export default Plugin.define({
  setup(ctx) {
    const page = ctx.use(Page)
    ctx.add(ComposerPill, {
      id: 'page-comment',
      order: 1,
      show: (input) => {
        const live = page()
        if (live.status !== 'active') return undefined
        return {
          label: 'Comment on the page',
          run: async () => {
            const picked = await live.value.pick()
            if (!picked) return
            input.screen.composer.attach({
              type: 'note',
              origin: 'page-comment',
              commentId: 'page-comment',
              label: 'Page comment',
              icon: 'message-square-plus',
              subject: picked.text,
              comment: 'Make this button green',
            })
            input.screen.composer.focus()
          },
        }
      },
    })
  },
})
