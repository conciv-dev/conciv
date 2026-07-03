/// <reference lib="webworker" />
import {loadModel, instructionToPatch, getDevice} from './local-model'
import type {ModelWorkerRequest, ModelWorkerResponse} from './models'

const post = (message: ModelWorkerResponse) => (self as DedicatedWorkerGlobalScope).postMessage(message)

self.addEventListener('message', async (event: MessageEvent<ModelWorkerRequest>) => {
  const message = event.data
  if (message.type === 'load') {
    try {
      await loadModel(message.modelId, (progress) => post({type: 'progress', ...progress}))
      post({type: 'ready', device: getDevice(), modelId: message.modelId})
    } catch (error) {
      post({type: 'load-error', error: String(error)})
    }
    return
  }
  try {
    const result = await instructionToPatch(message.html, message.instruction)
    post({type: 'result', id: message.id, ...result})
  } catch (error) {
    post({type: 'run-error', id: message.id, error: String(error)})
  }
})
