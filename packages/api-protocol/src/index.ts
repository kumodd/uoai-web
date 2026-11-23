import { z } from "zod";
import {
  MAX_MESSAGES_PER_REQUEST,
  MAX_REQUEST_PAYLOAD_BYTES,
  UOAI_BRIDGE_CHANNEL
} from "@uoai/shared-types";

// ============================================================================
// 1. Authoritative Error Code Catalogue (API_REQUIREMENTS.md §7.1)
// ============================================================================

export const ErrorTypeSchema = z.enum([
  "connection_error",
  "environment_error",
  "permission_error",
  "validation_error",
  "rate_limit_error",
  "model_error",
  "runtime_error",
  "storage_error",
  "cancellation_error"
]);

export type UOAIErrorType = z.infer<typeof ErrorTypeSchema>;

export const ErrorCodeSchema = z.enum([
  "extension_not_detected",
  "browser_unsupported",
  "protocol_version_unsupported",
  "connection_lost",
  "permission_required",
  "permission_denied",
  "permission_revoked",
  "origin_not_allowed",
  "invalid_request",
  "payload_too_large",
  "unsupported_operation",
  "request_not_found",
  "context_length_exceeded",
  "rate_limited",
  "queue_full",
  "model_not_found",
  "model_not_loaded",
  "model_not_verified",
  "model_unloaded",
  "webgpu_unavailable",
  "insufficient_resources",
  "insufficient_storage",
  "generation_cancelled",
  "runtime_restarted",
  "runtime_unavailable",
  "internal_error"
]);

export type UOAIErrorCode = z.infer<typeof ErrorCodeSchema>;

export interface ErrorMeta {
  type: UOAIErrorType;
  retryable: boolean;
  defaultMessage: string;
  userTitle: string;
  userGuidance: string;
}

export const ERROR_CATALOGUE: Record<UOAIErrorCode, ErrorMeta> = {
  extension_not_detected: {
    type: "connection_error",
    retryable: false,
    defaultMessage: "UOAI browser extension was not detected or is disabled.",
    userTitle: "Extension Required",
    userGuidance: "Install or enable the UOAI browser extension, then refresh this page."
  },
  browser_unsupported: {
    type: "environment_error",
    retryable: false,
    defaultMessage: "This browser does not support the APIs required by UOAI.",
    userTitle: "Browser Not Supported",
    userGuidance: "Use a current Chromium-based browser such as Google Chrome or Microsoft Edge."
  },
  protocol_version_unsupported: {
    type: "connection_error",
    retryable: false,
    defaultMessage: "No compatible protocol version between the SDK and the UOAI extension.",
    userTitle: "Version Mismatch",
    userGuidance: "Update either the website SDK or the UOAI browser extension."
  },
  connection_lost: {
    type: "connection_error",
    retryable: true,
    defaultMessage: "Connection to the UOAI extension was interrupted.",
    userTitle: "Connection Interrupted",
    userGuidance: "The extension restarted. Retry your request."
  },
  permission_required: {
    type: "permission_error",
    retryable: false,
    defaultMessage: "This website is not authorized to use UOAI. Open the UOAI toolbar icon to grant access.",
    userTitle: "Website Authorization Needed",
    userGuidance: "Click the UOAI extension icon and select Allow to grant this site local AI access."
  },
  permission_denied: {
    type: "permission_error",
    retryable: false,
    defaultMessage: "The user denied local AI access for this website.",
    userTitle: "Access Denied",
    userGuidance: "You can change this decision anytime in UOAI Settings > Website Integrations."
  },
  permission_revoked: {
    type: "permission_error",
    retryable: false,
    defaultMessage: "Access to UOAI was revoked by the user.",
    userTitle: "Access Revoked",
    userGuidance: "Re-authorize this website from the UOAI extension to continue."
  },
  origin_not_allowed: {
    type: "permission_error",
    retryable: false,
    defaultMessage: "Request origin or frame context is not allowed.",
    userTitle: "Origin Not Allowed",
    userGuidance: "UOAI only accepts requests from authorized top-level HTTPS origins (or localhost in Developer Mode)."
  },
  invalid_request: {
    type: "validation_error",
    retryable: false,
    defaultMessage: "The request payload failed schema validation.",
    userTitle: "Invalid Request",
    userGuidance: "Check the request parameters and try again."
  },
  payload_too_large: {
    type: "validation_error",
    retryable: false,
    defaultMessage: "Request payload exceeds the 256 KB maximum limit.",
    userTitle: "Request Too Large",
    userGuidance: "Shorten your messages so the request fits under 256 KB."
  },
  unsupported_operation: {
    type: "validation_error",
    retryable: false,
    defaultMessage: "The requested operation is not supported by UOAI.",
    userTitle: "Unsupported Operation",
    userGuidance: "Use one of the documented logical API routes (/v1/models, /v1/chat/completions, /v1/health, /v1/runtime)."
  },
  request_not_found: {
    type: "validation_error",
    retryable: false,
    defaultMessage: "The target request ID was not found or belongs to another connection.",
    userTitle: "Request Not Found",
    userGuidance: "The generation may have already finished or been cancelled."
  },
  context_length_exceeded: {
    type: "validation_error",
    retryable: false,
    defaultMessage: "Prompt tokens plus max_tokens exceed the model context length.",
    userTitle: "Conversation Too Long",
    userGuidance: "Shorten the prompt, lower max_tokens, or start a new conversation."
  },
  rate_limited: {
    type: "rate_limit_error",
    retryable: true,
    defaultMessage: "Per-origin request rate limit exceeded.",
    userTitle: "Too Many Requests",
    userGuidance: "Wait briefly and retry your request."
  },
  queue_full: {
    type: "rate_limit_error",
    retryable: true,
    defaultMessage: "The local AI request queue is currently full.",
    userTitle: "Provider Busy",
    userGuidance: "Wait for active local generations to finish and try again."
  },
  model_not_found: {
    type: "model_error",
    retryable: false,
    defaultMessage: "The requested model is not installed locally.",
    userTitle: "Model Not Installed",
    userGuidance: "Download the model in the UOAI Model Library first."
  },
  model_not_loaded: {
    type: "model_error",
    retryable: false,
    defaultMessage: "The requested model is not currently loaded and cross-model switching is disabled.",
    userTitle: "Different Model Loaded",
    userGuidance: "Switch to the requested model in UOAI or enable website model switching in Settings."
  },
  model_not_verified: {
    type: "model_error",
    retryable: false,
    defaultMessage: "Model artifacts are missing or failed SHA-256 integrity verification.",
    userTitle: "Model Verification Failed",
    userGuidance: "Open Model Library and re-download or repair the model when online."
  },
  model_unloaded: {
    type: "runtime_error",
    retryable: true,
    defaultMessage: "The active model was unloaded or switched while this request was pending.",
    userTitle: "Model Unloaded",
    userGuidance: "Reload the model and retry your request."
  },
  webgpu_unavailable: {
    type: "environment_error",
    retryable: false,
    defaultMessage: "WebGPU hardware acceleration is unavailable on this browser or GPU.",
    userTitle: "WebGPU Unavailable",
    userGuidance: "Enable hardware acceleration in browser settings, update GPU drivers, or verify chrome://gpu."
  },
  insufficient_resources: {
    type: "runtime_error",
    retryable: false,
    defaultMessage: "Insufficient GPU or system memory to load or run this model.",
    userTitle: "Not Enough Device Memory",
    userGuidance: "Close other GPU-heavy tabs or apps, or choose a smaller quantized model."
  },
  insufficient_storage: {
    type: "storage_error",
    retryable: false,
    defaultMessage: "Insufficient browser disk quota for this model download.",
    userTitle: "Not Enough Storage Space",
    userGuidance: "Free up disk space or remove an unused model in the Model Library."
  },
  generation_cancelled: {
    type: "cancellation_error",
    retryable: false,
    defaultMessage: "Generation was cancelled.",
    userTitle: "Generation Stopped",
    userGuidance: "You can send a new prompt anytime."
  },
  runtime_restarted: {
    type: "runtime_error",
    retryable: true,
    defaultMessage: "The local inference worker restarted or WebGPU device was lost.",
    userTitle: "Local AI Restarted",
    userGuidance: "The runtime recovered automatically. Click Retry to run your prompt again."
  },
  runtime_unavailable: {
    type: "runtime_error",
    retryable: false,
    defaultMessage: "The local inference runtime stopped after repeated errors.",
    userTitle: "Runtime Unavailable",
    userGuidance: "Open Provider Dashboard to reset the runtime or switch to a smaller model."
  },
  internal_error: {
    type: "runtime_error",
    retryable: false,
    defaultMessage: "An unexpected internal error occurred inside UOAI.",
    userTitle: "Unexpected Error",
    userGuidance: "Check the Developer Console diagnostics or restart the runtime."
  }
};

export const UOAIErrorPayloadSchema = z.object({
  error: z.object({
    type: ErrorTypeSchema,
    code: ErrorCodeSchema,
    message: z.string(),
    param: z.string().nullable().optional(),
    retryable: z.boolean(),
    request_id: z.string().nullable().optional(),
    retry_after_ms: z.number().int().nonnegative().optional(),
    supported_versions: z.array(z.string()).optional(),
    prompt_tokens: z.number().int().nonnegative().optional(),
    max_context: z.number().int().positive().optional()
  })
});

export type UOAIErrorPayload = z.infer<typeof UOAIErrorPayloadSchema>;

export class UOAIError extends Error {
  public readonly type: UOAIErrorType;
  public readonly code: UOAIErrorCode;
  public readonly param: string | null;
  public readonly retryable: boolean;
  public readonly requestId: string | null;
  public readonly retryAfterMs?: number;
  public readonly supportedVersions?: string[];
  public readonly promptTokens?: number;
  public readonly maxContext?: number;

  constructor(
    code: UOAIErrorCode,
    message?: string,
    opts?: {
      param?: string | null;
      requestId?: string | null;
      retryAfterMs?: number;
      supportedVersions?: string[];
      promptTokens?: number;
      maxContext?: number;
    }
  ) {
    const meta = ERROR_CATALOGUE[code];
    super(message ?? meta.defaultMessage);
    this.name = "UOAIError";
    this.type = meta.type;
    this.code = code;
    this.param = opts?.param ?? null;
    this.retryable = meta.retryable;
    this.requestId = opts?.requestId ?? null;
    this.retryAfterMs = opts?.retryAfterMs;
    this.supportedVersions = opts?.supportedVersions;
    this.promptTokens = opts?.promptTokens;
    this.maxContext = opts?.maxContext;
  }

  toPayload(): UOAIErrorPayload {
    return {
      error: {
        type: this.type,
        code: this.code,
        message: this.message,
        param: this.param,
        retryable: this.retryable,
        request_id: this.requestId,
        ...(this.retryAfterMs !== undefined ? { retry_after_ms: this.retryAfterMs } : {}),
        ...(this.supportedVersions !== undefined
          ? { supported_versions: this.supportedVersions }
          : {}),
        ...(this.promptTokens !== undefined ? { prompt_tokens: this.promptTokens } : {}),
        ...(this.maxContext !== undefined ? { max_context: this.maxContext } : {})
      }
    };
  }

  static fromPayload(payload: UOAIErrorPayload): UOAIError {
    const e = payload.error;
    return new UOAIError(e.code, e.message, {
      param: e.param ?? null,
      requestId: e.request_id ?? null,
      retryAfterMs: e.retry_after_ms,
      supportedVersions: e.supported_versions,
      promptTokens: e.prompt_tokens,
      maxContext: e.max_context
    });
  }
}

export function createErrorPayload(
  code: UOAIErrorCode,
  message?: string,
  opts?: ConstructorParameters<typeof UOAIError>[2]
): UOAIErrorPayload {
  return new UOAIError(code, message, opts).toPayload();
}

// ============================================================================
// 2. Logical OpenAI-Inspired API Schemas (API_REQUIREMENTS.md §5)
// ============================================================================

export const ChatRoleSchema = z.enum(["system", "user", "assistant"]);

export const ChatMessageSchema = z
  .object({
    role: ChatRoleSchema,
    content: z.string()
  })
  .strict();

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const UNSUPPORTED_COMPLETION_PARAMS = [
  "tools",
  "tool_choice",
  "functions",
  "function_call",
  "logprobs",
  "top_logprobs",
  "response_format",
  "audio",
  "modalities"
] as const;

export const ChatCompletionCreateParamsSchema = z
  .object({
    model: z.string().min(1).max(128),
    messages: z.array(ChatMessageSchema).min(1).max(MAX_MESSAGES_PER_REQUEST),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    max_tokens: z.number().int().positive().max(32768).optional(),
    stop: z
      .union([
        z.string().min(1).max(64),
        z.array(z.string().min(1).max(64)).max(4)
      ])
      .optional(),
    seed: z.number().int().optional(),
    stream: z.boolean().optional(),
    stream_options: z
      .object({
        include_usage: z.boolean().optional()
      })
      .strict()
      .optional(),
    n: z.literal(1).optional()
  })
  .strict();

export type ChatCompletionCreateParams = z.infer<typeof ChatCompletionCreateParamsSchema>;

export const UsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative()
});

export type TokenUsage = z.infer<typeof UsageSchema>;

export const FinishReasonSchema = z.enum(["stop", "length", "cancelled", "error"]);
export type FinishReason = z.infer<typeof FinishReasonSchema>;

export const ChatCompletionSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      message: z.object({
        role: z.literal("assistant"),
        content: z.string()
      }),
      finish_reason: FinishReasonSchema
    })
  ),
  usage: UsageSchema
});

export type ChatCompletion = z.infer<typeof ChatCompletionSchema>;

export const ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk"),
  created: z.number().int(),
  model: z.string(),
  sequence: z.number().int().nonnegative().optional(),
  choices: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      delta: z.object({
        role: z.literal("assistant").optional(),
        content: z.string().optional()
      }),
      finish_reason: FinishReasonSchema.nullable()
    })
  ),
  usage: UsageSchema.optional()
});

export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>;

export const ModelInfoSchema = z.object({
  id: z.string(),
  object: z.literal("model"),
  created: z.number().int(),
  owned_by: z.string(),
  uoai: z.object({
    version: z.string(),
    quantization: z.string(),
    max_context_length: z.number().int().positive(),
    default_context_length: z.number().int().positive(),
    loaded: z.boolean(),
    license: z.string()
  })
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const ModelListResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(ModelInfoSchema)
});

export type ModelListResponse = z.infer<typeof ModelListResponseSchema>;

export const HealthStatusSchema = z.object({
  status: z.enum(["ok", "degraded", "unavailable"]),
  provider: z.literal("uoai-extension"),
  provider_version: z.string(),
  protocol_version: z.string()
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const RuntimeStateSchema = z.enum([
  "not_started",
  "starting",
  "idle",
  "loading_model",
  "ready",
  "generating",
  "unloading",
  "recovering",
  "error"
]);

export const RuntimeStatusSchema = z.object({
  state: RuntimeStateSchema,
  loaded_model: z.string().nullable(),
  webgpu_available: z.boolean(),
  queue_length: z.number().int().nonnegative(),
  origin_pending_requests: z.number().int().nonnegative()
});

export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>;

// ============================================================================
// 3. Wire Envelopes (Bridge <-> Extension SW <-> SDK)
// ============================================================================

export const LogicalOperationSchema = z.enum([
  "GET /v1/health",
  "GET /v1/runtime",
  "GET /v1/models",
  "POST /v1/chat/completions"
]);

export type LogicalOperation = z.infer<typeof LogicalOperationSchema>;

export const ClientEnvelopeSchema = z.discriminatedUnion("type", [
  z
    .object({
      channel: z.literal(UOAI_BRIDGE_CHANNEL),
      type: z.literal("handshake_init"),
      nonce: z.string().min(4).max(128),
      sdkProtocolVersions: z.array(z.string()).min(1).max(10)
    })
    .strict(),
  z
    .object({
      channel: z.literal(UOAI_BRIDGE_CHANNEL),
      type: z.literal("api_request"),
      clientRequestId: z.string().min(1).max(128),
      operation: LogicalOperationSchema,
      payload: z.unknown().optional()
    })
    .strict(),
  z
    .object({
      channel: z.literal(UOAI_BRIDGE_CHANNEL),
      type: z.literal("cancel"),
      clientRequestId: z.string().min(1).max(128)
    })
    .strict()
]);

export type ClientEnvelope = z.infer<typeof ClientEnvelopeSchema>;

export const ProviderEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({
    channel: z.literal(UOAI_BRIDGE_CHANNEL),
    type: z.literal("handshake_ack"),
    nonce: z.string(),
    protocolVersion: z.string(),
    providerVersion: z.string()
  }),
  z.object({
    channel: z.literal(UOAI_BRIDGE_CHANNEL),
    type: z.literal("handshake_error"),
    nonce: z.string(),
    error: UOAIErrorPayloadSchema.shape.error
  }),
  z.object({
    channel: z.literal(UOAI_BRIDGE_CHANNEL),
    type: z.literal("api_response"),
    clientRequestId: z.string(),
    providerRequestId: z.string(),
    data: z.unknown()
  }),
  z.object({
    channel: z.literal(UOAI_BRIDGE_CHANNEL),
    type: z.literal("api_error"),
    clientRequestId: z.string(),
    providerRequestId: z.string().optional(),
    error: UOAIErrorPayloadSchema.shape.error
  }),
  z.object({
    channel: z.literal(UOAI_BRIDGE_CHANNEL),
    type: z.literal("stream_chunk"),
    clientRequestId: z.string(),
    providerRequestId: z.string(),
    chunk: ChatCompletionChunkSchema
  }),
  z.object({
    channel: z.literal(UOAI_BRIDGE_CHANNEL),
    type: z.literal("stream_done"),
    clientRequestId: z.string(),
    providerRequestId: z.string()
  }),
  z.object({
    channel: z.literal(UOAI_BRIDGE_CHANNEL),
    type: z.literal("event"),
    event: z.enum(["runtime_status", "permission_revoked", "permission_granted", "disconnected"]),
    data: z.unknown().optional()
  })
]);

export type ProviderEnvelope = z.infer<typeof ProviderEnvelopeSchema>;

// ============================================================================
// 4. Validation Helpers (FR-066, FR-116, BR-16)
// ============================================================================

export function measureSerializedBytes(value: unknown): number {
  const json = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return new TextEncoder().encode(json).byteLength;
}

export function assertPayloadSizeWithinLimit(
  value: unknown,
  maxBytes: number = MAX_REQUEST_PAYLOAD_BYTES
): void {
  const bytes = measureSerializedBytes(value);
  if (bytes > maxBytes) {
    throw new UOAIError(
      "payload_too_large",
      `Request payload (${bytes} bytes) exceeds maximum allowed size of ${maxBytes} bytes.`
    );
  }
}

export function validateChatCompletionParams(raw: unknown): ChatCompletionCreateParams {
  assertPayloadSizeWithinLimit(raw);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const unsupported of UNSUPPORTED_COMPLETION_PARAMS) {
      if (unsupported in obj && obj[unsupported] !== undefined) {
        throw new UOAIError(
          "invalid_request",
          `Parameter '${unsupported}' is not supported in UOAI MVP.`,
          { param: unsupported }
        );
      }
    }
    if ("n" in obj && obj.n !== undefined && obj.n !== 1) {
      throw new UOAIError("invalid_request", "Only n=1 is supported in UOAI MVP.", {
        param: "n"
      });
    }
  }
  const parsed = ChatCompletionCreateParamsSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const param = first?.path?.length ? first.path.join(".") : null;
    throw new UOAIError(
      "invalid_request",
      first ? `${param ? `${param}: ` : ""}${first.message}` : "Invalid chat completion request.",
      { param }
    );
  }
  return parsed.data;
}

/**
 * Validates origin strings strictly (BR-04, FR-060, OQ-22).
 * Rejects paths, wildcards, queries, fragments, and non-HTTPS remote hosts.
 */
export function validateOriginString(
  input: string,
  opts?: { allowLocalhostHttp?: boolean }
): { valid: true; origin: string } | { valid: false; reason: string } {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("*")) {
    return { valid: false, reason: "Wildcards and empty origins are not allowed." };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { valid: false, reason: "Enter a full origin such as https://app.example.com." };
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    return {
      valid: false,
      reason: "Specify only scheme, host, and optional port (no path, query, or credentials)."
    };
  }
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:") {
    return { valid: true, origin: url.origin };
  }
  if (url.protocol === "http:" && isLocalhost) {
    if (opts?.allowLocalhostHttp) {
      return { valid: true, origin: url.origin };
    }
    return {
      valid: false,
      reason: "Enable Developer Mode in Settings to authorize http://localhost origins."
    };
  }
  return { valid: false, reason: "Only HTTPS origins are allowed (or http://localhost in Developer Mode)." };
}

export function generateRequestId(prefix: string = "req"): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}
