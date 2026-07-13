# StackShift Medusa observability

This dependency-free package emits worker heartbeats, queue depth/age/latency,
release events, and provider health to StackShift. `createHealthHandler` adds an
enriched `/health` route with pluggable PostgreSQL and Redis checks.

Telemetry delivery is fail-open for the commerce process: failures mark health
as degraded and prevent blind autoscaler scale-down without crashing Medusa.
Provider and release metadata are recursively redacted before transmission.
