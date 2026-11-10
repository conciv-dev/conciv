import {createRoot} from 'react-dom/client'
import {App} from './App'
import {SiteHandPage, SiteKitPage} from './SitePage'
import '../../../lib/lib.css'
import './styles.css'
import {serveXraySample} from './xray-sample'

const params = new URLSearchParams(location.search)
const variant = params.get('variant') ?? ''
if (variant === 'xray') serveXraySample(params.get('state'))

const root = document.getElementById('root')
const pages: Record<string, typeof App> = {'site-kit': SiteKitPage, 'site-hand': SiteHandPage}
const Page = pages[variant] ?? App
if (root) createRoot(root).render(<Page data-conciv-key="H-3yQA" />)
