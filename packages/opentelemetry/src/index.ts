/**
 * @since 1.0.0
 */
export * as Logger from "./Logger.js"

/**
 * @since 1.0.0
 */
export * as Metrics from "./Metrics.js"

/**
 * @since 1.0.0
 */
export * as NodeSdk from "./NodeSdk.js"

/**
 * @since 1.0.0
 */
export * as Otlp from "./Otlp.js"

/**
 * @since 1.0.0
 */
export * as OtlpLogger from "./OtlpLogger.js"

/**
 * @since 1.0.0
 */
export * as OtlpMetrics from "./OtlpMetrics.js"

/**
 * @since 1.0.0
 */
export * as OtlpResource from "./OtlpResource.js"

/**
 * @since 1.0.0
 */
export * as OtlpTracer from "./OtlpTracer.js"

/**
 * @since 1.0.0
 */
export * as Resource from "./Resource.js"

/**
 * SpanTree - In-memory span tree with query API
 *
 * Exposes span hierarchy to application code at runtime, enabling queries like
 * "what's the deepest span path in this trace?" even after inner spans have ended.
 *
 * This solves the architectural gap where spans exist but aren't queryable at
 * runtime by application code - particularly useful in `Effect.ensuring()` callbacks.
 *
 * @since 1.0.0
 */
export * as SpanTree from "./SpanTree.js"

/**
 * SpanTree service tag - shared between public and internal modules
 *
 * @since 1.0.0
 * @internal
 */
export * as SpanTreeTag from "./SpanTreeTag.js"

/**
 * @since 1.0.0
 */
export * as Tracer from "./Tracer.js"

/**
 * @since 1.0.0
 */
export * as WebSdk from "./WebSdk.js"
