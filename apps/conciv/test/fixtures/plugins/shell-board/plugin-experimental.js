const {Panel, Plugin, SettingsPage, useDrawer} = require('@conciv/plugin/experimental')

function button(label, run) {
  const element = Object.assign(document.createElement('button'), {type: 'button', textContent: label})
  element.addEventListener('click', () => void run())
  return element
}

function text(content) {
  return Object.assign(document.createElement('p'), {textContent: content})
}

module.exports = {
  default: Plugin.define({
    setup(ctx) {
      ctx.add(Panel, {
        id: 'board',
        region: 'pane',
        mobile: {title: 'Board', order: 1, kind: 'tab', cached: true},
        list: () => [{id: 'board', title: 'Board', pinned: true}],
        render: () => {
          const drawer = useDrawer()
          const answer = text('')
          const note = Object.assign(document.createElement('input'), {type: 'text'})
          note.setAttribute('aria-label', 'Board note')
          const details = button('Open details', () =>
            drawer?.open({title: 'Board details', content: text('The board details'), trigger: details}),
          )
          const root = document.createElement('div')
          root.append(
            button('Raise four notices', () => {
              ctx.toast.show({title: 'Build started', description: 'Watching the src folder', persistent: true})
              ctx.toast.show({title: 'Lint passed', variant: 'success', persistent: true})
              ctx.toast.show({title: 'Deploy failed', variant: 'error', persistent: true})
              ctx.toast.show({
                title: 'Tests queued',
                persistent: true,
                actions: [{label: 'Run tests now', run: () => (answer.textContent = 'Tests started')}],
              })
            }),
            details,
            note,
            answer,
          )
          return root
        },
      })

      ctx.add(SettingsPage, {
        id: 'deploy-targets',
        title: 'Deploy targets',
        render: () => text('Ship to staging first'),
      })

      ctx.add(SettingsPage, {
        id: 'deploy-notes',
        page: 'general',
        title: 'Deploy notes',
        render: () => text('Deploy notes live here'),
      })
    },
  }),
}
