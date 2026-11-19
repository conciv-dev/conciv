const {Slot} = require('@conciv/plugin/experimental')
module.exports = {
  default: {
    setup(ctx) {
      ctx.add(Slot, {
        at: 'window.bottom',
        render: () => Object.assign(document.createElement('p'), {textContent: 'live line first'}),
      })
    },
  },
}
