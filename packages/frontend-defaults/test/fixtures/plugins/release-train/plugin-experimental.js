const {Plugin, SettingsPage, Slot, ToolRegistry} = require('@conciv/frontend-plugin-api')

function paragraph(text) {
  return Object.assign(document.createElement('p'), {textContent: text})
}

module.exports = {
  default: Plugin.define({
    icons: {
      train:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="3" y="1.5" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 14.5l1.5-3M11 14.5l-1.5-3M3 7h10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    },
    setup(ctx) {
      ctx.add(ToolRegistry, {
        name: 'release_check',
        render: (props) => () => [
          ctx.ui.Icon({name: ctx.icons.train, size: 'small'}),
          paragraph(`Release card for ${props.input.branch}`),
        ],
      })
      ctx.add(ToolRegistry, {
        name: 'release_block',
        render: (props) => () => paragraph(`Release card for ${props.input.branch}`),
        errorComponent: (props) => () => paragraph(`Release held: ${props.error}`),
      })
      ctx.add(ToolRegistry, {
        name: 'release_notes',
        render: () => {
          throw new Error('the notes card cannot draw')
        },
      })
      ctx.add(SettingsPage, {
        id: 'release-schedule',
        title: 'Release schedule',
        icon: ctx.icons.train,
        render: () => paragraph('Trains leave at noon'),
      })
      ctx.add(Slot, {at: 'session.header', render: () => paragraph('Release train: on time')})
      ctx.add(Slot, {at: 'session.status', render: () => paragraph('Next train at noon')})
    },
  }),
}
