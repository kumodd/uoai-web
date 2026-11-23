/**
 * Isolated-World Content-Script Bridge (FR-067, ADR-004).
 * Dynamically registered via chrome.scripting.registerContentScripts ONLY for user-authorized origins.
 */
import { attachContentScriptBridge } from "@uoai/browser-bridge";

attachContentScriptBridge(window);
