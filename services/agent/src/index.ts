import { VoltAgent } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { quickAnalysisAgent } from './agents/quick-analysis'
import { startAnalysisWorker } from './worker'

const logger = createPinoLogger({
  name: 'trading-agent',
  level: 'info',
})

new VoltAgent({
  agents: { quickAnalysisAgent },
  logger,
  server: honoServer({
    port: 4001,
  }),
})

if (process.env.START_WORKER !== 'false') {
  startAnalysisWorker()
  console.log('Analysis worker started')
}
