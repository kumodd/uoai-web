import { create } from "zustand";
import type { Conversation, ConversationMessage, UOAIExtensionSettings } from "@uoai/shared-types";
import { UOAIError, type ChatCompletionChunk } from "@uoai/api-protocol";
import { conversationDb } from "../services/conversationDb";
import {
  createEmptyDisconnectedSnapshot,
  createExtensionBridge,
  type DashboardSnapshot
} from "../services/providerBridge";

export type ScreenId =
  | "onboarding"
  | "workspace"
  | "models"
  | "provider"
  | "integrations"
  | "console"
  | "docs"
  | "settings";

interface DashboardState {
  activeScreen: ScreenId;
  isOnline: boolean;
  loading: boolean;
  bannerError: { code: string; message: string } | null;
  snapshot: DashboardSnapshot;
  conversations: Conversation[];
  activeConversationId: string | null;
  generatingMessageId: string | null;
  abortController: AbortController | null;

  setScreen: (screen: ScreenId) => void;
  setOnline: (online: boolean) => void;
  clearBannerError: () => void;
  initialize: () => Promise<void>;
  refreshSnapshot: () => Promise<void>;
  runCapabilityCheck: () => Promise<void>;
  acceptLicense: (modelId: string, licenseId: string, licenseVersion: string) => Promise<void>;
  downloadModel: (modelId: string) => Promise<void>;
  pauseDownload: (modelId: string) => Promise<void>;
  cancelDownload: (modelId: string) => Promise<void>;
  verifyModel: (modelId: string, fullHash?: boolean) => Promise<{ valid: boolean; reason?: string }>;
  loadModel: (modelId: string) => Promise<void>;
  unloadModel: () => Promise<void>;
  removeModel: (modelId: string) => Promise<void>;
  restartRuntime: () => Promise<void>;
  cancelQueuedRequest: (requestId: string) => Promise<void>;
  authorizeOrigin: (origin: string) => Promise<void>;
  denyOrigin: (origin: string) => Promise<void>;
  revokeOrigin: (origin: string) => Promise<void>;
  revokeAllOrigins: () => Promise<void>;
  updateSettings: (patch: Partial<UOAIExtensionSettings>) => Promise<void>;
  clearDiagnostics: () => Promise<void>;
  resetAllData: () => Promise<void>;

  // Conversation actions
  createConversation: (modelId?: string) => Promise<Conversation>;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  clearConversationMessages: (id: string) => Promise<void>;
  deleteAllConversations: () => Promise<void>;
  setConversationModel: (id: string, modelId: string) => Promise<void>;
  sendPrompt: (content: string, modelOverride?: string) => Promise<boolean>;
  stopGeneration: () => void;
}

export const extensionBridge = createExtensionBridge();

let unsubPush: (() => void) | null = null;
let userNavigated = false;

export const useDashboardStore = create<DashboardState>((set, get) => ({
  activeScreen: "onboarding",
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  loading: true,
  bannerError: null,
  snapshot: createEmptyDisconnectedSnapshot(),
  conversations: [],
  activeConversationId: null,
  generatingMessageId: null,
  abortController: null,

  setScreen: (screen) => {
    userNavigated = true;
    set({ activeScreen: screen });
  },
  setOnline: (online) => set({ isOnline: online }),
  clearBannerError: () => set({ bannerError: null }),

  initialize: async () => {
    set({ loading: true });
    const conversations = await conversationDb.list();
    set({
      conversations,
      activeConversationId: conversations[0]?.id ?? null
    });

    if (!unsubPush) {
      unsubPush = extensionBridge.subscribePush((evt) => {
        if (evt.type === "snapshot_update" && evt.data) {
          set({ snapshot: evt.data as DashboardSnapshot });
        } else if (evt.type === "download_progress" && evt.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const prog = evt.data as any;
          set((s) => {
            const nextStates = { ...s.snapshot.modelStates };
            if (prog.status === "not_installed") {
              delete nextStates[prog.modelId];
            } else {
              nextStates[prog.modelId] = {
                ...(nextStates[prog.modelId] ?? {
                  modelId: prog.modelId,
                  version: "1.0.0",
                  installedAt: 0,
                  verifiedAt: 0
                }),
                ...prog
              };
            }
            return {
              snapshot: {
                ...s.snapshot,
                modelStates: nextStates
              }
            };
          });
        } else {
          void get().refreshSnapshot();
        }
      });
    }

    await get().refreshSnapshot();

    const snap = get().snapshot;
    if (!userNavigated) {
      if (snap.extensionDetected && snap.settings.onboardingComplete) {
        set({ activeScreen: "workspace" });
      } else {
        set({ activeScreen: "onboarding" });
      }
    }
    set({ loading: false });
  },

  refreshSnapshot: async () => {
    try {
      const snap = await extensionBridge.call<DashboardSnapshot>({ action: "get_snapshot" });
      set({ snapshot: { ...snap, extensionDetected: true }, bannerError: null });
    } catch (err) {
      if (err instanceof UOAIError && err.code === "extension_not_detected") {
        set({ snapshot: createEmptyDisconnectedSnapshot() });
      } else {
        set({
          bannerError: {
            code: err instanceof UOAIError ? err.code : "internal_error",
            message: err instanceof Error ? err.message : "Failed to refresh provider status."
          }
        });
      }
    }
  },

  runCapabilityCheck: async () => {
    try {
      const snap = await extensionBridge.call<DashboardSnapshot>({
        action: "run_capability_check"
      });
      set({ snapshot: { ...snap, extensionDetected: true }, bannerError: null });
    } catch (err) {
      set({
        bannerError: {
          code: err instanceof UOAIError ? err.code : "internal_error",
          message: err instanceof Error ? err.message : "Capability check failed."
        }
      });
    }
  },

  acceptLicense: async (modelId, licenseId, licenseVersion) => {
    const snap = await extensionBridge.call<DashboardSnapshot>({
      action: "accept_license",
      modelId,
      licenseId,
      licenseVersion
    });
    set({ snapshot: { ...snap, extensionDetected: true } });
  },

  downloadModel: async (modelId) => {
    set({ bannerError: null });
    try {
      const snap = await extensionBridge.call<DashboardSnapshot>({
        action: "download_model",
        modelId
      });
      set({ snapshot: { ...snap, extensionDetected: true } });
    } catch (err) {
      set({
        bannerError: {
          code: err instanceof UOAIError ? err.code : "internal_error",
          message: err instanceof Error ? err.message : "Download failed."
        }
      });
      await get().refreshSnapshot();
    }
  },

  pauseDownload: async (modelId) => {
    await extensionBridge.call({ action: "pause_download", modelId });
    await get().refreshSnapshot();
  },

  cancelDownload: async (modelId) => {
    await extensionBridge.call({ action: "cancel_download", modelId });
    await get().refreshSnapshot();
  },

  verifyModel: async (modelId, fullHash = true) => {
    const res = await extensionBridge.call<{ valid: boolean; reason?: string }>({
      action: "verify_model",
      modelId,
      fullHash
    });
    await get().refreshSnapshot();
    return res;
  },

  loadModel: async (modelId) => {
    set({ bannerError: null });
    try {
      const snap = await extensionBridge.call<DashboardSnapshot>({
        action: "load_model",
        modelId
      });
      set({ snapshot: { ...snap, extensionDetected: true } });
    } catch (err) {
      set({
        bannerError: {
          code: err instanceof UOAIError ? err.code : "internal_error",
          message: err instanceof Error ? err.message : "Failed to load model."
        }
      });
      await get().refreshSnapshot();
    }
  },

  unloadModel: async () => {
    const snap = await extensionBridge.call<DashboardSnapshot>({ action: "unload_model" });
    set({ snapshot: { ...snap, extensionDetected: true } });
  },

  removeModel: async (modelId) => {
    const snap = await extensionBridge.call<DashboardSnapshot>({ action: "remove_model", modelId });
    set({ snapshot: { ...snap, extensionDetected: true } });
  },

  restartRuntime: async () => {
    const snap = await extensionBridge.call<DashboardSnapshot>({ action: "restart_runtime" });
    set({ snapshot: { ...snap, extensionDetected: true }, bannerError: null });
  },

  cancelQueuedRequest: async (requestId) => {
    await extensionBridge.call({ action: "cancel_request", requestId });
    await get().refreshSnapshot();
  },

  authorizeOrigin: async (origin) => {
    set({ bannerError: null });
    const snap = await extensionBridge.call<DashboardSnapshot>({
      action: "authorize_origin",
      origin
    });
    set({ snapshot: { ...snap, extensionDetected: true } });
  },

  denyOrigin: async (origin) => {
    const snap = await extensionBridge.call<DashboardSnapshot>({ action: "deny_origin", origin });
    set({ snapshot: { ...snap, extensionDetected: true } });
  },

  revokeOrigin: async (origin) => {
    const snap = await extensionBridge.call<DashboardSnapshot>({ action: "revoke_origin", origin });
    set({ snapshot: { ...snap, extensionDetected: true } });
  },

  revokeAllOrigins: async () => {
    const snap = await extensionBridge.call<DashboardSnapshot>({ action: "revoke_all_origins" });
    set({ snapshot: { ...snap, extensionDetected: true } });
  },

  updateSettings: async (patch) => {
    const snap = await extensionBridge.call<DashboardSnapshot>({ action: "update_settings", patch });
    set({ snapshot: { ...snap, extensionDetected: true } });
  },

  clearDiagnostics: async () => {
    const snap = await extensionBridge.call<DashboardSnapshot>({ action: "clear_diagnostics" });
    set({ snapshot: { ...snap, extensionDetected: true } });
  },

  resetAllData: async () => {
    await conversationDb.clearAll();
    const snap = await extensionBridge.call<DashboardSnapshot>({ action: "reset_all_data" });
    set({
      snapshot: { ...snap, extensionDetected: true },
      conversations: [],
      activeConversationId: null,
      activeScreen: "onboarding",
      bannerError: null
    });
  },

  createConversation: async (modelId) => {
    const { snapshot } = get();
    const readyModel =
      modelId ??
      snapshot.runtime.loadedModel ??
      Object.values(snapshot.modelStates).find((m) => m.status === "ready" || m.status === "loaded")
        ?.modelId ??
      "uoai-local-smoke-v1";

    const conv: Conversation = {
      id: `conv_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      title: "New conversation",
      modelId: readyModel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };

    if (!snapshot.settings.ephemeralHistory) {
      await conversationDb.save(conv);
    }
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: conv.id
    }));
    return conv;
  },

  selectConversation: (id) => set({ activeConversationId: id }),

  renameConversation: async (id, title) => {
    const conv = get().conversations.find((c) => c.id === id);
    if (!conv) return;
    const updated = { ...conv, title: title.trim() || "Untitled conversation", updatedAt: Date.now() };
    if (!get().snapshot.settings.ephemeralHistory) {
      await conversationDb.save(updated);
    }
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? updated : c))
    }));
  },

  deleteConversation: async (id) => {
    await conversationDb.remove(id);
    set((s) => {
      const next = s.conversations.filter((c) => c.id !== id);
      return {
        conversations: next,
        activeConversationId: s.activeConversationId === id ? (next[0]?.id ?? null) : s.activeConversationId
      };
    });
  },

  clearConversationMessages: async (id) => {
    const conv = get().conversations.find((c) => c.id === id);
    if (!conv) return;
    const updated = { ...conv, messages: [], updatedAt: Date.now() };
    if (!get().snapshot.settings.ephemeralHistory) {
      await conversationDb.save(updated);
    }
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? updated : c))
    }));
  },

  deleteAllConversations: async () => {
    await conversationDb.clearAll();
    set({ conversations: [], activeConversationId: null });
  },

  setConversationModel: async (id, modelId) => {
    const conv = get().conversations.find((c) => c.id === id);
    if (!conv) return;
    const updated = { ...conv, modelId, updatedAt: Date.now() };
    if (!get().snapshot.settings.ephemeralHistory) {
      await conversationDb.save(updated);
    }
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? updated : c))
    }));
  },

  sendPrompt: async (content, modelOverride) => {
    const trimmed = content.trim();
    if (!trimmed) return false;

    let conv = get().conversations.find((c) => c.id === get().activeConversationId);
    if (!conv) {
      conv = await get().createConversation(modelOverride);
    }
    const targetModelId = modelOverride ?? conv.modelId;

    const userMsg: ConversationMessage = {
      id: `msg_u_${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
      modelId: targetModelId
    };
    const assistantMsgId = `msg_a_${Date.now() + 1}`;
    const assistantMsg: ConversationMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      createdAt: Date.now() + 1,
      modelId: targetModelId
    };

    const nextTitle =
      conv.messages.length === 0 && conv.title === "New conversation"
        ? trimmed.slice(0, 48)
        : conv.title;

    const withPrompt: Conversation = {
      ...conv,
      modelId: targetModelId,
      title: nextTitle,
      updatedAt: Date.now(),
      messages: [...conv.messages, userMsg, assistantMsg]
    };

    const controller = new AbortController();
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === conv!.id ? withPrompt : c)),
      generatingMessageId: assistantMsgId,
      abortController: controller,
      bannerError: null
    }));

    const persistIfAllowed = async (updated: Conversation) => {
      if (!get().snapshot.settings.ephemeralHistory) {
        await conversationDb.save(updated);
      }
    };
    await persistIfAllowed(withPrompt);

    try {
      const apiMessages = withPrompt.messages
        .filter((m) => m.id !== assistantMsgId && !m.errorCode)
        .map((m) => ({ role: m.role, content: m.content }));

      const completion = await extensionBridge.streamChat(
        {
          model: targetModelId,
          messages: apiMessages,
          stream: true,
          stream_options: { include_usage: true }
        },
        (chunk: ChatCompletionChunk) => {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (!delta) return;
          set((s) => ({
            conversations: s.conversations.map((c) => {
              if (c.id !== conv!.id) return c;
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: m.content + delta } : m
                )
              };
            })
          }));
        },
        controller.signal
      );

      const finalConv = get().conversations.find((c) => c.id === conv!.id);
      if (finalConv) {
        const finalized: Conversation = {
          ...finalConv,
          updatedAt: Date.now(),
          messages: finalConv.messages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: completion.choices[0]?.message.content ?? m.content,
                  usage: completion.usage
                }
              : m
          )
        };
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === conv!.id ? finalized : c))
        }));
        await persistIfAllowed(finalized);
      }
      return true;
    } catch (err) {
      const isCancelled = err instanceof UOAIError && err.code === "generation_cancelled";
      const code = err instanceof UOAIError ? err.code : "internal_error";
      const finalConv = get().conversations.find((c) => c.id === conv!.id);
      if (finalConv) {
        const finalized: Conversation = {
          ...finalConv,
          updatedAt: Date.now(),
          messages: finalConv.messages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  stopped: isCancelled,
                  errorCode: isCancelled ? undefined : code
                }
              : m
          )
        };
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === conv!.id ? finalized : c))
        }));
        await persistIfAllowed(finalized);
      }
      if (!isCancelled) {
        set({
          bannerError: {
            code,
            message: err instanceof Error ? err.message : "Generation failed."
          }
        });
      }
      return false;
    } finally {
      set({ generatingMessageId: null, abortController: null });
      void get().refreshSnapshot();
    }
  },

  stopGeneration: () => {
    const ctrl = get().abortController;
    if (ctrl) {
      ctrl.abort("generation_cancelled");
    }
  }
}));
