import {z} from 'zod'
import {argument, cli, command, description, name, option, route, schema} from '@bomb.sh/router'
import {makeRpcClient} from '@conciv/client'
import {envelopeFlag, type CliOutcome} from './envelope.js'
import {engineOrigin} from './engine-origin.js'
import {userFailure} from './failure.js'
import {engineAnswer} from './request.js'
import {handler} from './router/handler.js'

type PluginCallOptions = {rpcId: string; method: string; data?: string; cwd: string}

const CallModelSchema = z.object({rpcId: z.string().min(1), method: z.string().min(1), data: z.string().optional()})

function parsedData(data: string | undefined): unknown {
  if (data === undefined) return undefined
  try {
    return JSON.parse(data)
  } catch {
    throw userFailure(`--data is not JSON: ${data}`, {hint: `pass the method's input as JSON, for example --data '{}'`})
  }
}

async function runPluginCall(options: PluginCallOptions): Promise<CliOutcome> {
  const input = parsedData(options.data)
  const engine = await engineOrigin(options.cwd, process.env, null)
  const call = {rpcId: options.rpcId, method: options.method, ...(input === undefined ? {} : {input})}
  return {
    report: 'json',
    data: await engineAnswer(engine.origin, makeRpcClient(engine.origin, {token: engine.token}).plugin.invoke(call)),
  }
}

const callCommand = command(
  name('call'),
  description("Call a plugin's RPC method on the running conciv engine and print its output."),
  argument(name('rpcId'), description('the RPC id the plugin registered, for example test-runner'), schema(z.string())),
  argument(name('method'), description('the method to call, for example status'), schema(z.string())),
  option(
    name('data'),
    cli(['--data', '-d']),
    description("the method's input as JSON; omit it to send no input"),
    schema(z.string().optional()),
  ),
  envelopeFlag,
  handler((model) => runPluginCall({...CallModelSchema.parse(model), cwd: process.cwd()})),
)

export const pluginRoute = route(
  name('plugin'),
  description('Call the RPC methods a plugin registered on the running conciv engine.'),
  envelopeFlag,
  callCommand,
)
