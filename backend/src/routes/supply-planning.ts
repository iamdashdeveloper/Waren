import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  createSupplyPlanningScenario,
  deleteSupplyPlanningScenario,
  getSupplyPlanningScenario,
  listSupplyPlanningScenarios,
  renameSupplyPlanningScenario,
  SupplyPlanningError,
  updateSupplyPlanningScenario,
} from "../services/supply-planning.js"

type ScenarioParams = {
  id: string
}

function handleScenarioError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  operation: string,
) {
  if (error instanceof SupplyPlanningError) {
    return reply.code(error.statusCode).send({
      status: "error",
      message: error.message,
    })
  }
  request.log.error({ err: error }, `Planning scenario ${operation} failed.`)
  return reply.code(500).send({
    status: "error",
    message: `Unable to ${operation} planning scenario.`,
  })
}

export async function supplyPlanningRoutes(app: FastifyInstance) {
  app.get("/api/analysis/supply-planning/scenarios", async (request, reply) => {
    try {
      return { scenarios: await listSupplyPlanningScenarios() }
    } catch (error) {
      return handleScenarioError(error, request, reply, "list")
    }
  })

  app.get<{ Params: ScenarioParams }>(
    "/api/analysis/supply-planning/scenarios/:id",
    async (request, reply) => {
      try {
        return {
          scenario: await getSupplyPlanningScenario(request.params.id),
        }
      } catch (error) {
        return handleScenarioError(error, request, reply, "load")
      }
    },
  )

  app.post<{ Body: unknown }>(
    "/api/analysis/supply-planning/scenarios",
    async (request, reply) => {
      try {
        const scenario = await createSupplyPlanningScenario(request.body)
        return reply.code(201).send({ scenario })
      } catch (error) {
        return handleScenarioError(error, request, reply, "save")
      }
    },
  )

  app.put<{ Params: ScenarioParams; Body: unknown }>(
    "/api/analysis/supply-planning/scenarios/:id",
    async (request, reply) => {
      try {
        return {
          scenario: await updateSupplyPlanningScenario(
            request.params.id,
            request.body,
          ),
        }
      } catch (error) {
        return handleScenarioError(error, request, reply, "update")
      }
    },
  )

  app.patch<{ Params: ScenarioParams; Body: unknown }>(
    "/api/analysis/supply-planning/scenarios/:id",
    async (request, reply) => {
      try {
        return {
          scenario: await renameSupplyPlanningScenario(
            request.params.id,
            request.body,
          ),
        }
      } catch (error) {
        return handleScenarioError(error, request, reply, "rename")
      }
    },
  )

  app.delete<{ Params: ScenarioParams }>(
    "/api/analysis/supply-planning/scenarios/:id",
    async (request, reply) => {
      try {
        await deleteSupplyPlanningScenario(request.params.id)
        return reply.send({ deleted: true })
      } catch (error) {
        return handleScenarioError(error, request, reply, "delete")
      }
    },
  )
}
