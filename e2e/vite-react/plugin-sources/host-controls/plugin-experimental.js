const {Slot} = require('@conciv/plugin/experimental')

const choiceSchema = {
  '~standard': {
    version: 1,
    vendor: 'conciv-e2e',
    validate: (value) => ({value}),
  },
}

function controlButton(label, onClick) {
  return Object.assign(document.createElement('button'), {type: 'button', textContent: label, onclick: onClick})
}

module.exports = {
  default: {
    setup(ctx) {
      const choice = ctx.storage.store('choice', {schema: choiceSchema, initial: {remembered: false}})
      ctx.add(Slot, {
        at: 'window.bottom',
        render: () => {
          const row = document.createElement('div')
          row.append(
            controlButton('Save notes', () => ctx.system.save({name: 'notes.txt', content: 'notes the plugin saved'})),
            controlButton('Open conciv.dev', () => ctx.system.openExternal('https://conciv.dev/')),
            controlButton('Remember this choice', () => choice.set({remembered: true})),
          )
          return row
        },
      })
    },
  },
}
