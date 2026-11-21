import type { FastifyInstance, FastifyRequest } from "fastify"
import {
  createEmergencyWaterIsochrone,
  getWaterPointAnalysisMetadata,
  IsochroneError,
} from "../services/isochrone.js"

type IsochroneBody = {
  waterPointId?: unknown
  contours?: unknown
  profile?: unknown
  confirmUnverifiedStatus?: unknown
}

function validateRequest(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new IsochroneError("A JSON request body is required.", 400)
  }
  const request = body as IsochroneBody
  if (
    typeof request.waterPointId !== "string" ||
    request.waterPointId.trim().length === 0 ||
    request.waterPointId.trim().length > 200 ||
    /[\u0000-\u001f]/.test(request.waterPointId)
  ) {
    throw new IsochroneError(
      "waterPointId must be a non-empty water-point identifier of at most 200 characters.",
      400,
    )
  }
  if (
    request.profile !== undefined &&
    request.profile !== "foot-walking"
  ) {
    throw new IsochroneError(
      "Only the foot-walking profile is supported.",
      400,
    )
  }
  if (
    request.confirmUnverifiedStatus !== undefined &&
    typeof request.confirmUnverifiedStatus !== "boolean"
  ) {
    throw new IsochroneError(
      "confirmUnverifiedStatus must be a boolean.",
      400,
    )
  }

  const contours = request.contours ?? [300, 600, 900]
  if (
    !Array.isArray(contours) ||
    contours.length === 0 ||
    contours.length > 5 ||
    contours.some(
      (contour) =>
        !Number.isInteger(contour) || Number(contour) < 60 || Number(contour) > 3600,
    )
  ) {
    throw new IsochroneError(
      "contours must contain 1 to 5 whole-number walking times between 60 and 3600 seconds.",
      400,
    )
  }
  const validatedContours = contours as number[]
  if (
    new Set(validatedContours).size !== validatedContours.length ||
    validatedContours.some(
      (contour, index) =>
        index > 0 && contour <= validatedContours[index - 1]!,
    )
  ) {
    throw new IsochroneError(
      "contours must be unique and sorted in ascending order.",
      400,
    )
  }
  return {
    waterPointId: request.waterPointId.trim(),
    contours: validatedContours,
    confirmUnverifiedStatus: request.confirmUnverifiedStatus === true,
  }
}

export async function analysisRoutes(app: FastifyInstance) {
  app.get("/api/analysis/water-points/metadata", async (_request, reply) => {
    try {
      return await getWaterPointAnalysisMetadata()
    } catch (error) {
      if (error instanceof IsochroneError) {
        return reply.code(error.statusCode).send({
          status: "error",
          message: error.message,
        })
      }
      app.log.error({ err: error }, "Unable to discover tap identifier metadata.")
      return reply.code(500).send({
        status: "error",
        message: "Unable to discover water-point dataset metadata.",
      })
    }
  })

  app.post(
    "/api/analysis/isochrone",
    async (request: FastifyRequest<{ Body: IsochroneBody }>, reply) => {
      try {
        const { waterPointId, contours, confirmUnverifiedStatus } =
          validateRequest(request.body)
        return await createEmergencyWaterIsochrone(
          waterPointId,
          contours,
          confirmUnverifiedStatus,
        )
      } catch (error) {
        if (error instanceof IsochroneError) {
          if (error.retryAfter) reply.header("Retry-After", error.retryAfter)
          return reply.code(error.statusCode).send({
            status: "error",
            message: error.message,
          })
        }
        request.log.error({ err: error }, "Emergency water isochrone failed.")
        return reply.code(500).send({
          status: "error",
          message: "Unable to generate an isochrone.",
        })
      }
    },
  )
}
