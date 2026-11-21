import pg from "pg"
import { env } from "../config/env.js"

const { Pool } = pg

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: { rejectUnauthorized: true },
  max: 10,
  connectionTimeoutMillis: 10_000,
})

pool.on("error", (error) => {
  const code = "code" in error ? String(error.code) : "unknown"
  console.error("Unexpected PostgreSQL pool error.", code)
})
