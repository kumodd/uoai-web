import { z } from "zod";
import {
  STORAGE_SAFETY_MARGIN_RATIO,
  type CapabilityProfile,
  type CompatibilityAssessment
} from "@uoai/shared-types";

// ============================================================================
// 1. Model Manifest & Registry Schemas (MODEL_COMPATIBILITY_REQUIREMENTS.md §4)
// ============================================================================

export const ModelArtifactSchema = z.object({
  path: z.string().min(1),
  url: z.string().url(),
  size_bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i, "Must be a 64-character hex SHA-256 digest")
});

export type ModelArtifact = z.infer<typeof ModelArtifactSchema>;

export const ModelLicenseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  requires_acceptance: z.boolean(),
  bundled_license_path: z.string().min(1),
  attribution: z.string().min(1),
  restrictions_summary: z.string().min(1)
});

export type ModelLicense = z.infer<typeof ModelLicenseSchema>;

export const ModelHardwareRequirementsSchema = z.object({
  webgpu_required: z.boolean(),
  required_features: z.array(z.string()),
  min_max_buffer_size_bytes: z.number().int().nonnegative(),
  min_max_storage_buffer_binding_size_bytes: z.number().int().nonnegative(),
  estimated_download_size_bytes: z.number().int().nonnegative(),
  estimated_runtime_memory_bytes: z.number().int().nonnegative(),
  recommended_system_ram_gb: z.number().positive()
});

export type ModelHardwareRequirements = z.infer<typeof ModelHardwareRequirementsSchema>;

export const ModelManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  name: z.string().min(1),
  version: z.string().min(1),
  status: z.enum(["qualified", "candidate", "deprecated"]),
  category: z.enum(["general", "coding", "reasoning", "lightweight", "testing"]).optional(),
  publisher: z.string().min(1),
  description: z.string().min(1),
  intended_uses: z.string().min(1),
  limitations: z.string().min(1),
  adapter: z.enum(["transformers-js-onnx-webgpu", "uoai-local-deterministic"]),
  hf_repo_id: z.string().optional(),
  quantization: z.string().min(1),
  context_length: z.object({
    max_supported: z.number().int().positive(),
    uoai_default: z.number().int().positive()
  }),
  default_sampling: z.object({
    temperature: z.number().min(0).max(2),
    top_p: z.number().min(0).max(1),
    stop_sequences: z.array(z.string()).max(8)
  }),
  hardware_requirements: ModelHardwareRequirementsSchema,
  license: ModelLicenseSchema,
  artifacts: z.array(ModelArtifactSchema).min(1),
  qualification_metadata: z.object({
    qualified_date: z.string().nullable(),
    tested_reference_configs: z.array(z.string())
  })
});

export type ModelManifest = z.infer<typeof ModelManifestSchema>;

export const ModelRegistrySchema = z.object({
  schema_version: z.literal("1.0"),
  registry_version: z.string().min(1),
  updated_at: z.string().min(1),
  models: z.array(ModelManifestSchema)
});

export type ModelRegistry = z.infer<typeof ModelRegistrySchema>;

// ============================================================================
// 2. Bundled Offline License Texts (FR-015)
// ============================================================================

export const BUNDLED_LICENSES: Record<string, string> = {
  "licenses/gemma-terms.txt": `Gemma Terms of Use (Summary — Offline Reference Copy)

Gemma is provided under and subject to the Gemma Terms of Use found at https://ai.google.dev/gemma/terms.
By downloading and using Gemma models via Universal Offline AI (UOAI), you agree to abide by the Gemma Terms of Use and Prohibited Use Policy, including attribution and redistribution notice requirements.
All inference occurs strictly locally on your device.`,

  "licenses/apache-2.0.txt": `Apache License, Version 2.0 (Offline Reference Copy)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use these model weights except in compliance with the License.
You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.`,

  "licenses/mit.txt": `MIT License (Offline Reference Copy)

Permission is hereby granted, free of charge, to any person obtaining a copy of these model weights and associated files, to deal in the files without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies, subject to including the copyright and permission notice.
THE MODEL IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.`,

  "licenses/llama3-2-community.txt": `Llama 3.2 Community License Agreement (Summary — Offline Reference Copy)

Built with Llama. Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.
Full terms: https://www.llama.com/llama3_2/license/
By downloading and using Llama 3.2 models in Universal Offline AI (UOAI), you agree to the Llama 3.2 Community License and Acceptable Use Policy.`
};

export function getBundledLicenseText(bundledPath: string): string {
  return (
    BUNDLED_LICENSES[bundledPath] ??
    "License text not bundled. Review license metadata prior to downloading."
  );
}

// ============================================================================
// 3. Curated Bundled Model Registry (OQ-01 = Option B + Smoke Test Model)
// ============================================================================

/**
 * Built-in verified smoke-test artifact contents & exact SHA-256 digests.
 * Used for offline verification, CI/E2E testing, and instant local runtime checks.
 */
export const SMOKE_MODEL_CONFIG_JSON = JSON.stringify(
  {
    model_type: "uoai-local-smoke",
    vocab_size: 32000,
    max_position_embeddings: 4096,
    eos_token: "<|endoftext|>",
    chat_template: "chatml"
  },
  null,
  2
);

export const SMOKE_MODEL_TOKENIZER_JSON = JSON.stringify(
  {
    version: "1.0",
    eos_token: "<|endoftext|>",
    bos_token: "<|startoftext|>",
    special_tokens: ["<|im_start|>", "<|im_end|>", "<|endoftext|>"]
  },
  null,
  2
);

export const SMOKE_MODEL_WEIGHTS_TEXT =
  "UOAI-LOCAL-SMOKE-V1-VERIFIED-WEIGHTS-BLOCK-0001::OFFLINE-WEBGPU-CAPABLE";

// Exact SHA-256 digests verified by unit tests against SMOKE_MODEL_* constants above
export const BUNDLED_MODEL_REGISTRY: ModelRegistry = {
  schema_version: "1.0",
  registry_version: "2026.11.24-mvp",
  updated_at: "2026-11-24T00:00:00Z",
  models: [
    {
      id: "gemma-4-e2b",
      name: "Gemma 4 E2B Instruct",
      version: "1.0.0",
      status: "candidate",
      category: "general",
      publisher: "Google",
      description:
        "Compact instruction-tuned model candidate for private, on-device drafting, summarization, and Q&A.",
      intended_uses: "General drafting, local summarization, private Q&A, coding assistance.",
      limitations:
        "Candidate status pending full Phase 0 WebGPU shader & memory qualification across RC-1–RC-3. Requires shader-f16 WebGPU support.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "onnx-community/gemma-4-E2B-it-ONNX",
      quantization: "q4f16",
      context_length: {
        max_supported: 8192,
        uoai_default: 4096
      },
      default_sampling: {
        temperature: 0.7,
        top_p: 0.95,
        stop_sequences: ["<end_of_turn>", "<eos>"]
      },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 1_073_741_824, // 1 GB
        min_max_storage_buffer_binding_size_bytes: 536_870_912, // 512 MB
        estimated_download_size_bytes: 3_130_533_026, // ~3.13 GB (decoder + embed q4f16 + tokenizer)
        estimated_runtime_memory_bytes: 4_294_967_296, // ~4.3 GB
        recommended_system_ram_gb: 16
      },
      license: {
        id: "gemma-terms",
        name: "Gemma Terms of Use",
        version: "2024-02",
        requires_acceptance: true,
        bundled_license_path: "licenses/gemma-terms.txt",
        attribution:
          "Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms.",
        restrictions_summary: "Subject to Gemma Terms of Use and Prohibited Use Policy."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main/config.json",
          size_bytes: 5549,
          sha256: "5494e6677d9e150ea20ba3101ae8a32b0f141004626f052725d8bf48991b9faa"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main/tokenizer_config.json",
          size_bytes: 18590,
          sha256: "175c298b7bedbe83b3f2d6eecdc1fc9058cb4ff6d9f115c5990bc82d96336b9e"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main/tokenizer.json",
          size_bytes: 19_439_251,
          sha256: "47bd35616c7c782aaca6ccf48c75f3461d5877170984b8836b375107d0a9f566"
        },
        {
          path: "onnx/decoder_model_merged_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main/onnx/decoder_model_merged_q4f16.onnx",
          size_bytes: 673_231,
          sha256: "73c0f1fe04f9a3a048fb3319c0671b6cf0346bf33a3a8624c853bcffe01c24a4"
        },
        {
          path: "onnx/decoder_model_merged_q4f16.onnx_data",
          url: "https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main/onnx/decoder_model_merged_q4f16.onnx_data",
          size_bytes: 1_519_700_992,
          sha256: "3b27245a7396cb7039a4e4118bd2a8aa35106bae381522edf7c4867b5f22bb10"
        },
        {
          path: "onnx/embed_tokens_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main/onnx/embed_tokens_q4f16.onnx",
          size_bytes: 5621,
          sha256: "d7ca53f6a169471b5699b2f57ee4c7aa2c73732b0152f3909e64b71384444825"
        },
        {
          path: "onnx/embed_tokens_q4f16.onnx_data",
          url: "https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main/onnx/embed_tokens_q4f16.onnx_data",
          size_bytes: 1_590_689_792,
          sha256: "024b199e6358ed42970f807686add5f9430d7e254ca7ce22fc9c83f015b9c517"
        }
      ],
      qualification_metadata: {
        qualified_date: null,
        tested_reference_configs: ["RC-1", "RC-2", "RC-3"]
      }
    },
    {
      id: "smollm2-360m-instruct",
      name: "SmolLM2 360M Instruct",
      version: "1.0.0",
      status: "qualified",
      category: "lightweight",
      publisher: "HuggingFaceTB",
      description:
        "Lightweight (< 1 GB) Apache-2.0 fallback model for 8 GB integrated-GPU laptops and fast offline setup (OQ-01 Option B).",
      intended_uses: "Fast offline drafting, note summarization, lightweight chat on 8 GB devices.",
      limitations:
        "Smaller parameter count yields lower world-knowledge accuracy than 2B+ models.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "HuggingFaceTB/SmolLM2-360M-Instruct",
      quantization: "q4",
      context_length: {
        max_supported: 8192,
        uoai_default: 2048
      },
      default_sampling: {
        temperature: 0.6,
        top_p: 0.9,
        stop_sequences: ["<|im_end|>", "<|endoftext|>"]
      },
      hardware_requirements: {
        webgpu_required: true,
        required_features: [],
        min_max_buffer_size_bytes: 268_435_456, // 256 MB
        min_max_storage_buffer_binding_size_bytes: 134_217_728, // 128 MB
        estimated_download_size_bytes: 390_052_412, // ~390 MB
        estimated_runtime_memory_bytes: 700_000_000, // ~700 MB
        recommended_system_ram_gb: 8
      },
      license: {
        id: "apache-2.0",
        name: "Apache License 2.0",
        version: "2.0",
        requires_acceptance: false,
        bundled_license_path: "licenses/apache-2.0.txt",
        attribution: "SmolLM2 by HuggingFaceTB, licensed under Apache-2.0.",
        restrictions_summary: "Permissive commercial & non-commercial use with attribution."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/resolve/main/config.json",
          size_bytes: 846,
          sha256: "224f72354f10d617a359cc82ad15a3c96e866b9b2ffadb81997eeea9e88e22ee"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/resolve/main/tokenizer_config.json",
          size_bytes: 3764,
          sha256: "4ec77d44f62efeb38d7e044a1db318f6a939438425312dfa333b8382dbad98df"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/resolve/main/tokenizer.json",
          size_bytes: 2_104_556,
          sha256: "9ca9acddb6525a194ec8ac7a87f24fbba7232a9a15ffa1af0c1224fcd888e47c"
        },
        {
          path: "onnx/model_q4.onnx",
          url: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/resolve/main/onnx/model_q4.onnx",
          size_bytes: 387_943_246,
          sha256: "a4ffda96e65beafc6f6cef0cbcf9fdc1cbdd79c230906bf3897d190547c7a596"
        }
      ],
      qualification_metadata: {
        qualified_date: "2026-11-24",
        tested_reference_configs: ["RC-1", "RC-2", "RC-3", "RC-4"]
      }
    },
    {
      id: "qwen2-5-0-5b-instruct",
      name: "Qwen 2.5 0.5B Instruct",
      version: "1.0.0",
      status: "qualified",
      category: "lightweight",
      publisher: "Qwen / ONNX Community",
      description:
        "Fast, crisp 0.5B WebGPU instruction model with strong multilingual and JSON/summarization accuracy in under 500 MB.",
      intended_uses: "Fast everyday chat, summarization, drafting, and multilingual Q&A on 8 GB+ laptops.",
      limitations: "Compact 0.5B size has limited deep factual recall compared to 1.5B–3B models.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "onnx-community/Qwen2.5-0.5B-Instruct",
      quantization: "q4f16",
      context_length: { max_supported: 32768, uoai_default: 4096 },
      default_sampling: { temperature: 0.7, top_p: 0.9, stop_sequences: ["<|im_end|>", "<|endoftext|>"] },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 536_870_912,
        min_max_storage_buffer_binding_size_bytes: 134_217_728,
        estimated_download_size_bytes: 490_044_024,
        estimated_runtime_memory_bytes: 900_000_000,
        recommended_system_ram_gb: 8
      },
      license: {
        id: "apache-2.0",
        name: "Apache License 2.0",
        version: "2.0",
        requires_acceptance: false,
        bundled_license_path: "licenses/apache-2.0.txt",
        attribution: "Qwen 2.5 by Alibaba Cloud (Apache-2.0); ONNX WebGPU export by onnx-community.",
        restrictions_summary: "Permissive Apache-2.0 license."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/config.json",
          size_bytes: 678,
          sha256: "777e01f0fbb3346eb229cb6fb278ed6533c1e4dcb9ebf4bed0f6e94ef17fa1b5"
        },
        {
          path: "generation_config.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/generation_config.json",
          size_bytes: 242,
          sha256: "f7e7ce458658b2d40d9eb213b91b77a8bf698845ab89360976722d7ac46928a3"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/tokenizer_config.json",
          size_bytes: 7849,
          sha256: "6a14243f0ae04884e597b3f032c05e15de9f417318fdcac24ab4e2680e691430"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/tokenizer.json",
          size_bytes: 7_031_673,
          sha256: "a8506e7111b80c6d8635951a02eab0f4e1a8e4e5772da83846579e97b16f61bf"
        },
        {
          path: "onnx/model_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/onnx/model_q4f16.onnx",
          size_bytes: 483_003_582,
          sha256: "b11c1dd99efd57e6c6e5bc4443a019931a5fbd5dd500d48644d8225f5ce0b2cb"
        }
      ],
      qualification_metadata: { qualified_date: "2026-11-24", tested_reference_configs: ["RC-1", "RC-2", "RC-3"] }
    },
    {
      id: "qwen3-0-6b",
      name: "Qwen 3 0.6B (WebGPU)",
      version: "1.0.0",
      status: "qualified",
      category: "reasoning",
      publisher: "Qwen / ONNX Community",
      description:
        "Modern Qwen 3 0.6B ONNX WebGPU model supporting fast local chat and compact thinking/reasoning under 600 MB.",
      intended_uses: "Fast on-device chat, structured reasoning, and quick Q&A on laptops.",
      limitations: "Requires shader-f16 WebGPU support; smaller capacity than Qwen 3 1.7B.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "onnx-community/Qwen3-0.6B-ONNX",
      quantization: "q4f16",
      context_length: { max_supported: 32768, uoai_default: 4096 },
      default_sampling: { temperature: 0.6, top_p: 0.95, stop_sequences: ["<|im_end|>", "<|endoftext|>"] },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 536_870_912,
        min_max_storage_buffer_binding_size_bytes: 134_217_728,
        estimated_download_size_bytes: 578_918_290,
        estimated_runtime_memory_bytes: 1_050_000_000,
        recommended_system_ram_gb: 8
      },
      license: {
        id: "apache-2.0",
        name: "Apache License 2.0",
        version: "2.0",
        requires_acceptance: false,
        bundled_license_path: "licenses/apache-2.0.txt",
        attribution: "Qwen 3 by Alibaba Cloud (Apache-2.0); ONNX WebGPU export by onnx-community.",
        restrictions_summary: "Permissive Apache-2.0 license."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/resolve/main/config.json",
          size_bytes: 912,
          sha256: "8a04114ba59cc42b47d804d35d1d5c61d746ae4634f41f796768c6e302d39b9e"
        },
        {
          path: "generation_config.json",
          url: "https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/resolve/main/generation_config.json",
          size_bytes: 219,
          sha256: "9e9e031ae8bca36eefcdcdd0b35d83c61baa01e31d68d5f5a961c9ca1a4b95bf"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/resolve/main/tokenizer_config.json",
          size_bytes: 10369,
          sha256: "7c5194eecfd95a4dcbd6b4b502af785d2541fd65a388d1cae7ad43693c67b802"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/resolve/main/tokenizer.json",
          size_bytes: 9_117_040,
          sha256: "e7a95fce95bf5b0946d0ddb3f9d7caa030b7e850bbe92b0edb26bcf563e9f3d5"
        },
        {
          path: "onnx/model_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/resolve/main/onnx/model_q4f16.onnx",
          size_bytes: 569_789_750,
          sha256: "9e33a5911974174761d0dfdcc0bec975d9c45af0eae5e9eb647b8ba9442a8f91"
        }
      ],
      qualification_metadata: { qualified_date: "2026-11-24", tested_reference_configs: ["RC-1", "RC-2", "RC-3"] }
    },
    {
      id: "gemma-3-1b-it",
      name: "Gemma 3 1B Instruct (WebGPU)",
      version: "1.0.0",
      status: "qualified",
      category: "general",
      publisher: "Google / ONNX Community",
      description:
        "Google's fast 1B WebGPU-native instruction model with sharded ONNX weights for smooth memory allocation on laptops.",
      intended_uses: "Clean prose drafting, summarization, rewriting, and general Q&A offline.",
      limitations: "Subject to Gemma Terms of Use; requires shader-f16.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "onnx-community/gemma-3-1b-it-ONNX",
      quantization: "q4f16",
      context_length: { max_supported: 32768, uoai_default: 4096 },
      default_sampling: { temperature: 0.7, top_p: 0.95, stop_sequences: ["<end_of_turn>", "<eos>"] },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 1_073_741_824,
        min_max_storage_buffer_binding_size_bytes: 268_435_456,
        estimated_download_size_bytes: 783_856_804,
        estimated_runtime_memory_bytes: 1_400_000_000,
        recommended_system_ram_gb: 8
      },
      license: {
        id: "gemma-terms",
        name: "Gemma Terms of Use",
        version: "2024-02",
        requires_acceptance: true,
        bundled_license_path: "licenses/gemma-terms.txt",
        attribution: "Gemma is provided under and subject to the Gemma Terms of Use (ai.google.dev/gemma/terms).",
        restrictions_summary: "Subject to Gemma Terms of Use and Prohibited Use Policy."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX/resolve/main/config.json",
          size_bytes: 1975,
          sha256: "91e864295e06e3069a26e89dc5d7e506d32153b23a29bf283e8e3a46fc546806"
        },
        {
          path: "generation_config.json",
          url: "https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX/resolve/main/generation_config.json",
          size_bytes: 244,
          sha256: "2ff57fef908e4da8accc2e369d2c848785e6f2f8c5d1ed102bd9cb9aa70f7aaa"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX/resolve/main/tokenizer_config.json",
          size_bytes: 2327,
          sha256: "362055c2b4c69af56db94be4f1297bc6d2936a8f4ab9c0173b5bedd502280507"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX/resolve/main/tokenizer.json",
          size_bytes: 20_323_013,
          sha256: "55da1312bdf1d7d8fe8d9d1b3eed04086261149e6034e0ac3f8c633b67f5aac8"
        },
        {
          path: "onnx/model_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX/resolve/main/onnx/model_q4f16.onnx",
          size_bytes: 461_341,
          sha256: "522d1f0e1d1fd0065ca02d61a0bf17a43701c1835b4ebf0c4628b73f1a6fb796"
        },
        {
          path: "onnx/model_q4f16.onnx_data",
          url: "https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX/resolve/main/onnx/model_q4f16.onnx_data",
          size_bytes: 763_067_904,
          sha256: "6fb9bc8dd4b93a040bcea60c953c2e24f60f9d52e708befec077f6ab60baa007"
        }
      ],
      qualification_metadata: { qualified_date: "2026-11-24", tested_reference_configs: ["RC-1", "RC-2", "RC-3"] }
    },
    {
      id: "qwen2-5-coder-0-5b-instruct",
      name: "Qwen 2.5 Coder 0.5B Instruct",
      version: "1.0.0",
      status: "qualified",
      category: "coding",
      publisher: "Qwen / ONNX Community",
      description:
        "Ultra-fast 0.5B code-specialized WebGPU model for offline code snippets, regexes, SQL, and quick explanations.",
      intended_uses: "Lightweight offline coding assistant, code completion, and debugging explanations.",
      limitations: "For complex multi-file refactoring, prefer Qwen 2.5 Coder 1.5B Instruct.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "onnx-community/Qwen2.5-Coder-0.5B-Instruct",
      quantization: "q4f16",
      context_length: { max_supported: 32768, uoai_default: 4096 },
      default_sampling: { temperature: 0.3, top_p: 0.9, stop_sequences: ["<|im_end|>", "<|endoftext|>"] },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 536_870_912,
        min_max_storage_buffer_binding_size_bytes: 134_217_728,
        estimated_download_size_bytes: 566_366_737,
        estimated_runtime_memory_bytes: 1_000_000_000,
        recommended_system_ram_gb: 8
      },
      license: {
        id: "apache-2.0",
        name: "Apache License 2.0",
        version: "2.0",
        requires_acceptance: false,
        bundled_license_path: "licenses/apache-2.0.txt",
        attribution: "Qwen 2.5 Coder by Alibaba Cloud (Apache-2.0); ONNX export by onnx-community.",
        restrictions_summary: "Permissive Apache-2.0 license."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-Coder-0.5B-Instruct/resolve/main/config.json",
          size_bytes: 916,
          sha256: "0cc602159ab086bffa8500296b95f067dfc6b690863f7393b3ac5c82137c059b"
        },
        {
          path: "generation_config.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-Coder-0.5B-Instruct/resolve/main/generation_config.json",
          size_bytes: 243,
          sha256: "519a8db66fcfd0d18731eb75169ff8393a6f9c479fd50142fb5ee2580bb9ae64"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-Coder-0.5B-Instruct/resolve/main/tokenizer_config.json",
          size_bytes: 7849,
          sha256: "6a14243f0ae04884e597b3f032c05e15de9f417318fdcac24ab4e2680e691430"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-Coder-0.5B-Instruct/resolve/main/tokenizer.json",
          size_bytes: 11_421_896,
          sha256: "9c5ae00e602b8860cbd784ba82a8aa14e8feecec692e7076590d014d7b7fdafa"
        },
        {
          path: "onnx/model_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/Qwen2.5-Coder-0.5B-Instruct/resolve/main/onnx/model_q4f16.onnx",
          size_bytes: 554_935_833,
          sha256: "60c076ac0d3910881fe0cad75997e803459a5f71bb74bcbcd82407ef83db7ba0"
        }
      ],
      qualification_metadata: { qualified_date: "2026-11-24", tested_reference_configs: ["RC-1", "RC-2", "RC-3"] }
    },
    {
      id: "llama-3-2-1b-instruct",
      name: "Llama 3.2 1B Instruct (WebGPU)",
      version: "1.0.0",
      status: "qualified",
      category: "general",
      publisher: "Meta / ONNX Community",
      description:
        "Meta's compact 1B instruction model exported as sharded q4f16 ONNX for private on-device chat and summarization.",
      intended_uses: "General dialogue, rewriting, summarization, and structured extraction.",
      limitations: "Subject to Llama 3.2 Community License; requires shader-f16 and 8–16 GB RAM.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "onnx-community/Llama-3.2-1B-Instruct-ONNX",
      quantization: "q4f16",
      context_length: { max_supported: 131072, uoai_default: 4096 },
      default_sampling: { temperature: 0.6, top_p: 0.9, stop_sequences: ["<|eot_id|>", "<|end_of_text|>"] },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 1_073_741_824,
        min_max_storage_buffer_binding_size_bytes: 268_435_456,
        estimated_download_size_bytes: 1_101_386_715,
        estimated_runtime_memory_bytes: 1_900_000_000,
        recommended_system_ram_gb: 8
      },
      license: {
        id: "llama3-2-community",
        name: "Llama 3.2 Community License",
        version: "2024-09",
        requires_acceptance: true,
        bundled_license_path: "licenses/llama3-2-community.txt",
        attribution: "Built with Llama (Meta Platforms, Inc.).",
        restrictions_summary: "Subject to Llama 3.2 Community License and Acceptable Use Policy."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct-ONNX/resolve/main/config.json",
          size_bytes: 1161,
          sha256: "7004209e8cdba9890495946c86705430d67c4d167c45df8021df9c3466341ec4"
        },
        {
          path: "generation_config.json",
          url: "https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct-ONNX/resolve/main/generation_config.json",
          size_bytes: 188,
          sha256: "cc5b5a4024436a2188736eafbe1651f7e758f5478e0200eb0aeb3c2abf445660"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct-ONNX/resolve/main/tokenizer_config.json",
          size_bytes: 55306,
          sha256: "715e011c0f07dc42141db9f1c13a7ca401c7727ed95555199dbfffbf7d0f1937"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct-ONNX/resolve/main/tokenizer.json",
          size_bytes: 11_574_638,
          sha256: "3a223ade375cc1d13b04e897ce1d36a04f50140e1ba3d107021ea68d4b5e614c"
        },
        {
          path: "onnx/model_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct-ONNX/resolve/main/onnx/model_q4f16.onnx",
          size_bytes: 149_790,
          sha256: "fccc573530dbefac92a36797262e4228dc6fb474734d80f6781e37744550333c"
        },
        {
          path: "onnx/model_q4f16.onnx_data",
          url: "https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct-ONNX/resolve/main/onnx/model_q4f16.onnx_data",
          size_bytes: 1_089_605_632,
          sha256: "3f11fd184cd0b34f359cc2696c898026dfc0e169e56c3a2505ae964948a873f1"
        }
      ],
      qualification_metadata: { qualified_date: "2026-11-24", tested_reference_configs: ["RC-1", "RC-2", "RC-3"] }
    },
    {
      id: "smollm2-1-7b-instruct",
      name: "SmolLM2 1.7B Instruct",
      version: "1.0.0",
      status: "qualified",
      category: "general",
      publisher: "HuggingFaceTB",
      description:
        "HuggingFace's strongest open-recipe 1.7B on-device model (Apache-2.0) delivering fluent writing and reliable instruction following.",
      intended_uses: "Offline writing assistant, text summarization, email drafting, and general chat.",
      limitations: "Requires shader-f16 and ~2 GB GPU/unified memory.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
      quantization: "q4f16",
      context_length: { max_supported: 8192, uoai_default: 4096 },
      default_sampling: { temperature: 0.6, top_p: 0.9, stop_sequences: ["<|im_end|>", "<|endoftext|>"] },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 1_073_741_824,
        min_max_storage_buffer_binding_size_bytes: 268_435_456,
        estimated_download_size_bytes: 1_110_839_698,
        estimated_runtime_memory_bytes: 1_900_000_000,
        recommended_system_ram_gb: 8
      },
      license: {
        id: "apache-2.0",
        name: "Apache License 2.0",
        version: "2.0",
        requires_acceptance: false,
        bundled_license_path: "licenses/apache-2.0.txt",
        attribution: "SmolLM2 1.7B by HuggingFaceTB (Apache-2.0).",
        restrictions_summary: "Permissive Apache-2.0 license."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/resolve/main/config.json",
          size_bytes: 908,
          sha256: "994f50b16abb4ae00880baefe03c10260b5bd608d2bf586f7056ca05a534feea"
        },
        {
          path: "generation_config.json",
          url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/resolve/main/generation_config.json",
          size_bytes: 132,
          sha256: "87b916edaaab66b3899b9d0dd0752727dff6666686da0504d89ae0a6e055a013"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/resolve/main/tokenizer_config.json",
          size_bytes: 3764,
          sha256: "4ec77d44f62efeb38d7e044a1db318f6a939438425312dfa333b8382dbad98df"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/resolve/main/tokenizer.json",
          size_bytes: 2_104_556,
          sha256: "9ca9acddb6525a194ec8ac7a87f24fbba7232a9a15ffa1af0c1224fcd888e47c"
        },
        {
          path: "onnx/model_q4f16.onnx",
          url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/resolve/main/onnx/model_q4f16.onnx",
          size_bytes: 1_108_730_338,
          sha256: "d94946187fb5f27579f3db4ba21fb7f7466c7cbd18956bd420d3981f75282f9c"
        }
      ],
      qualification_metadata: { qualified_date: "2026-11-24", tested_reference_configs: ["RC-1", "RC-2", "RC-3"] }
    },
    {
      id: "qwen2-5-coder-1-5b-instruct",
      name: "Qwen 2.5 Coder 1.5B Instruct",
      version: "1.0.0",
      status: "qualified",
      category: "coding",
      publisher: "Qwen / ONNX Community",
      description:
        "Top-tier 1.5B local coding LLM for TypeScript, Python, Rust, SQL, debugging, and unit test generation directly on WebGPU.",
      intended_uses: "Offline code generation, refactoring, debugging, and technical documentation.",
      limitations: "Recommended 16 GB system RAM / Apple Silicon or discrete GPU with shader-f16.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "onnx-community/Qwen2.5-Coder-1.5B-Instruct",
      quantization: "q4f16",
      context_length: { max_supported: 32768, uoai_default: 4096 },
      default_sampling: { temperature: 0.25, top_p: 0.9, stop_sequences: ["<|im_end|>", "<|endoftext|>"] },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 1_073_741_824,
        min_max_storage_buffer_binding_size_bytes: 536_870_912,
        estimated_download_size_bytes: 1_355_668_005,
        estimated_runtime_memory_bytes: 2_300_000_000,
        recommended_system_ram_gb: 16
      },
      license: {
        id: "apache-2.0",
        name: "Apache License 2.0",
        version: "2.0",
        requires_acceptance: false,
        bundled_license_path: "licenses/apache-2.0.txt",
        attribution: "Qwen 2.5 Coder 1.5B by Alibaba Cloud (Apache-2.0); ONNX export by onnx-community.",
        restrictions_summary: "Permissive Apache-2.0 license."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-Coder-1.5B-Instruct/resolve/main/config.json",
          size_bytes: 948,
          sha256: "debf0b90deaf6cbcb066fc26e048d4f14414828114a206b09f263730b1ad7f3c"
        },
        {
          path: "generation_config.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-Coder-1.5B-Instruct/resolve/main/generation_config.json",
          size_bytes: 242,
          sha256: "0dc30d5b7f022dcbfaaef3e55340642208a3b0436214346caf1c522c009f699d"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-Coder-1.5B-Instruct/resolve/main/tokenizer_config.json",
          size_bytes: 7849,
          sha256: "6a14243f0ae04884e597b3f032c05e15de9f417318fdcac24ab4e2680e691430"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/onnx-community/Qwen2.5-Coder-1.5B-Instruct/resolve/main/tokenizer.json",
          size_bytes: 11_421_896,
          sha256: "9c5ae00e602b8860cbd784ba82a8aa14e8feecec692e7076590d014d7b7fdafa"
        },
        {
          path: "onnx/model_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/Qwen2.5-Coder-1.5B-Instruct/resolve/main/onnx/model_q4f16.onnx",
          size_bytes: 1_344_237_070,
          sha256: "0e33cbfde4be371039daad0032fb3782170442e6901a25d4deabe96117b89882"
        }
      ],
      qualification_metadata: { qualified_date: "2026-11-24", tested_reference_configs: ["RC-1", "RC-2"] }
    },
    {
      id: "deepseek-r1-distill-qwen-1-5b",
      name: "DeepSeek-R1-Distill-Qwen 1.5B",
      version: "1.0.0",
      status: "qualified",
      category: "reasoning",
      publisher: "DeepSeek / ONNX Community",
      description:
        "Dedicated step-by-step chain-of-thought reasoning LLM distilled from DeepSeek-R1, optimized in q4f16 for local WebGPU.",
      intended_uses: "Math, logic puzzles, structured analysis, and step-by-step problem solving offline.",
      limitations: "Produces longer thinking traces before the final answer; recommended 16 GB RAM.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX",
      quantization: "q4f16",
      context_length: { max_supported: 32768, uoai_default: 4096 },
      default_sampling: { temperature: 0.6, top_p: 0.95, stop_sequences: ["<｜end▁of▁sentence｜>", "<|endoftext|>"] },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 1_073_741_824,
        min_max_storage_buffer_binding_size_bytes: 536_870_912,
        estimated_download_size_bytes: 1_378_522_845,
        estimated_runtime_memory_bytes: 2_350_000_000,
        recommended_system_ram_gb: 16
      },
      license: {
        id: "mit",
        name: "MIT License",
        version: "1.0",
        requires_acceptance: false,
        bundled_license_path: "licenses/mit.txt",
        attribution: "DeepSeek-R1-Distill-Qwen-1.5B by DeepSeek-AI (MIT); ONNX export by onnx-community.",
        restrictions_summary: "Permissive MIT license."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX/resolve/main/config.json",
          size_bytes: 1000,
          sha256: "6921c4b2446d1eb03fbdbe3edcf7331806682bbb95ea5ec61f60b68974599739"
        },
        {
          path: "generation_config.json",
          url: "https://huggingface.co/onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX/resolve/main/generation_config.json",
          size_bytes: 132,
          sha256: "6b7eff7f36effbd0abff8c00bcc907b0a6f0f718263b93bb76fd63e4781fb06d"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX/resolve/main/tokenizer_config.json",
          size_bytes: 7062,
          sha256: "ad695e83df533dbf830bdb48b540bf2d1556e01e7500585fb7aef741ce3f0c2b"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX/resolve/main/tokenizer.json",
          size_bytes: 9_117_072,
          sha256: "0d7259f8a225ceaa421baf5ae0687e0e4a4239b86a6d1838aba50e2470d99341"
        },
        {
          path: "onnx/model_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX/resolve/main/onnx/model_q4f16.onnx",
          size_bytes: 1_369_397_579,
          sha256: "db35d720beb08c4cddc820af4d51c903d953afa12dc5fa084ed2467999875953"
        }
      ],
      qualification_metadata: { qualified_date: "2026-11-24", tested_reference_configs: ["RC-1", "RC-2"] }
    },
    {
      id: "qwen3-1-7b",
      name: "Qwen 3 1.7B (WebGPU)",
      version: "1.0.0",
      status: "qualified",
      category: "reasoning",
      publisher: "Qwen / ONNX Community",
      description:
        "High-quality balanced 1.7B Qwen 3 model excelling at general instruction following, coding, and reasoning on WebGPU.",
      intended_uses: "All-around local assistant, coding, analysis, and private brainstorming.",
      limitations: "Requires shader-f16 and recommended 16 GB RAM.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "onnx-community/Qwen3-1.7B-ONNX",
      quantization: "q4f16",
      context_length: { max_supported: 32768, uoai_default: 4096 },
      default_sampling: { temperature: 0.6, top_p: 0.95, stop_sequences: ["<|im_end|>", "<|endoftext|>"] },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 1_073_741_824,
        min_max_storage_buffer_binding_size_bytes: 536_870_912,
        estimated_download_size_bytes: 1_435_197_669,
        estimated_runtime_memory_bytes: 2_450_000_000,
        recommended_system_ram_gb: 16
      },
      license: {
        id: "apache-2.0",
        name: "Apache License 2.0",
        version: "2.0",
        requires_acceptance: false,
        bundled_license_path: "licenses/apache-2.0.txt",
        attribution: "Qwen 3 1.7B by Alibaba Cloud (Apache-2.0); ONNX export by onnx-community.",
        restrictions_summary: "Permissive Apache-2.0 license."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/onnx-community/Qwen3-1.7B-ONNX/resolve/main/config.json",
          size_bytes: 943,
          sha256: "d443f9cfc878a105bd075083230394623e477574e47061784744534361214d00"
        },
        {
          path: "generation_config.json",
          url: "https://huggingface.co/onnx-community/Qwen3-1.7B-ONNX/resolve/main/generation_config.json",
          size_bytes: 219,
          sha256: "9e9e031ae8bca36eefcdcdd0b35d83c61baa01e31d68d5f5a961c9ca1a4b95bf"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/onnx-community/Qwen3-1.7B-ONNX/resolve/main/tokenizer_config.json",
          size_bytes: 10369,
          sha256: "7c5194eecfd95a4dcbd6b4b502af785d2541fd65a388d1cae7ad43693c67b802"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/onnx-community/Qwen3-1.7B-ONNX/resolve/main/tokenizer.json",
          size_bytes: 9_117_040,
          sha256: "e7a95fce95bf5b0946d0ddb3f9d7caa030b7e850bbe92b0edb26bcf563e9f3d5"
        },
        {
          path: "onnx/model_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/Qwen3-1.7B-ONNX/resolve/main/onnx/model_q4f16.onnx",
          size_bytes: 1_426_069_098,
          sha256: "fb85b44defdf43ace50c7a4937127e889b9f8a0483eb87a6c4151a815c5da3b5"
        }
      ],
      qualification_metadata: { qualified_date: "2026-11-24", tested_reference_configs: ["RC-1", "RC-2"] }
    },
    {
      id: "phi-3-5-mini-instruct",
      name: "Phi-3.5 Mini Instruct (3.8B WebGPU)",
      version: "1.0.0",
      status: "qualified",
      category: "general",
      publisher: "Microsoft / ONNX Community",
      description:
        "Microsoft's flagship 3.8B model specifically exported for onnx-web WebGPU, delivering strong reasoning, summarization, and coding on 16 GB+ GPUs.",
      intended_uses: "High-accuracy local writing, document analysis, math, and coding on Apple Silicon / discrete GPUs.",
      limitations: "Large 2.32 GB download; requires shader-f16 and 16 GB+ RAM / ≥ 6 GB VRAM.",
      adapter: "transformers-js-onnx-webgpu",
      hf_repo_id: "onnx-community/Phi-3.5-mini-instruct-onnx-web",
      quantization: "q4f16",
      context_length: { max_supported: 131072, uoai_default: 4096 },
      default_sampling: { temperature: 0.5, top_p: 0.9, stop_sequences: ["<|end|>", "<|endoftext|>"] },
      hardware_requirements: {
        webgpu_required: true,
        required_features: ["shader-f16"],
        min_max_buffer_size_bytes: 1_073_741_824,
        min_max_storage_buffer_binding_size_bytes: 536_870_912,
        estimated_download_size_bytes: 2_319_325_340,
        estimated_runtime_memory_bytes: 3_600_000_000,
        recommended_system_ram_gb: 16
      },
      license: {
        id: "mit",
        name: "MIT License",
        version: "1.0",
        requires_acceptance: false,
        bundled_license_path: "licenses/mit.txt",
        attribution: "Phi-3.5-mini-instruct by Microsoft (MIT); onnx-web export by onnx-community.",
        restrictions_summary: "Permissive MIT license."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://huggingface.co/onnx-community/Phi-3.5-mini-instruct-onnx-web/resolve/main/config.json",
          size_bytes: 3479,
          sha256: "57117b05c57fd0412fdde4e7cd5a56396935f8dc0b1b4de3b30252b145422141"
        },
        {
          path: "generation_config.json",
          url: "https://huggingface.co/onnx-community/Phi-3.5-mini-instruct-onnx-web/resolve/main/generation_config.json",
          size_bytes: 195,
          sha256: "71ff75d883319b53e16cbb8c7b61363a5138e3d342fc79dd96c2b1cb208d8ff8"
        },
        {
          path: "tokenizer_config.json",
          url: "https://huggingface.co/onnx-community/Phi-3.5-mini-instruct-onnx-web/resolve/main/tokenizer_config.json",
          size_bytes: 3984,
          sha256: "92a6e3f894075fda19f47d8755c6ce65b2a974716307d13ae5d79196011ebb44"
        },
        {
          path: "tokenizer.json",
          url: "https://huggingface.co/onnx-community/Phi-3.5-mini-instruct-onnx-web/resolve/main/tokenizer.json",
          size_bytes: 1_844_408,
          sha256: "9e2ae3d66819f163cdcfedba5078f3a3af8118c2712491ed60912f77886bda6f"
        },
        {
          path: "onnx/model_q4f16.onnx",
          url: "https://huggingface.co/onnx-community/Phi-3.5-mini-instruct-onnx-web/resolve/main/onnx/model_q4f16.onnx",
          size_bytes: 220_452_346,
          sha256: "1e1119b8d3fa1adaaad4abaf0c0405dec377054948440e02dd6837d18d2a920d"
        },
        {
          path: "onnx/model_q4f16.onnx_data",
          url: "https://huggingface.co/onnx-community/Phi-3.5-mini-instruct-onnx-web/resolve/main/onnx/model_q4f16.onnx_data",
          size_bytes: 2_097_020_928,
          sha256: "b6dfb3069b717b518266dd58cb8e794bc0712fbc46e1737aef99cd8875302cf0"
        }
      ],
      qualification_metadata: { qualified_date: "2026-11-24", tested_reference_configs: ["RC-1", "RC-2"] }
    },
    {
      id: "uoai-local-smoke-v1",
      name: "UOAI Local Smoke Model (Verified Fast Test)",
      version: "1.0.0",
      status: "qualified",
      category: "testing",
      publisher: "UOAI",
      description:
        "Ultra-compact verified offline test model for validating local inference, streaming, cancellation, SHA-256 verification, and website SDK integration without multi-GB downloads.",
      intended_uses: "Offline verification, Developer Console testing, and SDK integration testing.",
      limitations: "Deterministic lightweight local model intended for verification and testing.",
      adapter: "uoai-local-deterministic",
      quantization: "q4",
      context_length: {
        max_supported: 4096,
        uoai_default: 2048
      },
      default_sampling: {
        temperature: 0.7,
        top_p: 0.95,
        stop_sequences: ["<|im_end|>", "<|endoftext|>"]
      },
      hardware_requirements: {
        webgpu_required: true,
        required_features: [],
        min_max_buffer_size_bytes: 67_108_864, // 64 MB
        min_max_storage_buffer_binding_size_bytes: 33_554_432, // 32 MB
        estimated_download_size_bytes:
          new TextEncoder().encode(SMOKE_MODEL_CONFIG_JSON).byteLength +
          new TextEncoder().encode(SMOKE_MODEL_TOKENIZER_JSON).byteLength +
          new TextEncoder().encode(SMOKE_MODEL_WEIGHTS_TEXT).byteLength,
        estimated_runtime_memory_bytes: 33_554_432,
        recommended_system_ram_gb: 4
      },
      license: {
        id: "apache-2.0",
        name: "Apache License 2.0",
        version: "2.0",
        requires_acceptance: false,
        bundled_license_path: "licenses/apache-2.0.txt",
        attribution: "UOAI Project — Apache-2.0.",
        restrictions_summary: "Permissive Apache-2.0 license."
      },
      artifacts: [
        {
          path: "config.json",
          url: "https://models.uoai.local/uoai-local-smoke-v1/config.json",
          size_bytes: new TextEncoder().encode(SMOKE_MODEL_CONFIG_JSON).byteLength,
          sha256: "28ff9ab2d0cfce2db53a133f40e2ff1df347e81de787415b76f66bf4beaf29dc"
        },
        {
          path: "tokenizer.json",
          url: "https://models.uoai.local/uoai-local-smoke-v1/tokenizer.json",
          size_bytes: new TextEncoder().encode(SMOKE_MODEL_TOKENIZER_JSON).byteLength,
          sha256: "fd32c400e032ede94a0abfbed50a44c594ac6d4dccddb8ee1a096d8c03a87107"
        },
        {
          path: "weights.bin",
          url: "https://models.uoai.local/uoai-local-smoke-v1/weights.bin",
          size_bytes: new TextEncoder().encode(SMOKE_MODEL_WEIGHTS_TEXT).byteLength,
          sha256: "ef301712a9721e67d8be8c82ab01dd6a185483ad051bad6b8b797ee5f9f64ab5"
        }
      ],
      qualification_metadata: {
        qualified_date: "2026-11-24",
        tested_reference_configs: ["RC-1", "RC-2", "RC-3", "RC-4", "RC-5"]
      }
    }
  ]
};

// ============================================================================
// 4. Model Identifier Parsing (API_REQUIREMENTS.md §6)
// ============================================================================

export interface ParsedModelIdentifier {
  baseId: string;
  version?: string;
  quantization?: string;
}

export function parseModelIdentifier(raw: string): ParsedModelIdentifier {
  const trimmed = raw.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex > 0) {
    return {
      baseId: trimmed.slice(0, atIndex),
      version: trimmed.slice(atIndex + 1)
    };
  }
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex > 0) {
    return {
      baseId: trimmed.slice(0, colonIndex),
      quantization: trimmed.slice(colonIndex + 1)
    };
  }
  return { baseId: trimmed };
}

export function findModelInRegistry(
  registry: ModelRegistry,
  modelId: string
): ModelManifest | undefined {
  const parsed = parseModelIdentifier(modelId);
  return registry.models.find((m) => {
    if (m.id !== parsed.baseId) return false;
    if (parsed.version && m.version !== parsed.version) return false;
    if (parsed.quantization && m.quantization !== parsed.quantization) return false;
    return true;
  });
}

// ============================================================================
// 5. Hardware Compatibility Evaluator (FR-012, FR-048, BR-13)
// ============================================================================

export function assessModelCompatibility(
  model: ModelManifest,
  capabilities: CapabilityProfile,
  opts?: { allowOverride?: boolean }
): CompatibilityAssessment {
  const reasons: string[] = [];
  let hardFail = false;
  let hasLimitation = false;

  const req = model.hardware_requirements;

  // 1. Strict WebGPU requirement (OQ-07 = Option A)
  if (req.webgpu_required && capabilities.webgpu.status === "unsupported") {
    hardFail = true;
    reasons.push(
      `WebGPU is unavailable (${capabilities.webgpu.reasonCode ?? "no_gpu_adapter"}).`
    );
  }

  // 2. Required WebGPU features (e.g., shader-f16)
  if (capabilities.webgpu.status !== "unsupported") {
    for (const feature of req.required_features) {
      if (!capabilities.webgpu.features.includes(feature)) {
        hardFail = true;
        reasons.push(`Device GPU lacks required WebGPU feature '${feature}'.`);
      }
    }

    // 3. WebGPU buffer limits
    if (capabilities.webgpu.limits.maxBufferSize < req.min_max_buffer_size_bytes) {
      hardFail = true;
      reasons.push(
        `GPU maxBufferSize (${formatBytes(capabilities.webgpu.limits.maxBufferSize)}) is below minimum ${formatBytes(req.min_max_buffer_size_bytes)}.`
      );
    }
    if (
      capabilities.webgpu.limits.maxStorageBufferBindingSize <
      req.min_max_storage_buffer_binding_size_bytes
    ) {
      hardFail = true;
      reasons.push(
        `GPU maxStorageBufferBindingSize (${formatBytes(capabilities.webgpu.limits.maxStorageBufferBindingSize)}) is below minimum ${formatBytes(req.min_max_storage_buffer_binding_size_bytes)}.`
      );
    }

    if (capabilities.webgpu.status === "supported_with_limitations") {
      hasLimitation = true;
      reasons.push(...capabilities.webgpu.limitations);
    }
  }

  // 4. Storage free space + 10% safety margin (FR-006, FR-048)
  const requiredStorageBytes = Math.ceil(
    req.estimated_download_size_bytes * (1 + STORAGE_SAFETY_MARGIN_RATIO)
  );
  if (capabilities.storage.availableBytes < requiredStorageBytes) {
    hardFail = true;
    reasons.push(
      `Insufficient storage: requires ${formatBytes(requiredStorageBytes)} (including 10% safety margin), available ${formatBytes(capabilities.storage.availableBytes)}.`
    );
  }

  // 5. Coarse system RAM hint
  if (
    capabilities.deviceMemoryGb !== undefined &&
    capabilities.deviceMemoryGb < req.recommended_system_ram_gb
  ) {
    hasLimitation = true;
    reasons.push(
      `Reported device memory (~${capabilities.deviceMemoryGb} GB) is below recommended ${req.recommended_system_ram_gb} GB.`
    );
  }

  // 6. Candidate status advisory
  if (model.status === "candidate") {
    hasLimitation = true;
    reasons.push("Model is in candidate qualification status; verify performance on your GPU.");
  }

  if (hardFail) {
    return {
      modelId: model.id,
      classification: "incompatible",
      reasons,
      canDownload: Boolean(opts?.allowOverride)
    };
  }

  if (hasLimitation) {
    return {
      modelId: model.id,
      classification: "compatible_with_limitations",
      reasons,
      canDownload: true
    };
  }

  return {
    modelId: model.id,
    classification: "compatible",
    reasons: ["Meets all WebGPU, memory, and storage requirements."],
    canDownload: true
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unitIdx = 0;
  while (value >= 1000 && unitIdx < units.length - 1) {
    value /= 1000;
    unitIdx++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIdx]}`;
}

// ============================================================================
// 6. WebCrypto Registry Signature Verification (OQ-08 = Option A, FR-010)
// ============================================================================

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function verifySignedRegistryUpdate(
  rawJson: string,
  signatureBase64: string,
  publicKeyJwk: JsonWebKey
): Promise<{ valid: true; registry: ModelRegistry } | { valid: false; reason: string }> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const data = new TextEncoder().encode(rawJson);
    const signature = base64ToUint8Array(signatureBase64);
    const sigOk = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature as BufferSource,
      data
    );
    if (!sigOk) {
      return { valid: false, reason: "Cryptographic signature verification failed." };
    }
    const parsed = ModelRegistrySchema.safeParse(JSON.parse(rawJson));
    if (!parsed.success) {
      return {
        valid: false,
        reason: `Registry schema invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`
      };
    }
    return { valid: true, registry: parsed.data };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : "Failed to verify signed registry."
    };
  }
}
