declare module '@bramus/specificity' {
  export type SpecificityObject = {a: number; b: number; c: number}
  const Specificity: {
    calculate(selector: string): {toObject(): SpecificityObject}[]
    compare(s1: SpecificityObject, s2: SpecificityObject): number
  }
  export default Specificity
}
