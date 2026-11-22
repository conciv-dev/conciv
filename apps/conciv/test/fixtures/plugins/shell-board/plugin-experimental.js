const {z} = require('zod')
const {Panel, Plugin, SettingsPage, Slot, Store, useDrawer} = require('@conciv/plugin/experimental')

function button(label, run) {
  const element = Object.assign(document.createElement('button'), {type: 'button', textContent: label})
  element.addEventListener('click', () => void run())
  return element
}

function text(content) {
  return Object.assign(document.createElement('p'), {textContent: content})
}

const colours = [
  {title: 'Crimson', value: 'crimson'},
  {title: 'Teal', value: 'teal'},
  {title: 'Amber', value: 'amber'},
]

module.exports = {
  default: Plugin.define({
    stores: {
      desk: Store.global(z.object({covering: z.boolean()}), {covering: false}),
    },
    setup(ctx) {
      const desk = ctx.stores.desk
      const crash = {pending: ctx.options?.crash === true}
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

      ctx.add(Panel, {
        id: 'desk',
        region: 'pane',
        list: () => [{id: 'desk', title: 'Desk', pinned: true}],
        render: () => {
          if (crash.pending) {
            crash.pending = false
            throw new Error('the Desk tab fails on its first render')
          }
          const answer = document.createElement('p')
          const say = (content) => {
            answer.textContent = content
          }
          const root = document.createElement('div')
          root.append(
            button('Publish', async () =>
              say(
                `Publish confirmed: ${await ctx.dialogs.confirm({title: 'Publish the notes?', confirm: 'Publish now'})}`,
              ),
            ),
            button('Save', async () => {
              await ctx.dialogs.alert({title: 'Notes saved'})
              say('The save notice was closed')
            }),
            button('Rename', async () => say(`Named ${await ctx.dialogs.prompt({title: 'Name the notes'})}`)),
            button('Colour', async () =>
              say(`Picked ${await ctx.dialogs.select({title: 'Pick a colour', options: colours})}`),
            ),
            button('Cover the page', () => desk.set({covering: true})),
            answer,
          )
          return root
        },
      })

      ctx.add(Slot, {
        at: 'page.overlay',
        get hides() {
          return desk.value.covering
        },
        render: () => () =>
          desk.value.covering ? button('Uncover the page', () => desk.set({covering: false})) : null,
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
