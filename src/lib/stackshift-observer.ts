import { StackShiftMedusaObserver } from "@stackshift-cloud/medusa-observe"

let singleton: StackShiftMedusaObserver | undefined

export function stackshiftObserver(): StackShiftMedusaObserver | undefined {
  const apiKey = process.env.STACKSHIFT_TELEMETRY_TOKEN
  const environmentId = process.env.STACKSHIFT_ENVIRONMENT_ID
  if (!apiKey || !environmentId) return undefined
  singleton ??= new StackShiftMedusaObserver({
    api_key: apiKey,
    environment_id: environmentId,
    telemetry_url: process.env.STACKSHIFT_TELEMETRY_URL,
  })
  return singleton
}
