---
"@effect/opentelemetry": minor
---

Add SpanTree module for in-memory span hierarchy querying.

SpanTree solves the use case from issue #5926: accessing the deepest span path from `Effect.ensuring()` callbacks. When using `Effect.ensuring()` to log span information, inner spans have already closed by the time the finalizer runs. SpanTree maintains an in-memory span tree with TTL-based cleanup, allowing queries like `getDeepestPath()` even after inner spans have ended.

Features:
- `SpanTree.layer()` - Create SpanTree service with configurable TTL, max spans/traces, and queue settings
- `SpanTree.layerTracer()` - Tracer that automatically records span events to SpanTree
- `SpanTree.layerMetrics()` - Export SpanTree memory/health metrics via OtlpMetrics
- Query APIs: `getPath`, `getDeepestPath`, `getTraceSummary`, `getTraceSpans`, `getLeafSpans`
- `SpanTree.withSummary()` - Convenience combinator to annotate spans with tree summary
- Memory management with configurable limits and TTL cleanup
