import {defineConcivPlugin} from '@conciv/extension/devframe-plugin'

function Panel() {
  throw new Error('the client half reached the server')
}

export default defineConcivPlugin({id: 'folder-plugin', title: 'Folder plugin'}).client({Component: Panel})
