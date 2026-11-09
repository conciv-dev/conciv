import {createRoot} from 'react-dom/client'
import {App} from './App'
import '../../../lib/lib.css'
import './styles.css'
import {serveXraySample} from './xray-sample'

const params = new URLSearchParams(location.search)
if (params.get('variant') === 'xray') serveXraySample(params.get('state'))

const root = document.getElementById('root')
if (root) createRoot(root).render(<App data-conciv-key="H-3yQA" />)
