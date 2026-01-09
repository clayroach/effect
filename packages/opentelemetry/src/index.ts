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
 * @example
 * ```typescript
 * import { Effect, Layer } from "effect"
 * import * as SpanTree from "@effect/opentelemetry/SpanTree"
 *
 * const program = Effect.gen(function*() {
 *   const spanTree = yield* SpanTree.SpanTree
 *
 *   yield* Effect.withSpan("parent")(
 *     Effect.gen(function*() {
 *       yield* Effect.withSpan("child")(Effect.sleep("100 millis"))
 *
 *       // Query after inner spans complete
 *       const traceId = yield* spanTree.getCurrentTraceId
 *       if (traceId) {
 *         yield* spanTree.flush
 *         const summary = yield* spanTree.getTraceSummary(traceId)
 *         console.log(`Deepest: ${summary.formattedPath}`)
 *       }
 *     })
 *   )
 * })
 *
 * const MainLayer = SpanTree.layerTracer().pipe(
 *   Layer.provide(Tracer.layerGlobal),
 *   Layer.provide(Resource.layer({ serviceName: "my-app" }))
 * )
 *
 * Effect.runPromise(program.pipe(Effect.provide(MainLayer)))
 * ```
 *
 * @since 1.0.0
 */
export * as SpanTree from "./SpanTree.js"

/**
 * SpanTree service tag - shared between public and internal modules
 *
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
