const {z} = require('zod')
const {Panel, Plugin, Slot, Store} = require('@conciv/plugin/experimental')

function button(label, run) {
  const element = Object.assign(document.createElement('button'), {type: 'button', textContent: label})
  element.addEventListener('click', () => void run())
  return element
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
      const crash = {pending: true}

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
          const say = (text) => {
            answer.textContent = text
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
    },
  }),
}
