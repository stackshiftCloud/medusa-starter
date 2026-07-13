import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)

test("pins an LLB-native multi-process Medusa v2 starter", async () => {
  const manifest = JSON.parse(await readFile(new URL("starter.manifest.json", root), "utf8"))
  assert.match(manifest.medusa.supported_range, />=2\.11\.0/)
  assert.equal(manifest.build.strategy, "shiftpack")
  assert.equal(manifest.build.image_assembly, "buildkit-llb")
  assert.equal(manifest.build.dockerfile, null)
  assert.equal(manifest.medusa.version, "2.17.2")
  assert.equal(manifest.backend.root, "apps/backend")
  assert.equal(manifest.storefront.root, "apps/storefront")
  assert.equal(manifest.backend.template_commit, manifest.storefront.commit)
  assert.equal(manifest.backend.template_commit.length, 40)
  assert.equal(manifest.processes.release.once_per_revision, true)
  assert.equal(manifest.processes.web.environment.MEDUSA_WORKER_MODE, "server")
  assert.equal(manifest.processes.worker.environment.MEDUSA_WORKER_MODE, "worker")
})

test("contains no Dockerfile or container-build fallback", async () => {
  const forbiddenCommand = new RegExp(["docker", "build"].join("\\s+"), "i")
  for (const file of await files(root)) {
    assert.doesNotMatch(file.pathname.split("/").at(-1), /^Dockerfile/i)
    if (!/\.(json|md|mjs|ts|ya?ml)$/.test(file.pathname)) continue
    const source = await readFile(file, "utf8")
    assert.doesNotMatch(source, forbiddenCommand)
  }
})

test("wires the file provider to environment-scoped S3 gateway credentials", async () => {
  const config = await readFile(new URL("medusa-config.ts", root), "utf8")
  for (const variable of [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]) {
    assert.match(config, new RegExp(`process\\.env\\.${variable}`))
  }
  assert.match(config, /mode:\s*"s3"/)
  assert.doesNotMatch(config, /STACKSHIFT_ASSETS_API_KEY/)
})

test("probes every enabled managed provider without emitting secrets", async () => {
  const loader = await readFile(new URL("src/loaders/stackshift-observe.ts", root), "utf8")
  const probes = await readFile(new URL("src/lib/stackshift-provider-probes.ts", root), "utf8")
  for (const provider of ["storage", "mail", "paystack", "flutterwave"]) {
    assert.match(probes, new RegExp(`name:\\s*"${provider}"`))
  }
  assert.match(loader, /startStackShiftProviderProbes\(observer, process\.env\)/)
  assert.match(probes, /await probe\.check\(\)/)
  assert.match(probes, /recordProvider\(probe\.name, "ok"/)
  assert.match(probes, /recordProvider\(probe\.name, "unhealthy"/)
  assert.match(probes, /setInterval\(\(\) => void run\(\), intervalMs\)/)
  assert.match(probes, /revision,/)
  assert.doesNotMatch(probes, /recordProvider\([^\n]*(SECRET|TOKEN|API_KEY|PASSWORD)/)
})

test("rejects live payment keys in staging and preview configuration", async () => {
  const config = await readFile(new URL("medusa-config.ts", root), "utf8")
  assert.match(config, /STACKSHIFT_PAYMENT_MODE === "test"/)
  assert.match(config, /paymentSecret\("PAYSTACK_SECRET_KEY", "sk_test_"\)/)
  assert.match(config, /paymentSecret\("FLUTTERWAVE_SECRET_KEY", "FLWSECK_TEST-"\)/)
})

test("uses current Medusa Redis module exports", async () => {
  const config = await readFile(new URL("medusa-config.ts", root), "utf8")
  assert.match(config, /@medusajs\/medusa\/event-bus-redis/)
  assert.match(config, /@medusajs\/medusa\/workflow-engine-redis/)
  assert.match(config, /@medusajs\/medusa\/locking-redis/)
})

async function files(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".medusa"].includes(entry.name)) continue
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory)
    if (entry.isDirectory()) result.push(...await files(target))
    else result.push(target)
  }
  return result
}
