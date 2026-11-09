import {defineConfig} from 'vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [tanstackRouter({target: 'solid', autoCodeSplitting: false}), UnoCSS(), solidPlugin()],
})
