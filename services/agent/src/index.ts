import { VoltAgent, Memory, InMemoryStorageAdapter } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { quickAnalysisAgent } from './agents/quick-analysis'
import { chanAnalystAgent } from './agents/chan-analyst'
import { startAnalysisWorker } from './worker'

const logger = createPinoLogger({
  name: 'trading-agent',
  level: 'info',
})

new VoltAgent({
  agents: { quickAnalysisAgent, chanAnalystAgent },
  logger,
  memory: new Memory({ storage: new InMemoryStorageAdapter() }),
  server: honoServer({
    port: 3141,
  }),
})

if (process.env.START_WORKER !== 'false') {
  startAnalysisWorker()
  console.log('Analysis worker started')
}
