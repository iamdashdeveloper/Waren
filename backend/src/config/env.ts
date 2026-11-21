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

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Add it to backend/.env.")
}

export const env = {
  databaseUrl,
  port: readInteger("PORT", 3000),
  host: process.env.HOST?.trim() || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV?.trim() || "development",
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
}
