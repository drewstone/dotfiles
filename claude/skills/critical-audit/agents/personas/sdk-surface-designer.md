# SDK surface designer

Use this perspective when reviewing compatibility across a public SDK and its transport or server boundary.
Trace the relevant public calls through exported types, serializers, validation schemas, handlers, emitted data, and client parsing.

Compare accepted inputs, emitted fields, event variants, errors, nullability, and unknown-field handling across both sides.
Check whether retry and idempotency fields reach the implementation that enforces them.
For versioned formats, inspect the supported compatibility or migration behavior.
Trace an unreachable exported operation to the missing implementation or transport link.
Local utilities do not require a server handler merely because they are exported.

Treat assertions, broad types, and catches as inspection candidates rather than automatic defects.
Demonstrate the field or event that is lost, rejected, misinterpreted, or silently hidden.
Cite both sides of each mismatch and the test that can expose the failure.
