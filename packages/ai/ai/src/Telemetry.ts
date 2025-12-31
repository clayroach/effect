/**
 * The `Telemetry` module provides OpenTelemetry integration for operations
 * performed against a large language model provider by defining telemetry
 * attributes and utilities that follow the OpenTelemetry GenAI semantic
 * conventions.
 *
 * @example
 * ```ts
 * import { Telemetry } from "@effect/ai"
 * import { Effect } from "effect"
 *
 * // Add telemetry attributes to a span
 * const addTelemetry = Effect.gen(function* () {
 *   const span = yield* Effect.currentSpan
 *
 *   Telemetry.addGenAIAnnotations(span, {
 *     system: "openai",
 *     operation: { name: "chat" },
 *     request: {
 *       model: "gpt-4",
 *       temperature: 0.7,
 *       maxTokens: 1000
 *     },
 *     usage: {
 *       inputTokens: 100,
 *       outputTokens: 50
 *     }
 *   })
 * })
 * ```
 *
 * @since 1.0.0
 */
import * as Context from "effect/Context"
import { dual } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as String from "effect/String"
import type { Span } from "effect/Tracer"
import type { Simplify } from "effect/Types"
import type { ProviderOptions } from "./LanguageModel.js"
import type * as Prompt from "./Prompt.js"
import type * as Response from "./Response.js"
import type * as Tool from "./Tool.js"

/**
 * The attributes used to describe telemetry in the context of Generative
 * Artificial Intelligence (GenAI) Models requests and responses.
 *
 * {@see https://opentelemetry.io/docs/specs/semconv/attributes-registry/gen-ai/}
 *
 * @since 1.0.0
 * @category Models
 */
export type GenAITelemetryAttributes = Simplify<
  & AttributesWithPrefix<BaseAttributes, "gen_ai">
  & AttributesWithPrefix<OperationAttributes, "gen_ai.operation">
  & AttributesWithPrefix<TokenAttributes, "gen_ai.token">
  & AttributesWithPrefix<UsageAttributes, "gen_ai.usage">
  & AttributesWithPrefix<RequestAttributes, "gen_ai.request">
  & AttributesWithPrefix<ResponseAttributes, "gen_ai.response">
>

/**
 * All telemetry attributes which are part of the GenAI specification.
 *
 * @since 1.0.0
 * @category Models
 */
export type AllAttributes =
  & BaseAttributes
  & OperationAttributes
  & TokenAttributes
  & UsageAttributes
  & RequestAttributes
  & ResponseAttributes

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai`.
 *
 * @since 1.0.0
 * @category Models
 */
export interface BaseAttributes {
  /**
   * The Generative AI product as identified by the client or server
   * instrumentation.
   */
  readonly system?: (string & {}) | WellKnownSystem | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.operation`.
 *
 * @since 1.0.0
 * @category Models
 */
export interface OperationAttributes {
  readonly name?: (string & {}) | WellKnownOperationName | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.token`.
 *
 * @since 1.0.0
 * @category Models
 */
export interface TokenAttributes {
  readonly type?: string | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.usage`.
 *
 * @since 1.0.0
 * @category Models
 */
export interface UsageAttributes {
  readonly inputTokens?: number | null | undefined
  readonly outputTokens?: number | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.request`.
 *
 * @since 1.0.0
 * @category Models
 */
export interface RequestAttributes {
  /**
   * The name of the GenAI model a request is being made to.
   */
  readonly model?: string | null | undefined
  /**
   * The temperature setting for the GenAI request.
   */
  readonly temperature?: number | null | undefined
  /**
   * The temperature setting for the GenAI request.
   */
  readonly topK?: number | null | undefined
  /**
   * The top_k sampling setting for the GenAI request.
   */
  readonly topP?: number | null | undefined
  /**
   * The top_p sampling setting for the GenAI request.
   */
  readonly maxTokens?: number | null | undefined
  /**
   * The encoding formats requested in an embeddings operation, if specified.
   */
  readonly encodingFormats?: ReadonlyArray<string> | null | undefined
  /**
   * List of sequences that the model will use to stop generating further
   * tokens.
   */
  readonly stopSequences?: ReadonlyArray<string> | null | undefined
  /**
   * The frequency penalty setting for the GenAI request.
   */
  readonly frequencyPenalty?: number | null | undefined
  /**
   * The presence penalty setting for the GenAI request.
   */
  readonly presencePenalty?: number | null | undefined
  /**
   * The seed setting for the GenAI request. Requests with same seed value
   * are more likely to return same result.
   */
  readonly seed?: number | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.response`.
 *
 * @since 1.0.0
 * @category Models
 */
export interface ResponseAttributes {
  /**
   * The unique identifier for the completion.
   */
  readonly id?: string | null | undefined
  /**
   * The name of the model that generated the response.
   */
  readonly model?: string | null | undefined
  /**
   * Array of reasons the model stopped generating tokens, corresponding to
   * each generation received.
   */
  readonly finishReasons?: ReadonlyArray<string> | null | undefined
}

/**
 * The `gen_ai.operation.name` attribute has the following list of well-known
 * values.
 *
 * If one of them applies, then the respective value **MUST** be used;
 * otherwise, a custom value **MAY** be used.
 *
 * @since 1.0.0
 * @category Models
 */
export type WellKnownOperationName = "chat" | "embeddings" | "text_completion"

/**
 * The `gen_ai.system` attribute has the following list of well-known values.
 *
 * If one of them applies, then the respective value **MUST** be used;
 * otherwise, a custom value **MAY** be used.
 *
 * @since 1.0.0
 * @category Models
 */
export type WellKnownSystem =
  | "anthropic"
  | "aws.bedrock"
  | "az.ai.inference"
  | "az.ai.openai"
  | "cohere"
  | "deepseek"
  | "gemini"
  | "groq"
  | "ibm.watsonx.ai"
  | "mistral_ai"
  | "openai"
  | "perplexity"
  | "vertex_ai"
  | "xai"

/**
 * Utility type for prefixing attribute names with a namespace.
 *
 * Transforms attribute keys by adding a prefix and formatting them according to
 * OpenTelemetry conventions (camelCase to snake_case).
 *
 * @template Attributes - Record type containing the attributes to prefix
 * @template Prefix - String literal type for the prefix to add
 *
 * @example
 * ```ts
 * import { Telemetry } from "@effect/ai"
 *
 * type RequestAttrs = {
 *   modelName: string
 *   maxTokens: number
 * }
 *
 * type PrefixedAttrs = Telemetry.AttributesWithPrefix<RequestAttrs, "gen_ai.request">
 * // Results in: {
 * //   "gen_ai.request.model_name": string
 * //   "gen_ai.request.max_tokens": number
 * // }
 * ```
 *
 * @since 1.0.0
 * @category Utility Types
 */
export type AttributesWithPrefix<Attributes extends Record<string, any>, Prefix extends string> = {
  [Name in keyof Attributes as `${Prefix}.${FormatAttributeName<Name>}`]: Attributes[Name]
}

/**
 * Utility type for converting camelCase names to snake_case format.
 *
 * This type recursively transforms string literal types from camelCase to
 * snake_case, which is the standard format for OpenTelemetry attributes.
 *
 * @template T - String literal type to format
 *
 * @example
 * ```ts
 * import { Telemetry } from "@effect/ai"
 *
 * type Formatted1 = Telemetry.FormatAttributeName<"modelName">    // "model_name"
 * type Formatted2 = Telemetry.FormatAttributeName<"maxTokens">    // "max_tokens"
 * type Formatted3 = Telemetry.FormatAttributeName<"temperature">  // "temperature"
 * ```
 *
 * @since 1.0.0
 * @category Utility Types
 */
export type FormatAttributeName<T extends string | number | symbol> = T extends string ?
  T extends `${infer First}${infer Rest}`
    ? `${First extends Uppercase<First> ? "_" : ""}${Lowercase<First>}${FormatAttributeName<Rest>}`
  : T :
  never

/**
 * Creates a function to add attributes to a span with a given prefix and key transformation.
 *
 * This utility function is used internally to create specialized functions for adding
 * different types of telemetry attributes to OpenTelemetry spans.
 *
 * @example
 * ```ts
 * import { Telemetry } from "@effect/ai"
 * import { String, Tracer } from "effect"
 *
 * const addCustomAttributes = Telemetry.addSpanAttributes(
 *   "custom.ai",
 *   String.camelToSnake
 * )
 *
 * // Usage with a span
 * declare const span: Tracer.Span
 * addCustomAttributes(span, {
 *   modelName: "gpt-4",
 *   maxTokens: 1000
 * })
 * // Results in attributes: "custom.ai.model_name" and "custom.ai.max_tokens"
 * ```
 *
 * @since 1.0.0
 * @category Utilities
 */
export const addSpanAttributes = (
  /**
   * The prefix to add to all attribute keys.
   */
  keyPrefix: string,
  /**
   * Function to transform attribute keys (e.g., camelCase to snake_case).
   */
  transformKey: (key: string) => string
) =>
<Attributes extends Record<string, any>>(
  /**
   * The OpenTelemetry span to add attributes to.
   */
  span: Span,
  /**
   * The attributes to add to the span.
   */
  attributes: Attributes
): void => {
  for (const [key, value] of Object.entries(attributes)) {
    if (Predicate.isNotNullable(value)) {
      span.attribute(`${keyPrefix}.${transformKey(key)}`, value)
    }
  }
}

const addSpanBaseAttributes = addSpanAttributes("gen_ai", String.camelToSnake)<BaseAttributes>
const addSpanOperationAttributes = addSpanAttributes("gen_ai.operation", String.camelToSnake)<OperationAttributes>
const addSpanRequestAttributes = addSpanAttributes("gen_ai.request", String.camelToSnake)<RequestAttributes>
const addSpanResponseAttributes = addSpanAttributes("gen_ai.response", String.camelToSnake)<ResponseAttributes>
const addSpanTokenAttributes = addSpanAttributes("gen_ai.token", String.camelToSnake)<TokenAttributes>
const addSpanUsageAttributes = addSpanAttributes("gen_ai.usage", String.camelToSnake)<UsageAttributes>

/**
 * Configuration options for GenAI telemetry attributes.
 *
 * Combines base attributes with optional grouped attributes for comprehensive
 * telemetry coverage of AI operations.
 *
 * @example
 * ```ts
 * import { Telemetry } from "@effect/ai"
 *
 * const telemetryOptions: Telemetry.GenAITelemetryAttributeOptions = {
 *   system: "openai",
 *   operation: {
 *     name: "chat"
 *   },
 *   request: {
 *     model: "gpt-4-turbo",
 *     temperature: 0.7,
 *     maxTokens: 2000
 *   },
 *   response: {
 *     id: "chatcmpl-123",
 *     model: "gpt-4-turbo-2024-04-09",
 *     finishReasons: ["stop"]
 *   },
 *   usage: {
 *     inputTokens: 50,
 *     outputTokens: 25
 *   }
 * }
 * ```
 *
 * @since 1.0.0
 * @category Models
 */
export type GenAITelemetryAttributeOptions = BaseAttributes & {
  /**
   * Operation-specific attributes (e.g., operation name).
   */
  readonly operation?: OperationAttributes | undefined
  /**
   * Request-specific attributes (e.g., model parameters).
   */
  readonly request?: RequestAttributes | undefined
  /**
   * Response-specific attributes (e.g., response metadata).
   */
  readonly response?: ResponseAttributes | undefined
  /**
   * Token-specific attributes.
   */
  readonly token?: TokenAttributes | undefined
  /**
   * Usage statistics attributes (e.g., token counts).
   */
  readonly usage?: UsageAttributes | undefined
}

/**
 * Applies GenAI telemetry attributes to an OpenTelemetry span.
 *
 * This function adds standardized GenAI attributes to a span following OpenTelemetry
 * semantic conventions. It supports both curried and direct application patterns.
 *
 * **Note**: This function mutates the provided span in-place.
 *
 * @example
 * ```ts
 * import { Telemetry } from "@effect/ai"
 * import { Effect } from "effect"
 *
 * const directUsage = Effect.gen(function* () {
 *   const span = yield* Effect.currentSpan
 *
 *   Telemetry.addGenAIAnnotations(span, {
 *     system: "openai",
 *     request: { model: "gpt-4", temperature: 0.7 },
 *     usage: { inputTokens: 100, outputTokens: 50 }
 *   })
 * })
 * ```
 *
 * @since 1.0.0
 * @category Utilities
 */
export const addGenAIAnnotations: {
  (
    /**
     * Telemetry attribute options to apply to the span.
     */
    options: GenAITelemetryAttributeOptions
  ): (
    /**
     * OpenTelemetry span to add attributes to.
     */
    span: Span
  ) => void
  (
    /**
     * OpenTelemetry span to add attributes to.
     */
    span: Span,
    /**
     * Telemetry attribute options to apply to the span.
     */
    options: GenAITelemetryAttributeOptions
  ): void
} = dual<
  (options: GenAITelemetryAttributeOptions) => (span: Span) => void,
  (span: Span, options: GenAITelemetryAttributeOptions) => void
>(2, (span, options) => {
  addSpanBaseAttributes(span, { system: options.system })
  if (Predicate.isNotNullable(options.operation)) addSpanOperationAttributes(span, options.operation)
  if (Predicate.isNotNullable(options.request)) addSpanRequestAttributes(span, options.request)
  if (Predicate.isNotNullable(options.response)) addSpanResponseAttributes(span, options.response)
  if (Predicate.isNotNullable(options.token)) addSpanTokenAttributes(span, options.token)
  if (Predicate.isNotNullable(options.usage)) addSpanUsageAttributes(span, options.usage)
})

/**
 * A function that can transform OpenTelemetry spans based on AI operation data.
 *
 * Span transformers receive the complete request/response context from AI operations
 * and can add custom telemetry attributes, metrics, or other observability data.
 *
 * @example
 * ```ts
 * import { Telemetry } from "@effect/ai"
 *
 * const customTransformer: Telemetry.SpanTransformer = (options) => {
 *   // Add custom attributes based on the response
 *   const textParts = options.response.filter(part => part.type === "text")
 *   const totalTextLength = textParts.reduce((sum, part) =>
 *     sum + (part.type === "text" ? part.text.length : 0), 0
 *   )
 *
 *   // Add custom metrics
 *   console.log(`Generated ${totalTextLength} characters of text`)
 * }
 * ```
 *
 * @since 1.0.0
 * @category Models
 */
export interface SpanTransformer {
  (
    options: ProviderOptions & {
      /**
       * Array of response parts generated by the AI model.
       */
      readonly response: ReadonlyArray<Response.AllParts<any>>
    }
  ): void
}

/**
 * Context tag for providing a span transformer to large langauge model
 * operations.
 *
 * The CurrentSpanTransformer allows you to inject custom span transformation
 * logic into AI operations, enabling application-specific telemetry and
 * observability patterns.
 *
 * @example
 * ```ts
 * import { Telemetry } from "@effect/ai"
 * import { Context, Effect } from "effect"
 *
 * // Create a custom span transformer
 * const loggingTransformer: Telemetry.SpanTransformer = (options) => {
 *   console.log(`AI request completed: ${options.model}`)
 *   options.response.forEach((part, index) => {
 *     console.log(`Part ${index}: ${part.type}`)
 *   })
 * }
 *
 * // Provide the transformer to your AI operations
 * const program = myAIOperation.pipe(
 *   Effect.provideService(
 *     Telemetry.CurrentSpanTransformer,
 *     Telemetry.CurrentSpanTransformer.of(loggingTransformer)
 *   )
 * )
 * ```
 *
 * @since 1.0.0
 * @category Context
 */
export class CurrentSpanTransformer extends Context.Tag("@effect/ai/Telemetry/CurrentSpanTransformer")<
  CurrentSpanTransformer,
  SpanTransformer
>() {}

/**
 * Configuration for opt-in GenAI semantic convention attributes.
 *
 * These attributes are disabled by default because they can contain
 * sensitive information (user data, PII) and may increase span size.
 * `Redacted<A>` values will serialize to `"<redacted>"`.
 *
 * @since 1.0.0
 * @category Models
 */
export interface TelemetryConfig {
  /** Adds `gen_ai.input.messages` - JSON-encoded chat history/prompt. */
  readonly captureInputMessages?: boolean | undefined
  /** Adds `gen_ai.output.messages` - JSON-encoded model response. */
  readonly captureOutputMessages?: boolean | undefined
  /** Adds `gen_ai.system_instructions` - JSON-encoded system prompt. */
  readonly captureSystemInstructions?: boolean | undefined
  /** Adds `gen_ai.tool.definitions` - JSON-encoded tool definitions. */
  readonly captureToolDefinitions?: boolean | undefined
}

/**
 * Context tag for providing telemetry configuration to AI operations.
 *
 * @since 1.0.0
 * @category Context
 */
export class CurrentTelemetryConfig extends Context.Tag("@effect/ai/Telemetry/CurrentTelemetryConfig")<
  CurrentTelemetryConfig,
  TelemetryConfig
>() {}

// =============================================================================
// Internal Content Conversion
// =============================================================================

// Converts a Prompt to GenAI `gen_ai.input.messages` format
const promptToInputMessages = (prompt: Prompt.Prompt): string => {
  const messages: Array<{ role: string; parts: Array<{ type: string; content: unknown }> }> = []
  for (const message of prompt.content) {
    switch (message.role) {
      case "system":
        break // handled by promptToSystemInstructions
      case "user":
      case "assistant":
      case "tool":
        messages.push({ role: message.role, parts: convertMessageParts(message) })
        break
    }
  }
  return JSON.stringify(messages)
}

// Extracts system instructions to GenAI `gen_ai.system_instructions` format
const promptToSystemInstructions = (prompt: Prompt.Prompt): string | undefined => {
  const instructions: Array<{ type: string; content: string }> = []
  for (const message of prompt.content) {
    if (message.role === "system") {
      instructions.push({ type: "text", content: message.content })
    }
  }
  return instructions.length > 0 ? JSON.stringify(instructions) : undefined
}

// Converts response parts to GenAI `gen_ai.output.messages` format
const responseToOutputMessages = (response: ReadonlyArray<Response.AnyPart>): string => {
  const parts: Array<{ type: string; content: unknown }> = []
  let finishReason: string | undefined
  for (const part of response) {
    switch (part.type) {
      case "text":
        parts.push({ type: "text", content: part.text })
        break
      case "reasoning":
        parts.push({ type: "reasoning", content: part.text })
        break
      case "tool-call":
        parts.push({ type: "tool_call", content: { id: part.id, name: part.name, parameters: part.params } })
        break
      case "finish":
        finishReason = part.reason
        break
    }
  }
  return JSON.stringify([{
    role: "assistant",
    parts,
    ...(Predicate.isNotUndefined(finishReason) ? { finish_reason: finishReason } : {})
  }])
}

// Converts tools to GenAI `gen_ai.tool.definitions` format
const toolsToDefinitions = (tools: ReadonlyArray<Tool.Any>): string | undefined => {
  if (tools.length === 0) return undefined
  const ToolModule = require("./Tool.js") as typeof Tool
  const definitions: Array<{ type: string; name: string; description?: string; parameters: unknown }> = []
  for (const tool of tools) {
    if (ToolModule.isUserDefined(tool)) {
      definitions.push({
        type: "function",
        name: tool.name,
        description: tool.description ?? ToolModule.getDescriptionFromSchemaAst(tool.parametersSchema.ast),
        parameters: ToolModule.getJsonSchemaFromSchemaAst(tool.parametersSchema.ast)
      })
    }
  }
  return definitions.length > 0 ? JSON.stringify(definitions) : undefined
}

const convertMessageParts = (
  message: Prompt.UserMessage | Prompt.AssistantMessage | Prompt.ToolMessage
): Array<{ type: string; content: unknown }> => {
  const parts: Array<{ type: string; content: unknown }> = []
  switch (message.role) {
    case "user":
      for (const part of message.content) {
        switch (part.type) {
          case "text":
            parts.push({ type: "text", content: part.text })
            break
          case "file":
            parts.push({ type: "file", content: { media_type: part.mediaType, file_name: part.fileName } })
            break
        }
      }
      break
    case "assistant":
      for (const part of message.content) {
        switch (part.type) {
          case "text":
            parts.push({ type: "text", content: part.text })
            break
          case "reasoning":
            parts.push({ type: "reasoning", content: part.text })
            break
          case "tool-call":
            parts.push({ type: "tool_call", content: { id: part.id, name: part.name, parameters: part.params } })
            break
          case "tool-result":
            parts.push({ type: "tool_result", content: { id: part.id, name: part.name, result: part.result } })
            break
        }
      }
      break
    case "tool":
      for (const part of message.content) {
        parts.push({ type: "tool_result", content: { id: part.id, name: part.name, result: part.result } })
      }
      break
  }
  return parts
}

// =============================================================================
// Content Attribute Application
// =============================================================================

/**
 * Applies opt-in GenAI content attributes to a span based on the provided config.
 *
 * @since 1.0.0
 * @category Utilities
 */
export const applyContentAttributes = (
  config: TelemetryConfig,
  span: Span,
  prompt: Prompt.Prompt,
  tools: ReadonlyArray<Tool.Any>,
  response: ReadonlyArray<Response.AnyPart>
): void => {
  if (config.captureInputMessages) {
    span.attribute("gen_ai.input.messages", promptToInputMessages(prompt))
  }
  if (config.captureOutputMessages) {
    span.attribute("gen_ai.output.messages", responseToOutputMessages(response))
  }
  if (config.captureSystemInstructions) {
    const systemInstructions = promptToSystemInstructions(prompt)
    if (systemInstructions !== undefined) {
      span.attribute("gen_ai.system_instructions", systemInstructions)
    }
  }
  if (config.captureToolDefinitions) {
    const toolDefinitions = toolsToDefinitions(tools)
    if (toolDefinitions !== undefined) {
      span.attribute("gen_ai.tool.definitions", toolDefinitions)
    }
  }
}

// =============================================================================
// Layer Factories
// =============================================================================

/**
 * Creates a Layer that provides TelemetryConfig.
 *
 * @example
 * ```ts
 * import { Telemetry, LanguageModel } from "@effect/ai"
 * import { Effect } from "effect"
 *
 * // Enable input/output message capture
 * const program = LanguageModel.generateText({
 *   prompt: "Hello!"
 * }).pipe(
 *   Effect.provide(Telemetry.layer({
 *     captureInputMessages: true,
 *     captureOutputMessages: true
 *   }))
 * )
 * ```
 *
 * @since 1.0.0
 * @category Layers
 */
export const layer = (config: TelemetryConfig): Layer.Layer<CurrentTelemetryConfig> =>
  Layer.succeed(CurrentTelemetryConfig, config)
