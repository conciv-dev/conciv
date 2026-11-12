import {defineExtension} from '@conciv/extension'

function FixtureView() {
  const view = document.createElement('p')
  view.textContent = 'The fixture extension view'
  return view
}

export default defineExtension({
  name: 'fixture',
  views: [{id: 'fixture', label: 'Fixture', Component: FixtureView}],
}).client(() => ({value: {}}))
