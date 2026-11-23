const {Plugin, Registry, Slot} = require('@conciv/plugin/experimental')

const concivCars = {$$type: '@conciv/Registry', version: 'v1', kind: 'registry', id: 'release.cars', access: 'conciv'}
const publicCars = Registry.define('release.cars')

module.exports = {
  default: Plugin.define({
    setup(ctx) {
      ctx.add(concivCars, 'first-party car')
      ctx.add(publicCars, 'third-party car')
      ctx.add(Slot, {
        at: 'session.status',
        render: () =>
          Object.assign(document.createElement('p'), {textContent: `Cars: ${ctx.list(concivCars).join(', ')}`}),
      })
    },
  }),
}
