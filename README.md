# StackShift Medusa v2 starter overlay

This directory is the maintained, reviewable overlay used by StackShift's
one-click Medusa starter. The starter compositor uses Medusa's current unified
DTC monorepo, applies these production modules and scripts to `apps/backend`,
and retains its Next.js storefront in `apps/storefront`. The exact upstream
revision is pinned in `starter.manifest.json`.

The maintained backend overlay is TypeScript source only. JavaScript and
declaration files emitted by local TypeScript builds are not release inputs;
the compositor copies `.ts` sources and the production build emits runtime
JavaScript inside the build artifact.

The backend uses Shiftpack's native LLB build path and `.medusa/server` artifact.
There is intentionally no Dockerfile and no implicit Docker compatibility path.
The same immutable image runs the web and worker process groups; `release` runs
database migrations exactly once before either group receives the revision.

Production activation is environment-driven. StackShift injects isolated
PostgreSQL, Redis, Assets, Mail, telemetry, and generated secrets. Paystack and
Flutterwave remain disabled until merchant-owned keys are present. Preview
environments use mail sandboxing, test payment keys, and the safe preview seed,
which never copies customer or order data.

The composed workspace pins security remediations for vulnerable transitive
dependencies. CI regenerates the complete lockfile and rejects critical OSV
findings before the production bundle can be published.
