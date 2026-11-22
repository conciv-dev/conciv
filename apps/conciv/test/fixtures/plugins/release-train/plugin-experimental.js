const {Plugin, Slot, ToolRegistry} = require('@conciv/plugin/experimental')

function paragraph(text) {
  return Object.assign(document.createElement('p'), {textContent: text})
}

module.exports = {
  default: Plugin.define({
    setup(ctx) {
      ctx.add(ToolRegistry, {
        name: 'release_check',
        render: (props) => () => paragraph(`Release card for ${props.input.branch}`),
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
      ctx.add(Slot, {at: 'session.header', render: () => paragraph('Release train: on time')})
      ctx.add(Slot, {at: 'session.status', render: () => paragraph('Next train at noon')})
    },
  }),
}
