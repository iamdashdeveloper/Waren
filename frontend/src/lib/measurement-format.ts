const MISSING_VALUE = "Not recorded"

export function formatMeasurement(value: unknown, unit: string): string {
  if (value === null || value === undefined) return MISSING_VALUE

  const text = String(value).trim()
  if (!text) return MISSING_VALUE

  const numericValue = Number(text)
  if (/^[+-]?(?:nan|infinity)$/i.test(text)) return MISSING_VALUE
  return Number.isFinite(numericValue) ? `${text} ${unit}` : text
}
