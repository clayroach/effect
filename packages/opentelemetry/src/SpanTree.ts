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
import type * as ConfigError from "effect/ConfigError"
import type * as Duration from "effect/Duration"
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Tracer from "effect/Tracer"
import * as internal from "./internal/spanTree.js"
import type { OtelTracer } from "./Tracer.js"

import type { SpanTree, SpanTreeConfig, SpanTreeService } from "./SpanTreeTag.js"

/**
 * Re-export types and SpanTree class from SpanTreeTag
 *
 * @since 1.0.0
 * @category re-exports
 */
export {
  /**
   * @since 1.0.0
   */
  type SpanInfo,
  /**
   * @since 1.0.0
   */
  SpanTree,
  /**
   * @since 1.0.0
   */
  type SpanTreeConfig,
  /**
   * @since 1.0.0
   */
  type SpanTreeMemoryStats,
  /**
   * @since 1.0.0
   */
  type SpanTreeService,
  /**
   * @since 1.0.0
   */
  type SpanTreeStats,
  /**
   * @since 1.0.0
   */
  type TraceSummary
} from "./SpanTreeTag.js"

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
  export interface Service extends SpanTreeService {}
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
 * @since 1.0.0
 * @category combinators
 */
export const withSummary: <A, E, R>(
  effect: Effect.Effect<A, E, R>
) => Effect.Effect<A, E, R | SpanTree> = internal.withSummary
