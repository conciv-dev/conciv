import type {ChatTheme} from '../theme-descriptor.js'
import jetbrainsMonoRegular from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?inline'
import jetbrainsMonoMedium from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?inline'
import jetbrainsMonoBold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?inline'
import archivoMedium from '@fontsource/archivo/files/archivo-latin-500-normal.woff2?inline'
import archivoSemibold from '@fontsource/archivo/files/archivo-latin-600-normal.woff2?inline'
import sourceSans3Regular from '@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff2?inline'
import sourceSans3Medium from '@fontsource/source-sans-3/files/source-sans-3-latin-500-normal.woff2?inline'
import sourceSans3Semibold from '@fontsource/source-sans-3/files/source-sans-3-latin-600-normal.woff2?inline'

export const terminalTheme: ChatTheme = {
  id: 'terminal',
  fonts: [
    {family: 'JetBrains Mono', weight: 400, src: jetbrainsMonoRegular},
    {family: 'JetBrains Mono', weight: 500, src: jetbrainsMonoMedium},
    {family: 'JetBrains Mono', weight: 700, src: jetbrainsMonoBold},
    {family: 'Archivo', weight: 500, src: archivoMedium},
    {family: 'Archivo', weight: 600, src: archivoSemibold},
    {family: 'Source Sans 3', weight: 400, src: sourceSans3Regular},
    {family: 'Source Sans 3', weight: 500, src: sourceSans3Medium},
    {family: 'Source Sans 3', weight: 600, src: sourceSans3Semibold},
  ],
}
