import './style.css'
import {setupCounter} from './counter.ts'

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)
