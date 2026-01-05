/**
 * SpanTree internal implementation
 *
 * @internal
 */
import * as Chunk from "effect/Chunk"
import * as Config from "effect/Config"
import type * as ConfigError from "effect/ConfigError"
import * as Data from "effect/Data"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Metric from "effect/Metric"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Ref from "effect/Ref"
import * as Schedule from "effect/Schedule"
import * as Scope from "effect/Scope"
import * as SynchronizedRef from "effect/SynchronizedRef"
import * as EffectTracer from "effect/Tracer"
import * as Tracer from "../Tracer.js"

// ============================================
// Types (defined here, re-exported from SpanTree.ts)
// ============================================

/**
 * Configuration options for SpanTree
 * @internal
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
 * @internal
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
 * @internal
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
 * @internal
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
 * @internal
 */
export interface SpanTreeStats {
  readonly spanCount: number
  readonly traceCount: number
  readonly queueSize: number
  readonly droppedEvents: number
  readonly version: number
  readonly memory: SpanTreeMemoryStats
}

/**
 * SpanTree service interface
 * @internal
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
// Event Types
// ============================================

/** @internal */
export class SpanStarted extends Data.TaggedClass("SpanStarted")<{
  readonly spanId: string
  readonly traceId: string
  readonly parentSpanId: string | undefined
  readonly name: string
  readonly startTime: bigint
}> {}

/** @internal */
export class SpanEnded extends Data.TaggedClass("SpanEnded")<{
  readonly spanId: string
  readonly traceId: string
  readonly endTime: bigint
}> {}

/** @internal */
export type SpanEvent = SpanStarted | SpanEnded

// ============================================
// Internal State Types
// ============================================

interface SpanRecord {
  readonly spanId: string
  readonly traceId: string
  readonly parentSpanId: string | undefined
  readonly name: string
  readonly startTime: bigint
  readonly endTime: bigint | undefined
  readonly status: "running" | "ended"
  readonly children: ReadonlySet<string>
}

interface SpanTreeState {
  readonly spans: ReadonlyMap<string, SpanRecord>
  readonly traces: ReadonlyMap<string, ReadonlySet<string>>
  readonly version: number
}

// Extended service with internal methods
interface SpanTreeServiceInternal extends SpanTreeService {
  readonly _recordStart: (event: SpanStarted) => boolean
  readonly _recordEnd: (event: SpanEnded) => boolean
}

// ============================================
// Default Configuration
// ============================================

const defaultConfig = {
  ttl: Duration.seconds(30),
  maxSpans: 10000,
  maxTraces: 1000,
  queueCapacity: 1024,
  batchSize: 100
} as const

// ============================================
// Memory Estimation Constants
// ============================================

const MEMORY_CONSTANTS = {
  BYTES_PER_SPAN: 470,
  BYTES_PER_TRACE_ENTRY: 164,
  BYTES_PER_CHILD_REF: 70,
  BYTES_PER_QUEUE_EVENT: 200
} as const

// ============================================
// Helper Functions
// ============================================

const emptyState: SpanTreeState = {
  spans: new Map(),
  traces: new Map(),
  version: 0
}

const recordToInfo = (record: SpanRecord): SpanInfo => ({
  spanId: record.spanId,
  traceId: record.traceId,
  parentSpanId: record.parentSpanId,
  name: record.name,
  startTime: record.startTime,
  endTime: record.endTime,
  status: record.status
})

const handleSpanStarted = (state: SpanTreeState, event: SpanStarted): SpanTreeState => {
  const record: SpanRecord = {
    spanId: event.spanId,
    traceId: event.traceId,
    parentSpanId: event.parentSpanId,
    name: event.name,
    startTime: event.startTime,
    endTime: undefined,
    status: "running",
    children: new Set()
  }

  const newSpans = new Map(state.spans)
  newSpans.set(event.spanId, record)

  if (event.parentSpanId) {
    const parent = newSpans.get(event.parentSpanId)
    if (parent) {
      newSpans.set(event.parentSpanId, {
        ...parent,
        children: new Set([...parent.children, event.spanId])
      })
    }
  }

  const traceSpans = state.traces.get(event.traceId) ?? new Set<string>()
  const newTraces = new Map(state.traces)
  newTraces.set(event.traceId, new Set([...traceSpans, event.spanId]))

  return {
    spans: newSpans,
    traces: newTraces,
    version: state.version + 1
  }
}

const handleSpanEnded = (state: SpanTreeState, event: SpanEnded): SpanTreeState => {
  const record = state.spans.get(event.spanId)
  if (!record) return state

  const updatedRecord: SpanRecord = {
    ...record,
    endTime: event.endTime,
    status: "ended"
  }

  const newSpans = new Map(state.spans)
  newSpans.set(event.spanId, updatedRecord)

  return {
    spans: newSpans,
    traces: state.traces,
    version: state.version + 1
  }
}

const processEventBatch = (state: SpanTreeState, events: Chunk.Chunk<SpanEvent>): SpanTreeState =>
  Chunk.reduce(events, state, (acc, event) => {
    switch (event._tag) {
      case "SpanStarted":
        return handleSpanStarted(acc, event)
      case "SpanEnded":
        return handleSpanEnded(acc, event)
    }
  })

const computePath = (state: SpanTreeState, spanId: string): ReadonlyArray<string> => {
  const path: Array<string> = []
  let current: string | undefined = spanId

  while (current) {
    const record = state.spans.get(current)
    if (!record) break
    path.unshift(record.name)
    current = record.parentSpanId
  }

  return path
}

const computeDeepestPath = (state: SpanTreeState, traceId: string): ReadonlyArray<string> => {
  const traceSpans = state.traces.get(traceId)
  if (!traceSpans) return []

  let deepest: ReadonlyArray<string> = []

  for (const spanId of traceSpans) {
    const path = computePath(state, spanId)
    if (path.length > deepest.length) {
      deepest = path
    }
  }

  return deepest
}

const estimateMemory = (
  state: SpanTreeState,
  queueSize: number,
  maxSpans: number
): SpanTreeMemoryStats => {
  let totalChildRefs = 0
  for (const record of state.spans.values()) {
    totalChildRefs += record.children.size
  }

  const spanRecordsBytes = state.spans.size * MEMORY_CONSTANTS.BYTES_PER_SPAN
  const traceIndexBytes = state.traces.size * MEMORY_CONSTANTS.BYTES_PER_TRACE_ENTRY
  const childRefsBytes = totalChildRefs * MEMORY_CONSTANTS.BYTES_PER_CHILD_REF
  const queueBytes = queueSize * MEMORY_CONSTANTS.BYTES_PER_QUEUE_EVENT
  const totalBytes = spanRecordsBytes + traceIndexBytes + childRefsBytes + queueBytes

  return {
    totalBytes,
    spanRecordsBytes,
    traceIndexBytes,
    childRefsBytes,
    queueBytes,
    avgBytesPerSpan: state.spans.size > 0 ? Math.round(totalBytes / state.spans.size) : 0,
    capacityPercent: maxSpans > 0 ? (state.spans.size / maxSpans) * 100 : 0
  }
}

// ============================================
// Service Tag
// ============================================

/** @internal */
export class SpanTree extends Effect.Tag("@effect/opentelemetry/SpanTree")<
  SpanTree,
  SpanTreeServiceInternal
>() {}

// ============================================
// Service Implementation
// ============================================

const make = (inputConfig?: SpanTreeConfig) =>
  Effect.gen(function*() {
    const resolvedConfig = {
      ttl: inputConfig?.ttl ?? defaultConfig.ttl,
      maxSpans: inputConfig?.maxSpans ?? defaultConfig.maxSpans,
      maxTraces: inputConfig?.maxTraces ?? defaultConfig.maxTraces,
      queueCapacity: inputConfig?.queueCapacity ?? defaultConfig.queueCapacity,
      batchSize: inputConfig?.batchSize ?? defaultConfig.batchSize
    }

    const ttlMs = Duration.toMillis(resolvedConfig.ttl)
    const scope = yield* Effect.scope

    const eventQueue = yield* Queue.sliding<SpanEvent>(resolvedConfig.queueCapacity)
    const state = yield* SynchronizedRef.make<SpanTreeState>(emptyState)
    const droppedEvents = yield* Ref.make(0)

    // Background event processor
    const processEvents = Effect.gen(function*() {
      const batch = yield* Queue.takeBetween(eventQueue, 1, resolvedConfig.batchSize)
      yield* SynchronizedRef.update(state, (currentState) => processEventBatch(currentState, batch))
    })

    yield* processEvents.pipe(
      Effect.forever,
      Effect.forkIn(scope),
      Effect.interruptible
    )

    // TTL cleanup fiber
    const cleanupExpiredTraces = Effect.gen(function*() {
      const now = Date.now()
      yield* SynchronizedRef.update(state, (currentState) => {
        const tracesToRemove: Array<string> = []

        for (const [traceId, spanIds] of currentState.traces) {
          let allEnded = true
          let latestEndTime = BigInt(0)

          for (const spanId of spanIds) {
            const span = currentState.spans.get(spanId)
            if (!span) continue
            if (span.status !== "ended") {
              allEnded = false
              break
            }
            if (span.endTime && span.endTime > latestEndTime) {
              latestEndTime = span.endTime
            }
          }

          const endTimeMs = Number(latestEndTime / BigInt(1_000_000))
          if (allEnded && endTimeMs > 0 && now - endTimeMs > ttlMs) {
            tracesToRemove.push(traceId)
          }
        }

        if (tracesToRemove.length === 0) return currentState

        const newSpans = new Map(currentState.spans)
        const newTraces = new Map(currentState.traces)

        for (const traceId of tracesToRemove) {
          const spanIds = newTraces.get(traceId)
          if (spanIds) {
            for (const spanId of spanIds) {
              newSpans.delete(spanId)
            }
            newTraces.delete(traceId)
          }
        }

        return {
          spans: newSpans,
          traces: newTraces,
          version: currentState.version + 1
        }
      })
    })

    yield* cleanupExpiredTraces.pipe(
      Effect.repeat(Schedule.fixed(Duration.seconds(10))),
      Effect.forkIn(scope),
      Effect.interruptible
    )

    const drainQueue = Effect.gen(function*() {
      const remaining = yield* Queue.takeAll(eventQueue)
      if (!Chunk.isEmpty(remaining)) {
        yield* SynchronizedRef.update(state, (currentState) => processEventBatch(currentState, remaining))
      }
    })

    yield* Scope.addFinalizer(
      scope,
      drainQueue.pipe(
        Effect.timeout(Duration.seconds(3)),
        Effect.ignore
      )
    )

    const recordStart = (event: SpanStarted): boolean => {
      const accepted = Queue.unsafeOffer(eventQueue, event)
      if (!accepted) {
        Effect.runSync(Ref.update(droppedEvents, (n) => n + 1))
      }
      return accepted
    }

    const recordEnd = (event: SpanEnded): boolean => {
      const accepted = Queue.unsafeOffer(eventQueue, event)
      if (!accepted) {
        Effect.runSync(Ref.update(droppedEvents, (n) => n + 1))
      }
      return accepted
    }

    const service: SpanTreeServiceInternal = {
      _recordStart: recordStart,
      _recordEnd: recordEnd,

      getPath: (spanId: string) =>
        SynchronizedRef.get(state).pipe(Effect.map((s) => computePath(s, spanId))),

      getDeepestPath: (traceId: string) =>
        SynchronizedRef.get(state).pipe(Effect.map((s) => computeDeepestPath(s, traceId))),

      getCurrentPath: Effect.flatMap(
        Effect.currentSpan.pipe(Effect.option),
        (optSpan) =>
          Option.match(optSpan, {
            onNone: () => Effect.succeed([]),
            onSome: (span) =>
              SynchronizedRef.get(state).pipe(
                Effect.map((s) => computePath(s, span.spanId))
              )
          })
      ),

      getTraceSummary: (traceId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => {
            const deepest = computeDeepestPath(s, traceId)
            const spans = s.traces.get(traceId)
            return {
              traceId,
              path: deepest,
              formattedPath: deepest.join(" → "),
              depth: deepest.length,
              spanCount: spans?.size ?? 0
            } satisfies TraceSummary
          })
        ),

      getTraceSpans: (traceId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => {
            const traceSpans = s.traces.get(traceId)
            if (!traceSpans) return []
            return Array.from(traceSpans)
              .map((id) => s.spans.get(id))
              .filter((record): record is SpanRecord => record !== undefined)
              .map(recordToInfo)
          })
        ),

      getLeafSpans: (traceId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => {
            const traceSpans = s.traces.get(traceId)
            if (!traceSpans) return []
            return Array.from(traceSpans)
              .map((id) => s.spans.get(id))
              .filter((record): record is SpanRecord =>
                record !== undefined && record.children.size === 0
              )
              .map(recordToInfo)
          })
        ),

      getMaxDepth: (traceId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => computeDeepestPath(s, traceId).length)
        ),

      getCurrentTraceId: Effect.map(
        Effect.currentSpan.pipe(Effect.option),
        Option.match({
          onNone: () => null,
          onSome: (span) => span.traceId
        })
      ),

      getCurrentSpanId: Effect.map(
        Effect.currentSpan.pipe(Effect.option),
        Option.match({
          onNone: () => null,
          onSome: (span) => span.spanId
        })
      ),

      getSpan: (spanId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => {
            const record = s.spans.get(spanId)
            return record ? recordToInfo(record) : undefined
          })
        ),

      getChildren: (spanId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => {
            const record = s.spans.get(spanId)
            if (!record) return []
            return Array.from(record.children)
              .map((id) => s.spans.get(id))
              .filter((r): r is SpanRecord => r !== undefined)
              .map(recordToInfo)
          })
        ),

      isRunning: (spanId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => s.spans.get(spanId)?.status === "running")
        ),

      flush: drainQueue,

      stats: Effect.gen(function*() {
        const queueSize = yield* Queue.size(eventQueue)
        const dropped = yield* Ref.get(droppedEvents)
        const currentState = yield* SynchronizedRef.get(state)

        return {
          queueSize,
          droppedEvents: dropped,
          spanCount: currentState.spans.size,
          traceCount: currentState.traces.size,
          version: currentState.version,
          memory: estimateMemory(currentState, queueSize, resolvedConfig.maxSpans)
        } satisfies SpanTreeStats
      }),

      clear: (traceId: string) =>
        SynchronizedRef.update(state, (s) => {
          const traceSpans = s.traces.get(traceId)
          if (!traceSpans) return s

          const newSpans = new Map(s.spans)
          for (const spanId of traceSpans) {
            newSpans.delete(spanId)
          }

          const newTraces = new Map(s.traces)
          newTraces.delete(traceId)

          return {
            spans: newSpans,
            traces: newTraces,
            version: s.version + 1
          }
        })
    }

    return service
  })

// ============================================
// Layers
// ============================================

/** @internal */
export const layer = (config?: SpanTreeConfig): Layer.Layer<SpanTree> =>
  Layer.scoped(SpanTree, make(config))

/** @internal */
export const spanTreeConfig: Config.Config<SpanTreeConfig> = Config.all({
  ttl: Config.duration("SPAN_TREE_TTL").pipe(
    Config.withDefault(Duration.seconds(30))
  ),
  maxSpans: Config.integer("SPAN_TREE_MAX_SPANS").pipe(
    Config.withDefault(10000)
  ),
  maxTraces: Config.integer("SPAN_TREE_MAX_TRACES").pipe(
    Config.withDefault(1000)
  ),
  queueCapacity: Config.integer("SPAN_TREE_QUEUE_CAPACITY").pipe(
    Config.withDefault(1024)
  ),
  batchSize: Config.integer("SPAN_TREE_BATCH_SIZE").pipe(
    Config.withDefault(100)
  )
})

/** @internal */
export type SpanTreeConfigType = typeof spanTreeConfig

/** @internal */
export const layerConfig: Layer.Layer<SpanTree, ConfigError.ConfigError> = Layer.scoped(
  SpanTree,
  Effect.flatMap(Config.unwrap(spanTreeConfig), make)
)

// ============================================
// Tracer Integration
// ============================================

class SpanTreeSpan implements EffectTracer.Span {
  readonly _tag = "Span"
  readonly status: EffectTracer.SpanStatus

  constructor(
    private readonly inner: EffectTracer.Span,
    recordStart: (event: SpanStarted) => boolean,
    private readonly _recordEnd: (event: SpanEnded) => boolean
  ) {
    this.status = inner.status

    const parentSpanId = Option.match(inner.parent, {
      onNone: () => undefined,
      onSome: (p) => p.spanId
    })

    recordStart(
      new SpanStarted({
        spanId: inner.spanId,
        traceId: inner.traceId,
        parentSpanId,
        name: inner.name,
        startTime: inner.status.startTime
      })
    )
  }

  get name() {
    return this.inner.name
  }

  get spanId() {
    return this.inner.spanId
  }

  get traceId() {
    return this.inner.traceId
  }

  get parent() {
    return this.inner.parent
  }

  get context() {
    return this.inner.context
  }

  get attributes() {
    return this.inner.attributes
  }

  get links() {
    return this.inner.links
  }

  get sampled() {
    return this.inner.sampled
  }

  get kind() {
    return this.inner.kind
  }

  attribute(key: string, value: unknown) {
    this.inner.attribute(key, value)
  }

  addLinks(links: ReadonlyArray<EffectTracer.SpanLink>) {
    this.inner.addLinks(links)
  }

  event(name: string, startTime: bigint, attributes?: Record<string, unknown>) {
    this.inner.event(name, startTime, attributes)
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>) {
    this._recordEnd(
      new SpanEnded({
        spanId: this.inner.spanId,
        traceId: this.inner.traceId,
        endTime
      })
    )
    this.inner.end(endTime, exit)
  }
}

/** @internal */
export const makeTracer: Effect.Effect<EffectTracer.Tracer, never, SpanTree | Tracer.OtelTracer> = Effect.gen(
  function*() {
    const spanTreeService = yield* SpanTree
    const innerTracer = yield* Tracer.make

    return EffectTracer.make({
      span(name, parent, context, links, startTime, kind, options) {
        const inner = innerTracer.span(name, parent, context, links, startTime, kind, options)
        return new SpanTreeSpan(
          inner,
          spanTreeService._recordStart,
          spanTreeService._recordEnd
        )
      },
      context: innerTracer.context
    })
  }
)

/** @internal */
export const layerTracer = (
  config?: SpanTreeConfig
): Layer.Layer<SpanTree, never, Tracer.OtelTracer> => {
  const spanTreeLayer = layer(config)
  const tracerSetupLayer = Layer.unwrapEffect(Effect.map(makeTracer, Layer.setTracer))
  // provideMerge satisfies SpanTree requirement and includes SpanTree in output
  return tracerSetupLayer.pipe(Layer.provideMerge(spanTreeLayer))
}

// ============================================
// Metrics
// ============================================

const spanTreeMemoryBytes = Metric.gauge("span_tree.memory.bytes", {
  description: "Total estimated memory usage of SpanTree in bytes"
})

const spanTreeSpanCount = Metric.gauge("span_tree.spans.count", {
  description: "Number of spans currently tracked in SpanTree"
})

const spanTreeTraceCount = Metric.gauge("span_tree.traces.count", {
  description: "Number of traces currently tracked in SpanTree"
})

const spanTreeQueueSize = Metric.gauge("span_tree.queue.size", {
  description: "Number of pending events in SpanTree queue"
})

const spanTreeDroppedEvents = Metric.gauge("span_tree.events.dropped", {
  description: "Number of span events dropped due to queue overflow"
})

const spanTreeCapacityPercent = Metric.gauge("span_tree.capacity.percent", {
  description: "Percentage of max span capacity used"
})

/** @internal */
export const layerMetrics = (options?: {
  readonly interval?: Duration.DurationInput
}): Layer.Layer<never, never, SpanTree> =>
  Layer.scopedDiscard(
    Effect.gen(function*() {
      const spanTree = yield* SpanTree
      const interval = options?.interval ?? Duration.seconds(10)

      yield* Effect.gen(function*() {
        const stats = yield* spanTree.stats

        yield* Metric.set(spanTreeMemoryBytes, stats.memory.totalBytes)
        yield* Metric.set(spanTreeSpanCount, stats.spanCount)
        yield* Metric.set(spanTreeTraceCount, stats.traceCount)
        yield* Metric.set(spanTreeQueueSize, stats.queueSize)
        yield* Metric.set(spanTreeDroppedEvents, stats.droppedEvents)
        yield* Metric.set(spanTreeCapacityPercent, stats.memory.capacityPercent)
      }).pipe(
        Effect.repeat(Schedule.fixed(interval)),
        Effect.forkScoped,
        Effect.interruptible
      )
    })
  )

// ============================================
// Convenience APIs
// ============================================

/** @internal */
export const annotateWithSummary: Effect.Effect<void, never, SpanTree> = Effect.gen(function*() {
  const spanTree = yield* SpanTree
  const traceId = yield* spanTree.getCurrentTraceId

  if (traceId) {
    yield* spanTree.flush
    const summary = yield* spanTree.getTraceSummary(traceId)

    yield* Effect.annotateCurrentSpan("span_tree.depth", summary.depth)
    yield* Effect.annotateCurrentSpan("span_tree.path", summary.formattedPath)
    yield* Effect.annotateCurrentSpan("span_tree.span_count", summary.spanCount)
  }
})

/** @internal */
export const withSummary = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | SpanTree> =>
  Effect.ensuring(effect, annotateWithSummary)
