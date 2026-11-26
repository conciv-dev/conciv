import {onMount} from 'solid-js'
import {createStore} from 'solid-js/store'
import {DialogProvider, useDialog} from './dialog-stack'
import {PluginSelectDialog} from './dialogs'
import {ui} from './ui'

function PluginSelectStory() {
  const dialog = useDialog()
  const [store, setStore] = createStore({selected: 'Nothing selected'})

  const open = () =>
    dialog.show(() => (
      <PluginSelectDialog
        options={{
          title: 'Choose a destination',
          placeholder: 'Search destinations',
          options: [
            {title: 'Design notes', description: 'Research and references', group: 'Recent', value: 'design'},
            {title: 'Project roadmap', description: 'Upcoming milestones', group: 'Recent', value: 'roadmap'},
            {
              title: 'Engineering',
              description: 'Implementation and architecture',
              group: 'Teams',
              value: 'engineering',
            },
            {title: 'Product', description: 'Planning and feedback', group: 'Teams', value: 'product'},
            {title: 'Support', description: 'Customer questions', group: 'Teams', value: 'support'},
          ],
        }}
        done={(value) => {
          setStore('selected', value ?? 'Selection dismissed')
          dialog.close()
        }}
      />
    ))

  onMount(open)

  return (
    <div class="flex flex-col items-start gap-3">
      <ui.Button variant="neutral" onClick={open}>
        Open plugin selection dialog
      </ui.Button>
      <p role="status">{store.selected}</p>
    </div>
  )
}

export default {
  title: 'App/Dialogs/Plugin Selection',
  id: 'app-dialog-plugin-selection',
}

export const Default = {
  render: () => (
    <DialogProvider>
      <PluginSelectStory />
    </DialogProvider>
  ),
}
