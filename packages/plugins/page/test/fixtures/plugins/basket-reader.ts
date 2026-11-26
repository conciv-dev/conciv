import {Plugin} from '@conciv/frontend-plugin-api'
import {PageOperation} from '@conciv/frontend-plugin-api/page'

export default Plugin.define({
  setup(ctx) {
    ctx.add(PageOperation, {
      name: 'basket.read',
      run: async () => ({plants: Array.from(document.querySelectorAll('#basket li'), (item) => item.textContent)}),
    })
    ctx.toast.show({title: 'Basket reader ready', persistent: true})
  },
})
