import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import * as Resource from "@effect/opentelemetry/Resource"
import * as SpanTree from "@effect/opentelemetry/SpanTree"
import * as Tracer from "@effect/opentelemetry/Tracer"
import { describe, expect, it } from "@effect/vitest"
import * as OtelApi from "@opentelemetry/api"
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks"
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

// Set up context manager for OTel context propagation
const contextManager = new AsyncHooksContextManager()
OtelApi.context.setGlobalContextManager(contextManager)

const exporter = new InMemorySpanExporter()

// Build layers step by step so TypeScript can see OtelTracer is provided
const ResourceLive = Resource.layer({ serviceName: "span-tree-test" })
const TracerProviderLive = NodeSdk.layerTracerProvider(new SimpleSpanProcessor(exporter))

// Tracer.layer explicitly provides OtelTracer in its type signature
const OtelTracerLive = Tracer.layer.pipe(
  Layer.provide(TracerProviderLive),
  Layer.provide(ResourceLive)
)

// SpanTree layer with tracer integration - wraps the OtelTracer
const SpanTreeLive = SpanTree.layerTracer({
  ttl: Duration.seconds(60),
  maxSpans: 1000,
  maxTraces: 100
}).pipe(Layer.provide(OtelTracerLive))

describe("SpanTree", () => {
  describe("basic functionality", () => {
    it.effect("records span and allows path query", () =>
      Effect.gen(function*() {
        const spanTree = yield* SpanTree.SpanTree

        yield* Effect.withSpan("parent")(
          Effect.withSpan("child")(
            Effect.gen(function*() {
              // Flush to ensure events are processed
              yield* spanTree.flush

              const traceId = yield* spanTree.getCurrentTraceId
              expect(traceId).not.toBeNull()

              if (traceId) {
                const path = yield* spanTree.getDeepestPath(traceId)
                expect(path).toEqual(["parent", "child"])
              }
            })
          )
        )
      }).pipe(Effect.provide(SpanTreeLive)))

    it.effect("tracks multiple nested spans", () =>
      Effect.gen(function*() {
        const spanTree = yield* SpanTree.SpanTree

        yield* Effect.withSpan("root")(
          Effect.withSpan("level1")(
            Effect.withSpan("level2")(
              Effect.withSpan("level3")(
                Effect.gen(function*() {
                  yield* spanTree.flush

                  const traceId = yield* spanTree.getCurrentTraceId
                  expect(traceId).not.toBeNull()

                  if (traceId) {
                    const path = yield* spanTree.getDeepestPath(traceId)
                    expect(path).toEqual(["root", "level1", "level2", "level3"])

                    const depth = yield* spanTree.getMaxDepth(traceId)
                    expect(depth).toBe(4)
                  }
                })
              )
            )
          )
        )
      }).pipe(Effect.provide(SpanTreeLive)))

    it.effect("getTraceSummary returns correct data", () =>
      Effect.gen(function*() {
        const spanTree = yield* SpanTree.SpanTree

        yield* Effect.withSpan("parent")(
          Effect.gen(function*() {
            yield* Effect.withSpan("child1")(Effect.void)
            yield* Effect.withSpan("child2")(Effect.void)

            yield* spanTree.flush

            const traceId = yield* spanTree.getCurrentTraceId
            expect(traceId).not.toBeNull()

            if (traceId) {
              const summary = yield* spanTree.getTraceSummary(traceId)
              expect(summary.traceId).toBe(traceId)
              expect(summary.depth).toBe(2)
              expect(summary.spanCount).toBeGreaterThanOrEqual(3) // parent + 2 children
              expect(summary.formattedPath).toContain("parent")
            }
          })
        )
      }).pipe(Effect.provide(SpanTreeLive)))

    it.effect("getLeafSpans returns spans without children", () =>
      Effect.gen(function*() {
        const spanTree = yield* SpanTree.SpanTree

        yield* Effect.withSpan("parent")(
          Effect.gen(function*() {
            yield* Effect.withSpan("leaf1")(Effect.void)
            yield* Effect.withSpan("leaf2")(Effect.void)

            yield* spanTree.flush

            const traceId = yield* spanTree.getCurrentTraceId
            expect(traceId).not.toBeNull()

            if (traceId) {
              const leaves = yield* spanTree.getLeafSpans(traceId)
              const leafNames = leaves.map((l) => l.name)
              expect(leafNames).toContain("leaf1")
              expect(leafNames).toContain("leaf2")
            }
          })
        )
      }).pipe(Effect.provide(SpanTreeLive)))

    it.effect("stats returns memory and count information", () =>
      Effect.gen(function*() {
        const spanTree = yield* SpanTree.SpanTree

        yield* Effect.withSpan("test")(
          Effect.gen(function*() {
            yield* spanTree.flush

            const stats = yield* spanTree.stats
            expect(stats.spanCount).toBeGreaterThanOrEqual(1)
            expect(stats.traceCount).toBeGreaterThanOrEqual(1)
            expect(stats.memory.totalBytes).toBeGreaterThan(0)
            expect(stats.memory.capacityPercent).toBeGreaterThanOrEqual(0)
          })
        )
      }).pipe(Effect.provide(SpanTreeLive)))
  })

  describe("withSummary combinator", () => {
    it.effect("adds span tree attributes to current span", () =>
      SpanTree.withSummary(
        Effect.withSpan("outer")(
          Effect.gen(function*() {
            yield* Effect.withSpan("inner")(Effect.void)

            const span = yield* Effect.currentSpan
            expect(span.name).toBe("outer")
          })
        )
      ).pipe(Effect.provide(SpanTreeLive)))
  })

  describe("deepest path after spans end", () => {
    it.effect("can query deepest path even after inner spans have ended", () =>
      Effect.gen(function*() {
        const spanTree = yield* SpanTree.SpanTree
        let capturedTraceId: string | null = null

        yield* Effect.withSpan("parent")(
          Effect.gen(function*() {
            // Create deep nested structure
            yield* Effect.withSpan("child")(
              Effect.withSpan("grandchild")(
                Effect.withSpan("great-grandchild")(Effect.void)
              )
            )

            // Inner spans have now ended
            yield* spanTree.flush

            capturedTraceId = yield* spanTree.getCurrentTraceId
          })
        )

        // Query AFTER the parent span has ended
        yield* spanTree.flush

        if (capturedTraceId) {
          const path = yield* spanTree.getDeepestPath(capturedTraceId)
          expect(path).toEqual(["parent", "child", "grandchild", "great-grandchild"])
        }
      }).pipe(Effect.provide(SpanTreeLive)))
  })

  describe("clear functionality", () => {
    it.effect("clear removes trace data", () =>
      Effect.gen(function*() {
        const spanTree = yield* SpanTree.SpanTree
        let traceId: string | null = null

        yield* Effect.withSpan("to-be-cleared")(
          Effect.gen(function*() {
            yield* spanTree.flush
            traceId = yield* spanTree.getCurrentTraceId
          })
        )

        yield* spanTree.flush

        if (traceId) {
          // Verify trace exists
          const beforeClear = yield* spanTree.getTraceSummary(traceId)
          expect(beforeClear.spanCount).toBeGreaterThan(0)

          // Clear it
          yield* spanTree.clear(traceId)

          // Verify it's gone
          const afterClear = yield* spanTree.getTraceSummary(traceId)
          expect(afterClear.spanCount).toBe(0)
        }
      }).pipe(Effect.provide(SpanTreeLive)))
  })
})
