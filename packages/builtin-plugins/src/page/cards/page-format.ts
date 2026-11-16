import {html} from '#js-beautify-html'

export function formatHtml(src: string): string {
  try {
    return html(src, {indent_size: 2, wrap_line_length: 0, preserve_newlines: false})
  } catch {
    return src
  }
}
