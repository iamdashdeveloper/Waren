import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const backendDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../")
dotenv.config({ path: resolve(backendDirectory, ".env"), quiet: true })

function readInteger(name: string, fallback: number): number {
  const rawValue = process.env[name]
  if (!rawValue) return fallback

  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`)
  }
  return value
}

const databaseUrlValue = process.env.DATABASE_URL?.trim()
if (!databaseUrlValue) {
  throw new Error("DATABASE_URL is required in the environment or backend/.env.")
}

let parsedDatabaseUrl: URL
try {
  parsedDatabaseUrl = new URL(databaseUrlValue)
} catch {
  throw new Error("DATABASE_URL must be a PostgreSQL connection URL.")
}
if (
  parsedDatabaseUrl.protocol !== "postgres:" &&
  parsedDatabaseUrl.protocol !== "postgresql:"
) {
  throw new Error("DATABASE_URL must use the postgres or postgresql protocol.")
}
parsedDatabaseUrl.searchParams.delete("sslmode")
const databaseUrl = parsedDatabaseUrl.toString()

const nodeEnv = process.env.NODE_ENV?.trim() || "development"
if (!["development", "test", "production"].includes(nodeEnv)) {
  throw new Error("NODE_ENV must be development, test, or production.")
}

const configuredCorsOrigins = process.env.CORS_ORIGIN?.trim()
if (nodeEnv === "production" && !configuredCorsOrigins) {
  throw new Error("CORS_ORIGIN must be set to the frontend origin in production.")
}

const corsOrigins =
  configuredCorsOrigins === "*"
    ? "*"
    : (configuredCorsOrigins || "http://localhost:5173")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)

if (corsOrigins !== "*") {
  if (corsOrigins.length === 0) {
    throw new Error("CORS_ORIGIN must include at least one frontend origin.")
  }

  for (const origin of corsOrigins) {
    let parsedOrigin: URL
    try {
      parsedOrigin = new URL(origin)
    } catch {
      throw new Error("CORS_ORIGIN must contain valid origin URLs.")
    }

    if (
      parsedOrigin.origin !== origin ||
      !["http:", "https:"].includes(parsedOrigin.protocol) ||
      (nodeEnv === "production" && parsedOrigin.protocol !== "https:")
    ) {
      throw new Error(
        "CORS_ORIGIN values must be exact origins without paths; production origins must use HTTPS. Use * to allow all origins.",
      )
    }
  }
}

const databaseSslModeValue =
  process.env.DATABASE_SSL_MODE?.trim() || "verify-full"
function isDatabaseSslMode(
  value: string,
): value is "verify-full" | "require" | "disable" {
  return value === "verify-full" || value === "require" || value === "disable"
}
if (!isDatabaseSslMode(databaseSslModeValue)) {
  throw new Error(
    "DATABASE_SSL_MODE must be verify-full, require, or disable.",
  )
}

export const env = {
  databaseUrl,
  databaseSslMode: databaseSslModeValue,
  port: readInteger("PORT", 3000),
  host: process.env.HOST?.trim() || "0.0.0.0",
  nodeEnv,
  corsOrigins,
}
