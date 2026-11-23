import { describe, expect, it } from "vitest";
import {
  ClientEnvelopeSchema,
  ERROR_CATALOGUE,
  ErrorCodeSchema,
  UOAIError,
  assertPayloadSizeWithinLimit,
  validateChatCompletionParams,
  validateOriginString
} from "@uoai/api-protocol";
import { MAX_REQUEST_PAYLOAD_BYTES } from "@uoai/shared-types";

describe("API Protocol Schemas, Origin Validation, and 10,000-Case Fuzzing (TC-031)", () => {
  it("covers every catalogued error code with user-facing plain-language guidance (FR-037, NFR-024)", () => {
    for (const code of ErrorCodeSchema.options) {
      const meta = ERROR_CATALOGUE[code];
      expect(meta).toBeDefined();
      expect(meta.userTitle.length).toBeGreaterThan(2);
      expect(meta.userGuidance.length).toBeGreaterThan(5);
      const err = new UOAIError(code);
      const roundtrip = UOAIError.fromPayload(err.toPayload());
      expect(roundtrip.code).toBe(code);
      expect(roundtrip.retryable).toBe(meta.retryable);
    }
  });

  it("rejects payloads exceeding 256 KB with payload_too_large (BR-16, TC-031)", () => {
    const oversized = {
      model: "uoai-local-smoke-v1",
      messages: [{ role: "user", content: "A".repeat(MAX_REQUEST_PAYLOAD_BYTES + 100) }]
    };
    expect(() => assertPayloadSizeWithinLimit(oversized)).toThrowError(UOAIError);
    try {
      validateChatCompletionParams(oversized);
    } catch (e) {
      expect((e as UOAIError).code).toBe("payload_too_large");
    }
  });

  it("rejects unsupported OpenAI parameters with param attribution (API_REQUIREMENTS §5.3)", () => {
    for (const param of ["tools", "functions", "logprobs", "response_format", "audio"]) {
      try {
        validateChatCompletionParams({
          model: "gemma-4-e2b",
          messages: [{ role: "user", content: "hi" }],
          [param]: {}
        });
        expect.fail(`Expected ${param} to throw`);
      } catch (err) {
        expect(err).toBeInstanceOf(UOAIError);
        expect((err as UOAIError).code).toBe("invalid_request");
        expect((err as UOAIError).param).toBe(param);
      }
    }
  });

  it("enforces strict HTTPS / Dev-mode localhost origin validation (BR-04, FR-060, OQ-22)", () => {
    expect(validateOriginString("https://notes.example.com")).toEqual({
      valid: true,
      origin: "https://notes.example.com"
    });
    expect(validateOriginString("https://notes.example.com:8443")).toEqual({
      valid: true,
      origin: "https://notes.example.com:8443"
    });
    expect(validateOriginString("https://notes.example.com/path").valid).toBe(false);
    expect(validateOriginString("https://*.example.com").valid).toBe(false);
    expect(validateOriginString("http://notes.example.com").valid).toBe(false);
    expect(validateOriginString("http://localhost:5173", { allowLocalhostHttp: false }).valid).toBe(
      false
    );
    expect(validateOriginString("http://localhost:5173", { allowLocalhostHttp: true })).toEqual({
      valid: true,
      origin: "http://localhost:5173"
    });
  });

  it("survives 10,000 malformed/fuzzed protocol envelopes without crashing (TC-031, NFR-015)", () => {
    const seeds: unknown[] = [
      null,
      undefined,
      0,
      -1,
      NaN,
      "",
      "not-json",
      [],
      {},
      { channel: "wrong" },
      { channel: "uoai-bridge-v1", type: "unknown" },
      { channel: "uoai-bridge-v1", type: "api_request", operation: "DELETE /v1/models" },
      { __proto__: { polluted: true }, channel: "uoai-bridge-v1", type: "cancel" },
      { channel: "uoai-bridge-v1", type: "handshake_init", nonce: "a", sdkProtocolVersions: [] }
    ];

    for (let i = 0; i < 10_000; i++) {
      const candidate =
        i < seeds.length
          ? seeds[i]
          : {
              channel: i % 2 === 0 ? "uoai-bridge-v1" : `bad-${i}`,
              type: i % 3 === 0 ? "api_request" : i % 3 === 1 ? "cancel" : `fuzz_${i}`,
              clientRequestId: i % 5 === 0 ? 12345 : `id_${i}`,
              operation: i % 7 === 0 ? "POST /v1/chat/completions" : "GET /v1/evil",
              payload: i % 4 === 0 ? { model: "", messages: [] } : [i, null, { nested: true }]
            };
      const envRes = ClientEnvelopeSchema.safeParse(candidate);
      if (envRes.success && envRes.data.type === "api_request") {
        try {
          validateChatCompletionParams(envRes.data.payload);
        } catch (err) {
          expect(err).toBeInstanceOf(UOAIError);
        }
      }
    }
    // Ensure prototype was never polluted
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
