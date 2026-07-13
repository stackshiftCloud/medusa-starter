# StackShift Notification provider for Medusa v2

This email-channel provider sends through StackShift Mail. A Medusa template can
map to a managed StackShift template or to inline subject, HTML, and text. Inline
variables use `{{path.to.value}}`; HTML substitutions are escaped.

The provider derives a deterministic idempotency key when Medusa does not supply
one, classifies retryable API errors, and supports preview-environment recipient
redirection with `sandbox` and `sandbox_to`.
