import {defineCommand} from 'citty'
import {runAndPrint} from './request.js'

// `mandarax doctor` — run the source re-anchor sweep against the running dev server and print the
// report (the same sweep auto-runs on session_start). Thin command over the core endpoint.
export const doctorCommand = defineCommand({
  meta: {name: 'doctor', description: 'Re-anchor comment source links and report drift.'},
  run: () => runAndPrint({method: 'POST', path: '/api/canvas/doctor'}),
})
