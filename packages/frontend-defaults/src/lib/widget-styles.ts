import {once} from 'es-toolkit'
import base from '../styles.css?inline'
import utilities from 'virtual:uno.css?inline'
import {createStyleSheet} from '@internal/frontend-app-api/lib/style-sheet'

export const widgetStyles = `${base}${utilities}`

export const widgetSheet = once((): CSSStyleSheet => createStyleSheet(widgetStyles))
