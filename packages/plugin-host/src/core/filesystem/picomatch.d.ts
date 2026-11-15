declare module 'picomatch' {
  const picomatch: {readonly makeRe: (glob: string, options: {readonly dot: boolean}) => RegExp}
  export default picomatch
}
