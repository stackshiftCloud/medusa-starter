# StackShift Paystack provider for Medusa v2

Register `@stackshift-cloud/medusa-payment-paystack` in the providers list of
Medusa's Payment Module. It implements checkout initialization, reconciliation,
capture confirmation, refunds, safe updates, and signed webhook handling.

Required option: `secret_key`. Set `webhook_secret` when webhook signing uses a
different secret. Checkout creation is idempotent through a deterministic,
Paystack-valid transaction reference. Refund retries are reconciled through a
Medusa refund ID stored in `merchant_note` before a new refund is submitted.

Paystack hosted checkout captures successful charges immediately. Medusa's
capture operation therefore verifies the captured gateway state rather than
issuing a second charge. Paystack doesn't expose cancellation of an unpaid
hosted checkout, so cancellation is recorded locally only after verification
that the transaction wasn't captured. Paystack also doesn't document an atomic
refund idempotency key; concurrent refund requests still rely on Medusa's
single-operation guarantee in addition to the provider's read-before-create
reconciliation.
