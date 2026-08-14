import type {InitOutput} from '../../src/init/wizard.js'

export function recorderOutput(events: string[]): InitOutput {
  return {
    intro: (title) => {
      events.push(`intro:${title}`)
    },
    spinner: (message) => {
      events.push(`spin:${message}`)
      return {
        stop: (summary) => {
          events.push(`spin-stop:${summary}`)
        },
        fail: (summary) => {
          events.push(`spin-fail:${summary}`)
        },
      }
    },
    plan: (body) => {
      events.push(`plan:${body}`)
    },
    step: (title) => {
      events.push(`step:${title}`)
      return {
        line: (text) => {
          events.push(`stepline:${text}`)
        },
        settle: (result) => {
          events.push(`settle:${result.status}:${result.summary}`)
        },
      }
    },
    note: (payload) => {
      events.push(`note:${payload.title}:${payload.body}`)
    },
    line: (text) => {
      events.push(`line:${text}`)
    },
    success: (message) => {
      events.push(`success:${message}`)
    },
    warn: (message) => {
      events.push(`warn:${message}`)
    },
    error: (message) => {
      events.push(`error:${message}`)
    },
    cancelled: (message) => {
      events.push(`cancel:${message}`)
    },
    outro: (message) => {
      events.push(`outro:${message}`)
    },
    failure: (message) => {
      events.push(`failure:${message}`)
    },
  }
}
