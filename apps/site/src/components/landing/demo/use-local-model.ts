import {useRef, useState} from 'react'
import {DEFAULT_MODEL, type ModelWorkerResponse, type RunResult} from './models'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

type Pending = {resolve: (result: RunResult) => void; reject: (error: unknown) => void}

export function useLocalModel() {
  const [status, setStatus] = useState<ModelStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [device, setDevice] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(DEFAULT_MODEL)

  const workerRef = useRef<Worker | null>(null)
  const loadedRef = useRef<string | null>(null)
  const pending = useRef(new Map<number, Pending>())
  const idRef = useRef(0)

  const ensureWorker = () => {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(new URL('./model.worker.ts', import.meta.url), {type: 'module'})
    const files: Record<string, number> = {}
    worker.addEventListener('message', (event: MessageEvent<ModelWorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        files[message.file] = Math.round(message.progress)
        const values = Object.values(files)
        setPercent(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length))
        return
      }
      if (message.type === 'ready') {
        loadedRef.current = message.modelId
        setDevice(message.device)
        setStatus('ready')
        return
      }
      if (message.type === 'load-error') {
        setError(message.error)
        setStatus('error')
        return
      }
      if (message.type === 'result') {
        pending.current
          .get(message.id)
          ?.resolve({patch: message.patch, text: message.text, ms: message.ms, raw: message.raw})
        pending.current.delete(message.id)
        return
      }
      pending.current.get(message.id)?.reject(new Error(message.error))
      pending.current.delete(message.id)
    })
    workerRef.current = worker
    return worker
  }

  const startLoad = (modelId: string) => {
    setStatus('loading')
    setPercent(0)
    setError('')
    ensureWorker().postMessage({type: 'load', modelId})
  }

  const load = () => {
    if (status === 'loading') return
    if (status === 'ready' && loadedRef.current === selected) return
    startLoad(selected)
  }

  const choose = (modelId: string) => setSelected(modelId)

  const run = (html: string, instruction: string): Promise<RunResult> => {
    const worker = ensureWorker()
    const id = ++idRef.current
    return new Promise<RunResult>((resolve, reject) => {
      pending.current.set(id, {resolve, reject})
      worker.postMessage({type: 'run', id, html, instruction})
    })
  }

  return {status, percent, device, error, selected, load, choose, run}
}
