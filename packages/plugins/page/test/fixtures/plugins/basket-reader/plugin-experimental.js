const {Plugin} = require('@conciv/frontend-plugin-api')
const {PageOperation} = require('@conciv/frontend-plugin-api/page')

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
