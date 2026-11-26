const {Command, ComposerPill, Plugin} = require('@conciv/frontend-plugin-api')
const {Page} = require('@conciv/frontend-plugin-api/page')

const headerNote = {
  type: 'note',
  origin: 'review',
  commentId: 'header',
  label: 'Header',
  icon: 'message-square',
  subject: 'the page header',
  comment: 'Make the header sticky',
}

function paragraph(text) {
  return Object.assign(document.createElement('p'), {textContent: text})
}

function closeButton(close) {
  const button = Object.assign(document.createElement('button'), {type: 'button', textContent: 'Done'})
  button.addEventListener('click', () => close())
  return button
}

module.exports = {
  default: Plugin.define({
    setup(ctx) {
      ctx.add(Command, {
        id: 'review',
        title: 'Review',
        description: 'Review a part of the page',
        slash: {name: 'review', arguments: true},
        run: (input) => {
          ctx.toast.show({title: `Reviewing ${input}`, persistent: true})
        },
      })
      ctx.add(Command, {
        id: 'summary',
        title: 'Summary',
        description: 'Sum up the review',
        slash: {name: 'summary', after: 'model'},
        run: () => {
          ctx.toast.show({title: 'Summary ready', persistent: true})
        },
      })
      ctx.add(ComposerPill, {
        id: 'review',
        order: 3,
        show: (input) => ({
          label: 'Review',
          run: () => {
            input.screen.composer.attach(headerNote)
            input.screen.composer.focus()
          },
        }),
      })
      const page = ctx.use(Page)
      ctx.add(ComposerPill, {
        id: 'page-comment',
        order: 4,
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
      ctx.add(ComposerPill, {
        id: 'checks',
        order: 1,
        show: (input) =>
          input.screen.composer.text() === ''
            ? {
                label: 'Checks',
                rows: [
                  {
                    id: 'lint',
                    label: 'Lint failed',
                    tone: 'danger',
                    run: () => input.screen.composer.insert('Fix lint'),
                  },
                ],
              }
            : undefined,
      })
      ctx.add(ComposerPill, {
        id: 'status',
        order: 2,
        show: () => ({label: 'Status', title: 'Deploy status'}),
        menu: (input) => {
          const content = document.createElement('div')
          content.append(paragraph('Staging is green'), closeButton(input.close))
          return content
        },
      })
    },
  }),
}
