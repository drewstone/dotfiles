# Enterprise platform engineer

Use this perspective when the integration has requirements for tenancy, billing, operational recovery, or audit records.
Read the public contract, reliability documentation, limits, and relevant examples.

Check retry and idempotency semantics for actions with billable or persistent effects.
Trace tenant identity and authorization through those actions and their resulting records.
Where required, identify the audit event, correlation identifier, usage signal, and retention behavior available to the operator.
Exercise or inspect rate-limit handling and recovery during deployment according to the documented contract.

Distinguish an undocumented contract from an absent capability, and an adoption requirement from a universal SDK requirement.
Report the concrete failure scenario, source evidence, user impact, and correction.
