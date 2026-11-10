import {join} from 'node:path'
import type {ExtensionDb} from '@conciv/extension'
import {designConfig} from '../../../shared/tolerances.js'
import type {designTables} from '../../tables.js'
import {openStore} from '../open-store.js'
import {storeTables} from '../store-tables.js'
import {storeArtifacts} from '../import/store-artifacts.js'
import {reportQueries} from '../report/queries.js'
import {renderWave} from '../report/render-wave.js'

export async function report(input: {db: ExtensionDb<ReturnType<typeof designTables>>; home: string; wave: string}) {
  const {db, home, wave} = input
  const queries = reportQueries(wave)
  const [summary = [], judged = []] = await Promise.all(queries.map((query) => db.read(query)))
  const bytes = Buffer.from(renderWave({wave, summary, judged}))
  const store = openStore(home)
  try {
    const path = store.orm.transaction(
      (tx) => {
        const [artifact] = storeArtifacts({
          tx,
          home,
          runId: null,
          folder: REPORTS,
          artifacts: [
            {
              kind: 'report',
              width: null,
              name: `${wave}.md`,
              bytes,
              lifetime: String(designConfig.runs.lifetimes.report),
            },
          ],
        })
        tx.insert(storeTables.reports)
          .values({
            wave,
            artifact_id: artifact?.artifactId,
            queries: queries.map((query) => ({...query, from: `design_${query.from}`})),
            at: Date.now(),
          })
          .run()
        return artifact?.path ?? ''
      },
      {behavior: 'immediate'},
    )
    return join(home, ARTIFACTS, path)
  } finally {
    store.close()
  }
}

const REPORTS = 'reports'

const ARTIFACTS = 'artifacts'
