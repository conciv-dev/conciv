const {ComposerPill, Plugin, Registry} = require('@conciv/plugin/experimental')

const NoteCard = Registry.define('note-card')

module.exports = {
  default: Plugin.define({
    setup(ctx) {
      ctx.add(ComposerPill, {
        id: 'copy-note',
        show: (input) => ({
          label: 'Copy note',
          run: () =>
            input.screen.composer.attach({
              type: 'note',
              origin: 'copy',
              commentId: 'copy',
              label: 'Copy',
              icon: 'message-square',
              subject: 'the page',
              comment: 'A note of its own',
            }),
        }),
      })
      ctx.add(NoteCard, {
        origins: ['copy', 'page'],
        render: () => Object.assign(document.createElement('p'), {textContent: 'Third-party note card'}),
      })
    },
  }),
}
