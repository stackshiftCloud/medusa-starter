# StackShift Flutterwave provider for Medusa v2

Register this package in Medusa's Payment Module providers list. It implements
hosted-checkout initialization, status reconciliation, capture confirmation,
refunds, safe updates, idempotency forwarding, and signed webhook handling.

Required options are `secret_key`, `webhook_secret`, and `redirect_url`.
Webhook verification supports Flutterwave's HMAC signature and the legacy
`verif-hash` header without disabling signature checks.

Flutterwave Standard captures successful hosted-checkout payments immediately,
so Medusa capture confirms the verified transaction and never charges twice.
The Standard API doesn't expose cancellation of an unpaid checkout; the
provider records cancellation locally only after checking that no capture
occurred. Initialization uses both a deterministic `tx_ref` and a normalized
`X-Idempotency-Key`; refunds forward Medusa's unique refund ID in the same
header. Gateway-side handling of that header depends on the configured
Flutterwave API version, while Medusa remains the durable operation authority.
