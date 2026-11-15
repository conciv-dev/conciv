declare module 'picomatch' {
  const picomatch: {
    readonly makeRe: (glob: string, options: {readonly dot: boolean; readonly windows: boolean}) => RegExp
  }
  export default picomatch
}
