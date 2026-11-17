import {html} from 'js-beautify/js/lib/beautifier.js'

export function formatHtml(src: string): string {
  try {
    return html(src, {indent_size: 2, wrap_line_length: 0, preserve_newlines: false})
  } catch {
    return src
  }
}
