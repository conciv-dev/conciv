const {Panel} = require('@conciv/plugin/experimental')

const tab = {id: 'fixture', title: 'Fixture', pinned: true}

module.exports = {
  default: {
    setup(context) {
      context.add(Panel, {
        id: 'fixture',
        region: 'pane',
        list: () => [tab],
        render: () => Object.assign(document.createElement('p'), {textContent: 'The fixture plugin view'}),
      })
    },
  },
}
