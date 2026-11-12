import {createRoot} from 'react-dom/client'
import {App} from './App'
import '../../lib/lib.css'
import './styles.css'

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
