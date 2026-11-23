import React, { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, ErrorAlert, ProgressBar, SafeMarkdown } from "@uoai/ui";
import { useDashboardStore } from "../store/useDashboardStore";

export const WorkspaceScreen: React.FC = () => {
  const {
    snapshot,
    isOnline,
    conversations,
    activeConversationId,
    generatingMessageId,
    createConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    clearConversationMessages,
    setConversationModel,
    loadModel,
    sendPrompt,
    stopGeneration,
    setScreen
  } = useDashboardStore();

  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const lastAnnounceTsRef = useRef(0);

  const readyModels = snapshot.registry.models.filter((m) => {
    const st = snapshot.modelStates[m.id]?.status;
    return st === "ready" || st === "loaded";
  });

  const activeConv = conversations.find((c) => c.id === activeConversationId) ?? null;

  // Throttled polite ARIA live announcements for streaming output (NFR-028: <= 1 announcement / 2s)
  useEffect(() => {
    if (!generatingMessageId || !activeConv) return;
    const msg = activeConv.messages.find((m) => m.id === generatingMessageId);
    if (!msg?.content) return;
    const now = Date.now();
    if (now - lastAnnounceTsRef.current >= 2000) {
      lastAnnounceTsRef.current = now;
      setLiveAnnouncement(msg.content.slice(-140));
    }
  }, [activeConv, generatingMessageId]);

  useEffect(() => {
    if (!generatingMessageId && lastAnnounceTsRef.current > 0) {
      setLiveAnnouncement("Response complete.");
      lastAnnounceTsRef.current = 0;
    }
  }, [generatingMessageId]);

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleSend = async () => {
    if (!input.trim() || generatingMessageId || readyModels.length === 0) return;
    const text = input;
    setInput("");
    await sendPrompt(text);
  };

  return (
    <div className="grid h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[260px_1fr]">
      {/* Conversation Sidebar */}
      <aside className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Button size="sm" className="w-full" onClick={() => void createConversation()}>
            + New Chat
          </Button>
        </div>
        {snapshot.settings.ephemeralHistory && (
          <Badge tone="warning" className="mb-2 justify-center">
            Ephemeral Mode (History Not Saved)
          </Badge>
        )}
        <input
          type="search"
          placeholder="Search chats…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          aria-label="Search conversations"
        />
        <div className="flex-1 space-y-1 overflow-y-auto">
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs ${
                conv.id === activeConversationId
                  ? "bg-indigo-50 font-medium text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <button
                type="button"
                className="flex-1 truncate text-left"
                onClick={() => selectConversation(conv.id)}
              >
                {conv.title}
              </button>
              <div className="flex shrink-0 gap-1 opacity-70 group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={`Rename ${conv.title}`}
                  onClick={() => {
                    const next = window.prompt("Rename conversation:", conv.title);
                    if (next !== null) void renameConversation(conv.id, next);
                  }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${conv.title}`}
                  onClick={() => {
                    if (window.confirm(`Delete conversation "${conv.title}"?`)) {
                      void deleteConversation(conv.id);
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Pane */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Workspace Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <label htmlFor="workspace-model-select" className="text-xs font-medium text-slate-500">
              Model:
            </label>
            <select
              id="workspace-model-select"
              value={activeConv?.modelId ?? readyModels[0]?.id ?? ""}
              disabled={readyModels.length === 0 || Boolean(generatingMessageId)}
              onChange={async (e) => {
                const nextId = e.target.value;
                if (activeConv) await setConversationModel(activeConv.id, nextId);
                if (snapshot.runtime.loadedModel !== nextId) {
                  await loadModel(nextId);
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              {readyModels.length === 0 ? (
                <option value="">No installed models</option>
              ) : (
                readyModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {snapshot.runtime.loadedModel === m.id ? "(Loaded)" : ""}
                  </option>
                ))
              )}
            </select>
            {!isOnline && <Badge tone="success">Offline — Local AI Active</Badge>}
          </div>
          {activeConv && activeConv.messages.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={Boolean(generatingMessageId)}
              onClick={() => {
                if (window.confirm("Clear all messages in this conversation?")) {
                  void clearConversationMessages(activeConv.id);
                }
              }}
            >
              Clear Chat
            </Button>
          )}
        </div>

        {/* Loading Stage Bar */}
        {snapshot.runtime.state === "loading_model" && (
          <div className="border-b border-slate-200 bg-indigo-50/50 px-4 py-2 dark:border-slate-800 dark:bg-indigo-950/20">
            <ProgressBar
              value={snapshot.runtime.loadProgress ?? 50}
              label={snapshot.runtime.loadStage ?? "Loading model from local storage…"}
            />
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {readyModels.length === 0 ? (
            <Card title="No Model Installed Yet">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Download a qualified model in the Model Library to start private, offline chats.
              </p>
              <Button className="mt-3" onClick={() => setScreen("models")}>
                Go to Model Library
              </Button>
            </Card>
          ) : !activeConv || activeConv.messages.length === 0 ? (
            <div className="mx-auto max-w-xl py-10 text-center">
              <h2 className="text-lg font-semibold">Private Local AI Workspace</h2>
              <p className="mt-1 text-sm text-slate-500">
                Runs 100% on your device via WebGPU. Zero prompts leave your machine.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {[
                  "Explain how WebGPU works.",
                  "Write a short introduction to offline AI.",
                  "Test unicode and emoji streaming."
                ].map((starter) => (
                  <Button
                    key={starter}
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setInput(starter);
                    }}
                  >
                    {starter}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            activeConv.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px] opacity-75">
                    <span className="font-semibold uppercase">{msg.role}</span>
                    {msg.modelId && <span className="font-mono">{msg.modelId}</span>}
                    {msg.stopped && <Badge tone="warning">Stopped</Badge>}
                  </div>
                  {msg.errorCode ? (
                    <ErrorAlert code={msg.errorCode} />
                  ) : (
                    <SafeMarkdown content={msg.content || (generatingMessageId === msg.id ? "…" : "")} />
                  )}
                  {msg.usage && (
                    <p className="mt-1.5 text-[10px] opacity-60">
                      Tokens: {msg.usage.prompt_tokens} prompt + {msg.usage.completion_tokens} completion
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Screen reader throttled live region (NFR-028) */}
        <div className="sr-only" aria-live="polite" aria-atomic="false">
          {liveAnnouncement}
        </div>

        {/* Prompt Composer */}
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={input}
              disabled={readyModels.length === 0 || Boolean(generatingMessageId)}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                } else if (e.key === "Escape" && generatingMessageId) {
                  stopGeneration();
                }
              }}
              placeholder={
                readyModels.length === 0
                  ? "Install a model in Model Library first…"
                  : "Message local AI… (Enter to send, Shift+Enter for newline)"
              }
              aria-label="Chat prompt input"
              className="flex-1 resize-none rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
            />
            {generatingMessageId ? (
              <Button variant="danger" onClick={stopGeneration}>
                Stop
              </Button>
            ) : (
              <Button disabled={!input.trim() || readyModels.length === 0} onClick={() => void handleSend()}>
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
