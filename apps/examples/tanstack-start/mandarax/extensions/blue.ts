// A file-based mandarax extension: discovered from mandarax/extensions/, applied to the live widget.
// Typed inline until @mandarax/widget ships a runtime defineExtension export (Slice 3).
type ClientApi = {ui: {setTheme: (tokens: Record<string, string>) => void}}

export default {
  id: 'blue',
  clientFn(mx: ClientApi) {
    mx.ui.setTheme({'pw-accent': 'rgb(37, 99, 235)'})
  },
}
