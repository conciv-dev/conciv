import {mark, type Param, type ReadCLI, type Transform} from '@bomb.sh/router'

type AnyParam = Param<string, unknown, 'one'> | Param<string, unknown, 'many'>

interface SameParam extends Transform {
  readonly input: AnyParam
  readonly output: this['input']
}

export const dashValue = mark<SameParam>((param: AnyParam): AnyParam => ({
  ...param,
  cli: {...param.cli, read: dashed(param.cli.read)},
}))

function dashed(read: ReadCLI): ReadCLI {
  return (tokens) => {
    const plain = read(tokens)
    const [bare] = plain.claim.tokens
    if (plain.result.ok || bare === undefined) return plain
    const pair = tokens.claimPair(
      (flag, value) => flag.index === bare.index && value.type === 'flag' && value.flagType === 'short',
    )
    const [, value] = pair.tokens
    if (value === undefined) return plain
    return {claim: pair, result: {ok: true, value: {exists: true, value: value.text}}}
  }
}
