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
import type * as ConfigError from "effect/ConfigError"
import type * as Duration from "effect/Duration"
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Tracer from "effect/Tracer"
import * as internal from "./internal/spanTree.js"
import type { OtelTracer } from "./Tracer.js"

// ============================================
// Configuration
// ============================================

/**
 * Configuration options for SpanTree
 *
 * All fields are optional - sensible defaults are provided.
 * Only override the fields you need to customize.
 *
 * @example
 * ```typescript
 * // Use all defaults
 * SpanTree.layer()
 *
 * // Override specific values
 * SpanTree.layer({
 *   ttl: Duration.minutes(1),
 *   maxSpans: 50000
 * })
 * ```
 *
 * @since 1.0.0
 * @category models
 */
export interface SpanTreeConfig {
  /**
   * Keep span data for this duration after trace ends.
   * Traces are cleaned up after all spans end + this TTL elapses.
   *
   * @default Duration.seconds(30)
   */
  readonly ttl?: Duration.DurationInput

  /**
   * Maximum number of spans to track across all traces.
   * When exceeded, oldest traces are evicted (LRU).
   *
   * @default 10000
   */
  readonly maxSpans?: number

  /**
   * Maximum number of traces to track.
   * When exceeded, oldest traces are evicted (LRU).
   *
   * @default 1000
   */
  readonly maxTraces?: number

  /**
   * Event queue capacity for async processing.
   * Uses sliding strategy - oldest events are dropped when full.
   * Monitor `span_tree.events.dropped` metric if you see drops.
   *
   * @default 1024
   */
  readonly queueCapacity?: number

  /**
   * Batch size for event processing.
   * Higher values = better throughput, lower values = lower latency.
   *
   * @default 100
   */
  readonly batchSize?: number
}

// ============================================
// Types
// ============================================

/**
 * Information about a single span in the tree
 *
 * @since 1.0.0
 * @category models
 */
export interface SpanInfo {
  readonly spanId: string
  readonly traceId: string
  readonly parentSpanId: string | undefined
  readonly name: string
  readonly startTime: bigint
  readonly endTime: bigint | undefined
  readonly status: "running" | "ended"
}

/**
 * Summary of a trace including its deepest path
 *
 * @since 1.0.0
 * @category models
 */
export interface TraceSummary {
  readonly traceId: string
  readonly path: ReadonlyArray<string>
  readonly formattedPath: string
  readonly depth: number
  readonly spanCount: number
}

/**
 * Detailed memory usage statistics for SpanTree
 *
 * These values are estimates based on JS object overhead calculations.
 * Useful for monitoring and capacity planning.
 *
 * @since 1.0.0
 * @category models
 */
export interface SpanTreeMemoryStats {
  /** Total estimated memory usage in bytes */
  readonly totalBytes: number
  /** Memory used by span records in bytes */
  readonly spanRecordsBytes: number
  /** Memory used by trace index in bytes */
  readonly traceIndexBytes: number
  /** Memory used by child reference sets in bytes */
  readonly childRefsBytes: number
  /** Memory used by event queue (pending events) in bytes */
  readonly queueBytes: number
  /** Average bytes per span (for capacity planning) */
  readonly avgBytesPerSpan: number
  /** Percentage of max capacity used */
  readonly capacityPercent: number
}

/**
 * Statistics for monitoring SpanTree health
 *
 * @since 1.0.0
 * @category models
 */
export interface SpanTreeStats {
  /** Number of spans currently tracked */
  readonly spanCount: number
  /** Number of traces currently tracked */
  readonly traceCount: number
  /** Number of pending events in queue */
  readonly queueSize: number
  /** Number of events dropped due to queue overflow */
  readonly droppedEvents: number
  /** State version (increments on each change) */
  readonly version: number
  /** Detailed memory usage statistics */
  readonly memory: SpanTreeMemoryStats
}

// ============================================
// Service
// ============================================

/**
 * SpanTree service tag
 *
 * @since 1.0.0
 * @category tags
 */
export const SpanTree: typeof internal.SpanTree = internal.SpanTree

/**
 * SpanTree service identifier type
 *
 * @since 1.0.0
 * @category tags
 */
export type SpanTree = internal.SpanTree

/**
 * @since 1.0.0
 * @category models
 */
export declare namespace SpanTree {
  /**
   * SpanTree service interface
   *
   * @since 1.0.0
   */
  export interface Service extends internal.SpanTreeService {}
}

// ============================================
// Layers
// ============================================

/**
 * Create a SpanTree layer with the specified configuration.
 *
 * @since 1.0.0
 * @category layers
 */
export const layer: (config?: SpanTreeConfig) => Layer.Layer<SpanTree> = internal.layer

/**
 * Create a SpanTree layer that reads configuration from environment/config.
 *
 * Environment variables:
 * - `SPAN_TREE_TTL`: TTL as duration (e.g., "30 seconds")
 * - `SPAN_TREE_MAX_SPANS`: Maximum spans (default: 10000)
 * - `SPAN_TREE_MAX_TRACES`: Maximum traces (default: 1000)
 * - `SPAN_TREE_QUEUE_CAPACITY`: Queue capacity (default: 1024)
 * - `SPAN_TREE_BATCH_SIZE`: Batch size (default: 100)
 *
 * @since 1.0.0
 * @category layers
 */
export const layerConfig: Layer.Layer<SpanTree, ConfigError.ConfigError> = internal.layerConfig

/**
 * Create a SpanTree layer with a Tracer that records span events.
 *
 * This wraps the OpenTelemetry tracer to intercept span lifecycle events
 * and record them to SpanTree for runtime querying. The wrapped tracer
 * is automatically set as the Effect tracer.
 *
 * @since 1.0.0
 * @category layers
 */
export const layerTracer: (
  config?: SpanTreeConfig
) => Layer.Layer<SpanTree, never, OtelTracer> = internal.layerTracer

// ============================================
// Constructors
// ============================================

/**
 * Create a Tracer that records span events to SpanTree.
 *
 * @since 1.0.0
 * @category constructors
 */
export const makeTracer: Effect.Effect<Tracer.Tracer, never, SpanTree | OtelTracer> = internal.makeTracer

// ============================================
// Configuration
// ============================================

/**
 * Configuration schema for SpanTree.
 * Can be used with Effect's Config module.
 *
 * @since 1.0.0
 * @category config
 */
export const config: typeof internal.spanTreeConfig = internal.spanTreeConfig

// ============================================
// Metrics
// ============================================

/**
 * Layer that periodically reports SpanTree metrics.
 * Metrics are automatically picked up by OtlpMetrics for export.
 *
 * Exported metrics:
 * - `span_tree.memory.bytes` - Total memory usage
 * - `span_tree.spans.count` - Number of spans tracked
 * - `span_tree.traces.count` - Number of traces tracked
 * - `span_tree.queue.size` - Pending events in queue
 * - `span_tree.events.dropped` - Events dropped due to backpressure
 * - `span_tree.capacity.percent` - Percentage of max capacity used
 *
 * @since 1.0.0
 * @category layers
 */
export const layerMetrics: (options?: {
  /** How often to update metrics (default: 10 seconds) */
  readonly interval?: Duration.DurationInput
}) => Layer.Layer<never, never, SpanTree> = internal.layerMetrics

// ============================================
// Convenience APIs
// ============================================

/**
 * Add span tree summary as attributes to the current span.
 * Useful in `Effect.ensuring()` callbacks.
 *
 * Adds attributes:
 * - `span_tree.depth` - Depth of deepest path
 * - `span_tree.path` - Formatted deepest path
 * - `span_tree.span_count` - Number of spans in trace
 *
 * @since 1.0.0
 * @category annotations
 */
export const annotateWithSummary: Effect.Effect<void, never, SpanTree> = internal.annotateWithSummary

/**
 * Wrap an effect to automatically add span tree summary on completion.
 *
 * @example
 * ```typescript
 * const program = SpanTree.withSummary(
 *   Effect.withSpan("operation")(myEffect)
 * )
 * ```
 *
 * @since 1.0.0
 * @category combinators
 */
export const withSummary: <A, E, R>(
  effect: Effect.Effect<A, E, R>
) => Effect.Effect<A, E, R | SpanTree> = internal.withSummary
