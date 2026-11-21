const {ComposerPill, NoteCard, Plugin} = require('@conciv/plugin/experimental')

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
      ctx.add(ComposerPill, {
        id: 'review',
        order: 3,
        show: (input) => ({label: 'Review', run: () => input.screen.composer.attach(headerNote)}),
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
      ctx.add(NoteCard, {
        origins: ['review'],
        render: () => paragraph('Review card'),
      })
    },
  }),
}
