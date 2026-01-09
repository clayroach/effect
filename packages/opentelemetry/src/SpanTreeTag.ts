/**
 * SpanTree service tag - shared between public and internal modules
 *
 * @since 1.0.0
 * @internal
 */
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"

// ============================================
// Types
// ============================================

/**
 * Configuration options for SpanTree
 *
 * @since 1.0.0
 * @category models
 */
export interface SpanTreeConfig {
  readonly ttl?: Duration.DurationInput
  readonly maxSpans?: number
  readonly maxTraces?: number
  readonly queueCapacity?: number
  readonly batchSize?: number
}

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
 * @since 1.0.0
 * @category models
 */
export interface SpanTreeMemoryStats {
  readonly totalBytes: number
  readonly spanRecordsBytes: number
  readonly traceIndexBytes: number
  readonly childRefsBytes: number
  readonly queueBytes: number
  readonly avgBytesPerSpan: number
  readonly capacityPercent: number
}

/**
 * Statistics for monitoring SpanTree health
 *
 * @since 1.0.0
 * @category models
 */
export interface SpanTreeStats {
  readonly spanCount: number
  readonly traceCount: number
  readonly queueSize: number
  readonly droppedEvents: number
  readonly version: number
  readonly memory: SpanTreeMemoryStats
}

// ============================================
// Service Interface
// ============================================

/**
 * SpanTree service interface - the public API for querying span trees
 *
 * @since 1.0.0
 * @category models
 */
export interface SpanTreeService {
  readonly getPath: (spanId: string) => Effect.Effect<ReadonlyArray<string>>
  readonly getDeepestPath: (traceId: string) => Effect.Effect<ReadonlyArray<string>>
  readonly getCurrentPath: Effect.Effect<ReadonlyArray<string>>
  readonly getTraceSummary: (traceId: string) => Effect.Effect<TraceSummary>
  readonly getTraceSpans: (traceId: string) => Effect.Effect<ReadonlyArray<SpanInfo>>
  readonly getLeafSpans: (traceId: string) => Effect.Effect<ReadonlyArray<SpanInfo>>
  readonly getMaxDepth: (traceId: string) => Effect.Effect<number>
  readonly getCurrentTraceId: Effect.Effect<string | null>
  readonly getCurrentSpanId: Effect.Effect<string | null>
  readonly getSpan: (spanId: string) => Effect.Effect<SpanInfo | undefined>
  readonly getChildren: (spanId: string) => Effect.Effect<ReadonlyArray<SpanInfo>>
  readonly isRunning: (spanId: string) => Effect.Effect<boolean>
  readonly flush: Effect.Effect<void>
  readonly stats: Effect.Effect<SpanTreeStats>
  readonly clear: (traceId: string) => Effect.Effect<void>
}

// ============================================
// Service Tag
// ============================================

/**
 * SpanTree service tag
 *
 * @since 1.0.0
 * @category tags
 */
export class SpanTree extends Effect.Tag("@effect/opentelemetry/SpanTree")<
  SpanTree,
  SpanTreeService
>() {}
