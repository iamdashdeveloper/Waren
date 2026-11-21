import type { FastifyInstance, FastifyRequest } from "fastify"
import {
  createEmergencyWaterIsochrone,
  getWaterPointAnalysisMetadata,
  IsochroneError,
} from "../services/isochrone.js"
import {
  generateEmergencyCoverage,
  getEmergencyAreaDetails,
  rankEmergencyAlternatives,
  resolveExistingWaterPoint,
  type EmergencyAreaReference,
} from "../services/emergency-planning.js"

type IsochroneBody = {
  waterPointId?: unknown
  origin?: unknown
  contours?: unknown
  profile?: unknown
  confirmUnverifiedStatus?: unknown
}

type EmergencyAreaBody = {
  schema?: unknown
  table?: unknown
  serviceCode?: unknown
}

type EmergencyRankingBody = EmergencyAreaBody & {
  affectedTapIds?: unknown
  alternativeTapIds?: unknown
  confirmedTankIds?: unknown
}

type EmergencyCoverageBody = EmergencyRankingBody & {
  contours?: unknown
}

function validateAreaReference(body: unknown): EmergencyAreaReference {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new IsochroneError("A JSON request body is required.", 400)
  }
  const request = body as EmergencyAreaBody
  if (
    typeof request.schema !== "string" ||
    request.schema.trim().length === 0 ||
    request.schema.length > 200 ||
    typeof request.table !== "string" ||
    request.table.trim().length === 0 ||
    request.table.length > 200 ||
    typeof request.serviceCode !== "string" ||
    request.serviceCode.trim().length === 0 ||
    request.serviceCode.length > 200
  ) {
    throw new IsochroneError(
      "schema, table, and serviceCode must be non-empty strings.",
      400,
    )
  }
  return {
    schema: request.schema.trim(),
    table: request.table.trim(),
    serviceCode: request.serviceCode.trim(),
  }
}

function validateIdentifierArray(value: unknown, name: string) {
  if (
    value === undefined ||
    !Array.isArray(value) ||
    value.some(
      (id) => typeof id !== "string" || !id.trim() || id.length > 200,
    )
  ) {
    throw new IsochroneError(`${name} must be an array of point IDs.`, 400)
  }
  return value as string[]
}

function validateRequest(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new IsochroneError("A JSON request body is required.", 400)
  }
  const request = body as IsochroneBody
  const origin: unknown = request.origin ??
    (typeof request.waterPointId === "string"
      ? { id: request.waterPointId, source: "tap" }
      : undefined)
  if (typeof origin !== "object" || origin === null || Array.isArray(origin)) {
    throw new IsochroneError(
      "origin must be a selected map point or an existing waterPointId.",
      400,
    )
  }
  const originValue = origin as {
    id?: unknown
    coordinates?: unknown
    block?: unknown
    operationalStatus?: unknown
    source?: unknown
    label?: unknown
  }
  const id = typeof originValue.id === "string" && originValue.id.trim()
    ? originValue.id.trim().slice(0, 200)
    : ""
  const source: "tap" | "tank" | "borehole" | "map" =
    originValue.source === "tap" ||
    originValue.source === "tank" ||
    originValue.source === "borehole"
      ? originValue.source
      : "map"
  let coordinates: [number, number] | null = null
  if (source === "map") {
    if (!Array.isArray(originValue.coordinates) || originValue.coordinates.length !== 2) {
      throw new IsochroneError(
        "Map origins must contain [longitude, latitude] coordinates.",
        400,
      )
    }
    const longitude = Number(originValue.coordinates[0])
    const latitude = Number(originValue.coordinates[1])
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new IsochroneError(
        "origin.coordinates contain invalid geographic coordinates.",
        400,
      )
    }
    coordinates = [longitude, latitude]
  } else if (!id) {
    throw new IsochroneError(
      "An existing infrastructure origin requires its database ID.",
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
    origin: {
      id,
      coordinates,
      block: typeof originValue.block === "string" ? originValue.block : null,
      operationalStatus:
        typeof originValue.operationalStatus === "string"
          ? originValue.operationalStatus
          : null,
      source,
      label: typeof originValue.label === "string" ? originValue.label : null,
    },
    contours: validatedContours,
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
        const { origin: requestedOrigin, contours } = validateRequest(request.body)
        const origin = requestedOrigin.source === "map"
          ? {
              ...requestedOrigin,
              id: requestedOrigin.id ||
                `map-point-${requestedOrigin.coordinates![0].toFixed(6)}-${requestedOrigin.coordinates![1].toFixed(6)}`,
              coordinates: requestedOrigin.coordinates!,
            }
          : await resolveExistingWaterPoint(
              requestedOrigin.source,
              requestedOrigin.id,
            )
        return await createEmergencyWaterIsochrone(origin, contours)
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

  app.post(
    "/api/analysis/emergency-area",
    async (request: FastifyRequest<{ Body: EmergencyAreaBody }>, reply) => {
      try {
        return await getEmergencyAreaDetails(validateAreaReference(request.body))
      } catch (error) {
        if (error instanceof IsochroneError) {
          return reply.code(error.statusCode).send({
            status: "error",
            message: error.message,
          })
        }
        request.log.error({ err: error }, "Emergency area discovery failed.")
        return reply.code(500).send({
          status: "error",
          message: "Unable to load points for the selected polygon.",
        })
      }
    },
  )

  app.post(
    "/api/analysis/emergency-rankings",
    async (request: FastifyRequest<{ Body: EmergencyRankingBody }>, reply) => {
      try {
        const reference = validateAreaReference(request.body)
        const body = request.body as EmergencyRankingBody
        const affectedTapIds = validateIdentifierArray(
          body.affectedTapIds,
          "affectedTapIds",
        )
        const alternativeTapIds = validateIdentifierArray(
          body.alternativeTapIds,
          "alternativeTapIds",
        )
        const confirmedTankIds = validateIdentifierArray(
          body.confirmedTankIds,
          "confirmedTankIds",
        )
        return {
          rankings: await rankEmergencyAlternatives(
            reference,
            affectedTapIds,
            alternativeTapIds,
            confirmedTankIds,
          ),
        }
      } catch (error) {
        if (error instanceof IsochroneError) {
          if (error.retryAfter) reply.header("Retry-After", error.retryAfter)
          return reply.code(error.statusCode).send({
            status: "error",
            message: error.message,
          })
        }
        request.log.error({ err: error }, "Emergency alternative ranking failed.")
        return reply.code(500).send({
          status: "error",
          message: "Unable to rank emergency water alternatives.",
        })
      }
    },
  )

  app.post(
    "/api/analysis/emergency-coverage",
    async (request: FastifyRequest<{ Body: EmergencyCoverageBody }>, reply) => {
      try {
        const reference = validateAreaReference(request.body)
        const body = request.body as EmergencyCoverageBody
        const alternativeTapIds = validateIdentifierArray(
          body.alternativeTapIds,
          "alternativeTapIds",
        )
        const confirmedTankIds = validateIdentifierArray(
          body.confirmedTankIds,
          "confirmedTankIds",
        )
        const contours = body.contours ?? [300, 600, 900]
        if (
          !Array.isArray(contours) ||
          contours.some((value) => !Number.isInteger(value))
        ) {
          throw new IsochroneError(
            "contours must be an array of whole-number seconds.",
            400,
          )
        }
        return await generateEmergencyCoverage(
          reference,
          alternativeTapIds,
          confirmedTankIds,
          contours as number[],
        )
      } catch (error) {
        if (error instanceof IsochroneError) {
          if (error.retryAfter) reply.header("Retry-After", error.retryAfter)
          return reply.code(error.statusCode).send({
            status: "error",
            message: error.message,
          })
        }
        request.log.error({ err: error }, "Emergency coverage generation failed.")
        return reply.code(500).send({
          status: "error",
          message: "Unable to generate emergency coverage.",
        })
      }
    },
  )
}
