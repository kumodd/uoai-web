declare module "@huggingface/transformers" {
  export const env: {
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    useBrowserCache: boolean;
    useCustomCache?: boolean;
    customCache?: {
      match(request: string | Request): Promise<Response | undefined>;
      put(request: string | Request, response: Response): Promise<void>;
    } | null;
    backends?: {
      onnx?: {
        wasm?: {
          wasmPaths?: string;
          numThreads?: number;
        };
      };
    };
  };

  export class InterruptableStoppingCriteria {
    interrupt(): void;
  }

  export class TextStreamer {
    constructor(
      tokenizer: unknown,
      options?: {
        skip_prompt?: boolean;
        skip_special_tokens?: boolean;
        callback_function?: (text: string) => void;
      }
    );
  }

  export function pipeline(
    task: string,
    model: string,
    options?: Record<string, unknown>
  ): Promise<
    ((prompt: string, options?: Record<string, unknown>) => Promise<unknown>) & {
      tokenizer?: {
        apply_chat_template?: (
          messages: Array<{ role: string; content: string }>,
          options?: Record<string, unknown>
        ) => string;
        encode?: (text: string) => number[] | { size: number };
      };
      dispose?: () => Promise<void>;
    }
  >;
}
