import cors from "@fastify/cors"
import Fastify, { type FastifyError } from "fastify"
import { env } from "./config/env.js"
import { pool } from "./db/client.js"
import { dataRoutes } from "./routes/data.js"
import { healthRoutes } from "./routes/health.js"
import { analysisRoutes } from "./routes/analysis.js"
import { supplyPlanningRoutes } from "./routes/supply-planning.js"
import { SpatialDataError } from "./services/data.js"

export function buildApp() {
  const app = Fastify({ logger: true })

  app.register(cors, {
    origin: env.corsOrigins,
  })
  app.register(healthRoutes)
  app.register(dataRoutes)
  app.register(analysisRoutes)
  app.register(supplyPlanningRoutes)

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof SpatialDataError) {
      return reply.code(error.statusCode).send({
        status: "error",
        message: error.message,
      })
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        status: "error",
        message: error.message,
      })
    }

    const code =
      error instanceof Error && "code" in error ? String(error.code) : "unknown"
    request.log.error({ code }, "Request failed.")
    return reply.code(500).send({
      status: "error",
      message: "Internal server error.",
    })
  })

  app.addHook("onClose", async () => {
    await pool.end()
  })

  return app
}
