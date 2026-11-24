const {Plugin, Registry} = require('@conciv/plugin/experimental')

const PageOperation = Registry.define('page.operation')

module.exports = {
  default: Plugin.define({
    setup(ctx) {
      ctx.add(PageOperation, {
        name: 'basket.read',
        run: async () => ({plants: Array.from(document.querySelectorAll('#basket li'), (item) => item.textContent)}),
      })
      ctx.toast.show({title: 'Basket reader ready', persistent: true})
    },
  }),
}
