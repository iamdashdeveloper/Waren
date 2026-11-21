import type { FastifyInstance } from "fastify"
import { pool } from "../db/client.js"

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({
    status: "ok",
    service: "waren-api",
  }))

  app.get("/api/health/db", async (_request, reply) => {
    try {
      await pool.query("SELECT 1;")
      return { status: "ok", database: "connected" }
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? String(error.code)
          : "unknown"
      app.log.error({ code }, "Database health check failed.")
      return reply.code(503).send({
        status: "error",
        database: "disconnected",
      })
    }
  })
}
