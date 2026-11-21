import { env } from "./config/env.js"
import { buildApp } from "./app.js"

const app = buildApp()

try {
  await app.listen({ host: env.host, port: env.port })
} catch (error) {
  app.log.error("Failed to start the WAREN API server.")
  await app.close()
  process.exitCode = 1
}
