import { env } from "./config/env.js"
import { buildApp } from "./app.js"

const app = buildApp()

let shuttingDown = false
const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, "Shutting down the WAREN API server.")
  try {
    await app.close()
  } catch (error) {
    app.log.error({ err: error }, "Failed to shut down the WAREN API server cleanly.")
    process.exitCode = 1
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"))
process.once("SIGTERM", () => void shutdown("SIGTERM"))

try {
  await app.listen({ host: env.host, port: env.port })
} catch (error) {
  app.log.error({ err: error }, "Failed to start the WAREN API server.")
  await app.close()
  process.exitCode = 1
}
