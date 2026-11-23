import type { ModelInstallStatus } from "@uoai/shared-types";
import type { ModelArtifact, ModelManifest } from "@uoai/model-registry";
import { STORAGE_SAFETY_MARGIN_RATIO } from "@uoai/shared-types";
import { StreamingSha256, sha256Hex } from "./sha256.js";

export { StreamingSha256, sha256Hex };

// ============================================================================
// 1. Artifact Store Abstraction (OPFS / Cache Storage / Memory — OQ-05 = C)
// ============================================================================

export interface ArtifactStore {
  /** Append or write bytes to a staging file at a byte offset. */
  writeStagingChunk(
    modelId: string,
    artifactPath: string,
    offset: number,
    data: Uint8Array
  ): Promise<void>;
  /** Get current byte size of a staging file (0 if missing). */
  getStagingSize(modelId: string, artifactPath: string): Promise<number>;
  /** Read staging file in chunks for streaming SHA-256 verification. */
  readStagingChunks(
    modelId: string,
    artifactPath: string,
    chunkSize?: number
  ): AsyncIterable<Uint8Array>;
  /** Delete a staging file (or entire model staging folder if path omitted). */
  deleteStaging(modelId: string, artifactPath?: string): Promise<void>;
  /** Atomically commit all verified staging artifacts for a model into permanent storage. */
  commitModel(modelId: string, artifactPaths: string[]): Promise<void>;
  /** Check if a final artifact exists and return its exact byte size (null if missing). */
  statFinal(modelId: string, artifactPath: string): Promise<{ sizeBytes: number } | null>;
  /** Read a committed final artifact as Uint8Array. */
  readFinal(modelId: string, artifactPath: string): Promise<Uint8Array>;
  /** Read a committed final artifact in chunks (for on-demand full SHA-256 re-hash). */
  readFinalChunks(
    modelId: string,
    artifactPath: string,
    chunkSize?: number
  ): AsyncIterable<Uint8Array>;
  /** Delete all committed artifacts for a model. */
  deleteFinalModel(modelId: string): Promise<void>;
  /** Delete all staging and final files (Reset UOAI, FR-121). */
  clearAll(): Promise<void>;
  /** Compute total stored bytes per model in final storage. */
  getUsedBytesByModel(): Promise<Record<string, number>>;
}

function normalizePath(p: string): string {
  return p.replace(/^\/+/, "").replace(/\.\./g, "_");
}

/**
 * Deterministic in-memory ArtifactStore for unit/integration tests and fallback.
 */
export class MemoryArtifactStore implements ArtifactStore {
  private readonly staging = new Map<string, Uint8Array>();
  private readonly final = new Map<string, Uint8Array>();

  private key(modelId: string, artifactPath: string): string {
    return `${modelId}::${normalizePath(artifactPath)}`;
  }

  async writeStagingChunk(
    modelId: string,
    artifactPath: string,
    offset: number,
    data: Uint8Array
  ): Promise<void> {
    const k = this.key(modelId, artifactPath);
    const existing = this.staging.get(k) ?? new Uint8Array(0);
    const end = offset + data.byteLength;
    const next = new Uint8Array(Math.max(existing.byteLength, end));
    next.set(existing, 0);
    next.set(data, offset);
    this.staging.set(k, next);
  }

  async getStagingSize(modelId: string, artifactPath: string): Promise<number> {
    return this.staging.get(this.key(modelId, artifactPath))?.byteLength ?? 0;
  }

  async *readStagingChunks(
    modelId: string,
    artifactPath: string,
    chunkSize: number = 1024 * 1024
  ): AsyncIterable<Uint8Array> {
    const data = this.staging.get(this.key(modelId, artifactPath));
    if (!data) return;
    for (let i = 0; i < data.byteLength; i += chunkSize) {
      yield data.subarray(i, Math.min(i + chunkSize, data.byteLength));
    }
  }

  async deleteStaging(modelId: string, artifactPath?: string): Promise<void> {
    if (artifactPath) {
      this.staging.delete(this.key(modelId, artifactPath));
      return;
    }
    const prefix = `${modelId}::`;
    for (const k of Array.from(this.staging.keys())) {
      if (k.startsWith(prefix)) this.staging.delete(k);
    }
  }

  async commitModel(modelId: string, artifactPaths: string[]): Promise<void> {
    for (const p of artifactPaths) {
      const k = this.key(modelId, p);
      const staged = this.staging.get(k);
      if (!staged) {
        throw new Error(`Missing staged artifact ${p} for model ${modelId}`);
      }
      this.final.set(k, new Uint8Array(staged));
    }
    await this.deleteStaging(modelId);
  }

  async statFinal(modelId: string, artifactPath: string): Promise<{ sizeBytes: number } | null> {
    const data = this.final.get(this.key(modelId, artifactPath));
    return data ? { sizeBytes: data.byteLength } : null;
  }

  async readFinal(modelId: string, artifactPath: string): Promise<Uint8Array> {
    const data = this.final.get(this.key(modelId, artifactPath));
    if (!data) throw new Error(`Artifact not found: ${modelId}/${artifactPath}`);
    return new Uint8Array(data);
  }

  async *readFinalChunks(
    modelId: string,
    artifactPath: string,
    chunkSize: number = 1024 * 1024
  ): AsyncIterable<Uint8Array> {
    const data = await this.readFinal(modelId, artifactPath);
    for (let i = 0; i < data.byteLength; i += chunkSize) {
      yield data.subarray(i, Math.min(i + chunkSize, data.byteLength));
    }
  }

  async deleteFinalModel(modelId: string): Promise<void> {
    const prefix = `${modelId}::`;
    for (const k of Array.from(this.final.keys())) {
      if (k.startsWith(prefix)) this.final.delete(k);
    }
  }

  async clearAll(): Promise<void> {
    this.staging.clear();
    this.final.clear();
  }

  async getUsedBytesByModel(): Promise<Record<string, number>> {
    const totals: Record<string, number> = {};
    for (const [k, data] of this.final.entries()) {
      const modelId = k.split("::")[0]!;
      totals[modelId] = (totals[modelId] ?? 0) + data.byteLength;
    }
    return totals;
  }

  /** Test helper to simulate post-install disk corruption or eviction (TC-008, TC-015). */
  _corruptFinalArtifactForTest(modelId: string, artifactPath: string, byteIndex: number = 0): void {
    const k = this.key(modelId, artifactPath);
    const data = this.final.get(k);
    if (!data || data.byteLength === 0) return;
    const copy = new Uint8Array(data);
    copy[byteIndex % copy.byteLength] = (copy[byteIndex % copy.byteLength]! ^ 0xff) & 0xff;
    this.final.set(k, copy);
  }
}

/**
 * Browser OPFS ArtifactStore (OQ-05 = Option C, ADR-006).
 * Persists multi-GB model weights inside extension-origin OPFS.
 */
export class OpfsArtifactStore implements ArtifactStore {
  private async getRootDir(): Promise<FileSystemDirectoryHandle> {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
      throw new Error("OPFS (navigator.storage.getDirectory) is unavailable in this environment.");
    }
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle("uoai-models", { create: true });
  }

  private async getFileHandle(
    bucket: "staging" | "final",
    modelId: string,
    artifactPath: string,
    create: boolean
  ): Promise<FileSystemFileHandle> {
    const root = await this.getRootDir();
    const bucketDir = await root.getDirectoryHandle(bucket, { create });
    const modelDir = await bucketDir.getDirectoryHandle(modelId, { create });
    const parts = normalizePath(artifactPath).split("/");
    let dir = modelDir;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i]!, { create });
    }
    return dir.getFileHandle(parts[parts.length - 1]!, { create });
  }

  async writeStagingChunk(
    modelId: string,
    artifactPath: string,
    offset: number,
    data: Uint8Array
  ): Promise<void> {
    const handle = await this.getFileHandle("staging", modelId, artifactPath, true);
    const writable = await handle.createWritable({ keepExistingData: offset > 0 });
    await writable.seek(offset);
    await writable.write(data as unknown as BufferSource);
    await writable.close();
  }

  async getStagingSize(modelId: string, artifactPath: string): Promise<number> {
    try {
      const handle = await this.getFileHandle("staging", modelId, artifactPath, false);
      const file = await handle.getFile();
      return file.size;
    } catch {
      return 0;
    }
  }

  async *readStagingChunks(
    modelId: string,
    artifactPath: string,
    chunkSize: number = 4 * 1024 * 1024
  ): AsyncIterable<Uint8Array> {
    const handle = await this.getFileHandle("staging", modelId, artifactPath, false);
    const file = await handle.getFile();
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
      yield new Uint8Array(await slice.arrayBuffer());
    }
  }

  async deleteStaging(modelId: string, artifactPath?: string): Promise<void> {
    try {
      const root = await this.getRootDir();
      const bucketDir = await root.getDirectoryHandle("staging", { create: false });
      if (!artifactPath) {
        await bucketDir.removeEntry(modelId, { recursive: true });
        return;
      }
      const modelDir = await bucketDir.getDirectoryHandle(modelId, { create: false });
      const parts = normalizePath(artifactPath).split("/");
      let dir = modelDir;
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i]!, { create: false });
      }
      await dir.removeEntry(parts[parts.length - 1]!);
    } catch {
      // Already deleted
    }
  }

  async commitModel(modelId: string, artifactPaths: string[]): Promise<void> {
    for (const p of artifactPaths) {
      const finalHandle = await this.getFileHandle("final", modelId, p, true);
      const writable = await finalHandle.createWritable({ keepExistingData: false });
      for await (const chunk of this.readStagingChunks(modelId, p)) {
        await writable.write(chunk as unknown as BufferSource);
      }
      await writable.close();
    }
    await this.deleteStaging(modelId);
  }

  async statFinal(modelId: string, artifactPath: string): Promise<{ sizeBytes: number } | null> {
    try {
      const handle = await this.getFileHandle("final", modelId, artifactPath, false);
      const file = await handle.getFile();
      return { sizeBytes: file.size };
    } catch {
      return null;
    }
  }

  async readFinal(modelId: string, artifactPath: string): Promise<Uint8Array> {
    const handle = await this.getFileHandle("final", modelId, artifactPath, false);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async *readFinalChunks(
    modelId: string,
    artifactPath: string,
    chunkSize: number = 4 * 1024 * 1024
  ): AsyncIterable<Uint8Array> {
    const handle = await this.getFileHandle("final", modelId, artifactPath, false);
    const file = await handle.getFile();
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
      yield new Uint8Array(await slice.arrayBuffer());
    }
  }

  async deleteFinalModel(modelId: string): Promise<void> {
    try {
      const root = await this.getRootDir();
      const bucketDir = await root.getDirectoryHandle("final", { create: false });
      await bucketDir.removeEntry(modelId, { recursive: true });
    } catch {
      // Already absent
    }
  }

  async clearAll(): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("uoai-models", { recursive: true });
    } catch {
      // Already absent
    }
  }

  async getUsedBytesByModel(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    try {
      const root = await this.getRootDir();
      const finalDir = await root.getDirectoryHandle("final", { create: false });
      const sumDir = async (dir: FileSystemDirectoryHandle): Promise<number> => {
        let total = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const [, entry] of (dir as any).entries()) {
          if (entry.kind === "file") {
            const file = await entry.getFile();
            total += file.size;
          } else if (entry.kind === "directory") {
            total += await sumDir(entry);
          }
        }
        return total;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const [name, entry] of (finalDir as any).entries()) {
        if (entry.kind === "directory") {
          result[name] = await sumDir(entry);
        }
      }
    } catch {
      // No final directory yet
    }
    return result;
  }
}

// ============================================================================
// 2. Installed Model Metadata Store (IndexedDB `uoai_models`, FR-019)
// ============================================================================

export interface InstalledModelRecord {
  modelId: string;
  version: string;
  status: ModelInstallStatus;
  installedAt: number;
  verifiedAt: number;
  totalBytes: number;
  artifacts: Array<{
    path: string;
    sizeBytes: number;
    sha256: string;
  }>;
  downloadCheckpoint?: {
    startedAt: number;
    updatedAt: number;
    etags: Record<string, string>;
    completedArtifacts: string[];
  };
}

export interface ModelMetadataStore {
  get(modelId: string): Promise<InstalledModelRecord | null>;
  list(): Promise<InstalledModelRecord[]>;
  put(record: InstalledModelRecord): Promise<void>;
  delete(modelId: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryModelMetadataStore implements ModelMetadataStore {
  private readonly records = new Map<string, InstalledModelRecord>();

  async get(modelId: string): Promise<InstalledModelRecord | null> {
    const r = this.records.get(modelId);
    return r ? structuredClone(r) : null;
  }

  async list(): Promise<InstalledModelRecord[]> {
    return Array.from(this.records.values(), (r) => structuredClone(r));
  }

  async put(record: InstalledModelRecord): Promise<void> {
    this.records.set(record.modelId, structuredClone(record));
  }

  async delete(modelId: string): Promise<void> {
    this.records.delete(modelId);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

export class IndexedDbModelMetadataStore implements ModelMetadataStore {
  private readonly dbName: string;
  private readonly storeName = "models";

  constructor(dbName: string = "uoai_models") {
    this.dbName = dbName;
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "modelId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
    });
  }

  async get(modelId: string): Promise<InstalledModelRecord | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const req = tx.objectStore(this.storeName).get(modelId);
      req.onsuccess = () => resolve((req.result as InstalledModelRecord) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async list(): Promise<InstalledModelRecord[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const req = tx.objectStore(this.storeName).getAll();
      req.onsuccess = () => resolve((req.result as InstalledModelRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async put(record: InstalledModelRecord): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(modelId: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).delete(modelId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// ============================================================================
// 3. Resumable Model Downloader & Verifier (FR-016..020, FR-106..108, OQ-09, OQ-17)
// ============================================================================

export interface DownloadProgressEvent {
  modelId: string;
  status: ModelInstallStatus;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
  currentFile: string | null;
  rangeResumeSupported: boolean | null;
  errorCode?: string;
  errorMessage?: string;
}

export interface ModelDownloaderOptions {
  artifactStore: ArtifactStore;
  metadataStore: ModelMetadataStore;
  fetchImpl?: typeof fetch;
  /** Default 8 MB chunk flush size (OQ-09 = Option A). */
  chunkFlushBytes?: number;
  /** Optional free-space estimator (defaults to navigator.storage.estimate). */
  getAvailableStorageBytes?: () => Promise<number>;
  /** Optional persistence requester (defaults to navigator.storage.persist). */
  requestPersistentStorage?: () => Promise<boolean>;
  /** Optional license acceptance lookup (BR-19). */
  isLicenseAccepted?: (modelId: string, licenseVersion: string) => Promise<boolean>;
  onProgress?: (event: DownloadProgressEvent) => void;
}

export class ModelDownloader {
  private readonly store: ArtifactStore;
  private readonly meta: ModelMetadataStore;
  private readonly fetchImpl: typeof fetch;
  private readonly chunkFlushBytes: number;
  private readonly getAvailableStorageBytes: () => Promise<number>;
  private readonly requestPersistentStorage: () => Promise<boolean>;
  private readonly isLicenseAccepted: (modelId: string, licenseVersion: string) => Promise<boolean>;
  private readonly onProgress?: (event: DownloadProgressEvent) => void;
  private readonly controllers = new Map<string, AbortController>();
  private readonly integrityFailureCounts = new Map<string, number>();

  constructor(opts: ModelDownloaderOptions) {
    this.store = opts.artifactStore;
    this.meta = opts.metadataStore;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.chunkFlushBytes = opts.chunkFlushBytes ?? 8 * 1024 * 1024; // 8 MB (OQ-09)
    this.getAvailableStorageBytes =
      opts.getAvailableStorageBytes ??
      (async () => {
        if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          if (est.quota !== undefined && est.usage !== undefined) {
            return Math.max(0, est.quota - est.usage);
          }
        }
        return Number.MAX_SAFE_INTEGER;
      });
    this.requestPersistentStorage =
      opts.requestPersistentStorage ??
      (async () => {
        if (typeof navigator !== "undefined" && navigator.storage?.persist) {
          return navigator.storage.persist();
        }
        return false;
      });
    this.isLicenseAccepted = opts.isLicenseAccepted ?? (async () => true);
    this.onProgress = opts.onProgress;
  }

  /**
   * Pause an active download; stops network activity immediately (FR-017).
   */
  pause(modelId: string): boolean {
    const ctrl = this.controllers.get(modelId);
    if (!ctrl) return false;
    ctrl.abort("paused");
    this.controllers.delete(modelId);
    return true;
  }

  /**
   * Cancel an active or paused download and delete all staging files (FR-017, FR-108).
   */
  async cancel(modelId: string): Promise<void> {
    const ctrl = this.controllers.get(modelId);
    if (ctrl) {
      ctrl.abort("cancelled");
      this.controllers.delete(modelId);
    }
    await this.store.deleteStaging(modelId);
    const existing = await this.meta.get(modelId);
    if (existing && existing.status !== "ready" && existing.status !== "loaded") {
      await this.meta.delete(modelId);
    }
    this.onProgress?.({
      modelId,
      status: "not_installed",
      downloadedBytes: 0,
      totalBytes: existing?.totalBytes ?? 0,
      percent: 0,
      bytesPerSecond: 0,
      etaSeconds: null,
      currentFile: null,
      rangeResumeSupported: null
    });
  }

  /**
   * Download, verify (streaming SHA-256), and atomically install a qualified model.
   */
  async downloadAndInstall(manifest: ModelManifest): Promise<InstalledModelRecord> {
    // 1. Enforce license acceptance before any network transfer (FR-015, BR-19)
    if (manifest.license.requires_acceptance) {
      const accepted = await this.isLicenseAccepted(manifest.id, manifest.license.version);
      if (!accepted) {
        throw Object.assign(
          new Error(`License '${manifest.license.name}' must be accepted before downloading.`),
          { code: "invalid_request" }
        );
      }
    }

    // 2. Request persistent storage (FR-106)
    await this.requestPersistentStorage().catch(() => false);

    // 3. Pre-download free-space check with 10% safety margin (FR-048, UC-12)
    const totalBytes = manifest.artifacts.reduce((acc, a) => acc + a.size_bytes, 0);
    const requiredBytes = Math.ceil(totalBytes * (1 + STORAGE_SAFETY_MARGIN_RATIO));
    const availableBytes = await this.getAvailableStorageBytes();
    if (availableBytes < requiredBytes) {
      throw Object.assign(
        new Error(
          `Insufficient storage space: requires ${requiredBytes} bytes, available ${availableBytes} bytes.`
        ),
        { code: "insufficient_storage" }
      );
    }

    const controller = new AbortController();
    this.controllers.set(manifest.id, controller);

    const existing = await this.meta.get(manifest.id);
    const checkpoint = existing?.downloadCheckpoint ?? {
      startedAt: Date.now(),
      updatedAt: Date.now(),
      etags: {},
      completedArtifacts: []
    };

    const startTime = Date.now();
    let baseDownloadedBytes = 0;
    for (const artifact of manifest.artifacts) {
      if (checkpoint.completedArtifacts.includes(artifact.path)) {
        baseDownloadedBytes += artifact.size_bytes;
      } else {
        baseDownloadedBytes += await this.store.getStagingSize(manifest.id, artifact.path);
      }
    }

    let lastEmitTs = 0;
    const emit = (
      status: ModelInstallStatus,
      downloadedBytes: number,
      currentFile: string | null,
      rangeSupported: boolean | null,
      error?: { code: string; message: string },
      force: boolean = false
    ) => {
      const now = Date.now();
      if (!force && status === "downloading" && now - lastEmitTs < 250) {
        return;
      }
      lastEmitTs = now;
      const elapsedSec = Math.max(0.05, (now - startTime) / 1000);
      const deltaBytes = Math.max(0, downloadedBytes - baseDownloadedBytes);
      const bps = deltaBytes / elapsedSec;
      const remaining = Math.max(0, totalBytes - downloadedBytes);
      const eta = bps > 0 ? Math.ceil(remaining / bps) : null;
      this.onProgress?.({
        modelId: manifest.id,
        status,
        downloadedBytes,
        totalBytes,
        percent: totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 100,
        bytesPerSecond: Math.round(bps),
        etaSeconds: eta,
        currentFile,
        rangeResumeSupported: rangeSupported,
        ...(error ? { errorCode: error.code, errorMessage: error.message } : {})
      });
    };

    let runningDownloaded = baseDownloadedBytes;
    let currentFileName: string | null = manifest.artifacts[0]?.path ?? null;
    let rangeSupported: boolean | null = null;
    let flushPendingBuffer: (() => Promise<void>) | null = null;

    try {
      await this.meta.put({
        modelId: manifest.id,
        version: manifest.version,
        status: "downloading",
        installedAt: 0,
        verifiedAt: 0,
        totalBytes,
        artifacts: manifest.artifacts.map((a) => ({
          path: a.path,
          sizeBytes: a.size_bytes,
          sha256: a.sha256
        })),
        downloadCheckpoint: checkpoint
      });

      emit("downloading", runningDownloaded, currentFileName, rangeSupported, undefined, true);

      // 4. Download each artifact into staging with HTTP Range + If-Range resume (OQ-09 = A)
      for (const artifact of manifest.artifacts) {
        if (checkpoint.completedArtifacts.includes(artifact.path)) {
          continue;
        }
        currentFileName = artifact.path;

        const existingOffset = await this.store.getStagingSize(manifest.id, artifact.path);
        const headers: Record<string, string> = {};
        if (existingOffset > 0 && existingOffset < artifact.size_bytes) {
          headers["Range"] = `bytes=${existingOffset}-`;
          const savedEtag = checkpoint.etags[artifact.path];
          if (savedEtag) {
            headers["If-Range"] = savedEtag;
          }
        }

        const res = await this.fetchImpl(artifact.url, {
          headers,
          signal: controller.signal
        });

        if (!res.ok && res.status !== 206) {
          throw Object.assign(new Error(`HTTP ${res.status} fetching ${artifact.path}`), {
            code: "internal_error"
          });
        }

        let writeOffset = 0;
        if (res.status === 206 && existingOffset > 0) {
          writeOffset = existingOffset;
          rangeSupported = true;
        } else {
          // Server returned 200 OK (no Range or ETag changed): restart current file from 0
          if (existingOffset > 0) {
            runningDownloaded = Math.max(0, runningDownloaded - existingOffset);
            await this.store.deleteStaging(manifest.id, artifact.path);
          }
          writeOffset = 0;
          if (res.headers.get("accept-ranges")?.toLowerCase() === "bytes") {
            rangeSupported = true;
          } else if (existingOffset > 0) {
            rangeSupported = false;
          }
        }

        const etag = res.headers.get("etag") ?? res.headers.get("last-modified");
        if (etag) {
          checkpoint.etags[artifact.path] = etag;
        }

        emit("downloading", runningDownloaded, artifact.path, rangeSupported, undefined, true);

        // Stream chunks and flush in bounded buffers (OQ-09)
        const reader = res.body?.getReader();
        if (reader) {
          let pendingChunks: Uint8Array[] = [];
          let pendingLen = 0;

          const flush = async () => {
            if (pendingLen === 0) return;
            const merged = new Uint8Array(pendingLen);
            let pos = 0;
            for (const c of pendingChunks) {
              merged.set(c, pos);
              pos += c.byteLength;
            }
            await this.store.writeStagingChunk(manifest.id, artifact.path, writeOffset, merged);
            writeOffset += merged.byteLength;
            pendingChunks = [];
            pendingLen = 0;
            checkpoint.updatedAt = Date.now();
          };
          flushPendingBuffer = flush;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              pendingChunks.push(value);
              pendingLen += value.byteLength;
              runningDownloaded += value.byteLength;
              if (pendingLen >= this.chunkFlushBytes) {
                await flush();
              }
              emit("downloading", runningDownloaded, artifact.path, rangeSupported);
            }
          }
          await flush();
          flushPendingBuffer = null;
        } else {
          const buf = new Uint8Array(await res.arrayBuffer());
          await this.store.writeStagingChunk(manifest.id, artifact.path, writeOffset, buf);
          runningDownloaded += buf.byteLength;
          emit("downloading", runningDownloaded, artifact.path, rangeSupported, undefined, true);
        }

        checkpoint.completedArtifacts.push(artifact.path);
        checkpoint.updatedAt = Date.now();
      }

      // 5. Mandatory Streaming SHA-256 & Byte-Length Integrity Verification (FR-018, BR-08)
      emit("verifying", totalBytes, null, rangeSupported, undefined, true);
      for (const artifact of manifest.artifacts) {
        const result = await this.verifyStagingArtifact(manifest.id, artifact);
        if (!result.ok) {
          await this.store.deleteStaging(manifest.id, artifact.path);
          checkpoint.completedArtifacts = checkpoint.completedArtifacts.filter(
            (p) => p !== artifact.path
          );
          const failures = (this.integrityFailureCounts.get(manifest.id) ?? 0) + 1;
          this.integrityFailureCounts.set(manifest.id, failures);
          await this.meta.put({
            modelId: manifest.id,
            version: manifest.version,
            status: "failed_integrity",
            installedAt: 0,
            verifiedAt: 0,
            totalBytes,
            artifacts: manifest.artifacts.map((a) => ({
              path: a.path,
              sizeBytes: a.size_bytes,
              sha256: a.sha256
            })),
            downloadCheckpoint: checkpoint
          });
          const errMsg = `Integrity verification failed for ${artifact.path}: ${result.reason}`;
          emit(
            "failed_integrity",
            totalBytes,
            artifact.path,
            rangeSupported,
            { code: "model_not_verified", message: errMsg },
            true
          );
          throw Object.assign(new Error(errMsg), {
            code: "model_not_verified",
            consecutiveFailures: failures
          });
        }
      }

      // 6. Atomic Commit staging -> final & write IndexedDB Ready record (FR-019, NFR-009)
      emit("installing", totalBytes, null, rangeSupported, undefined, true);
      await this.store.commitModel(
        manifest.id,
        manifest.artifacts.map((a) => a.path)
      );

      const now = Date.now();
      const installedRecord: InstalledModelRecord = {
        modelId: manifest.id,
        version: manifest.version,
        status: "ready",
        installedAt: now,
        verifiedAt: now,
        totalBytes,
        artifacts: manifest.artifacts.map((a) => ({
          path: a.path,
          sizeBytes: a.size_bytes,
          sha256: a.sha256
        }))
      };
      await this.meta.put(installedRecord);
      this.integrityFailureCounts.delete(manifest.id);
      emit("ready", totalBytes, null, rangeSupported, undefined, true);
      return installedRecord;
    } catch (err) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason === "paused") {
          // Persist buffered bytes so HTTP Range resumes from exact offset (FR-017)
          await flushPendingBuffer?.().catch(() => undefined);
          await this.meta.put({
            modelId: manifest.id,
            version: manifest.version,
            status: "paused",
            installedAt: 0,
            verifiedAt: 0,
            totalBytes,
            artifacts: manifest.artifacts.map((a) => ({
              path: a.path,
              sizeBytes: a.size_bytes,
              sha256: a.sha256
            })),
            downloadCheckpoint: checkpoint
          });
          emit("paused", runningDownloaded, currentFileName, rangeSupported, undefined, true);
          throw Object.assign(new Error("Download paused by user."), { code: "download_paused" });
        }
        if (reason === "cancelled") {
          // Ensure staging and partial metadata are deleted after stream closes (no OPFS lock race)
          await this.store.deleteStaging(manifest.id).catch(() => undefined);
          const cur = await this.meta.get(manifest.id).catch(() => null);
          if (cur && cur.status !== "ready" && cur.status !== "loaded") {
            await this.meta.delete(manifest.id).catch(() => undefined);
          }
          emit("not_installed", 0, null, null, undefined, true);
          throw Object.assign(new Error("Download cancelled by user."), {
            code: "download_cancelled"
          });
        }
      }

      // Persist failed_download state unless already marked failed_integrity
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any)?.code !== "model_not_verified") {
        await flushPendingBuffer?.().catch(() => undefined);
        await this.meta.put({
          modelId: manifest.id,
          version: manifest.version,
          status: "failed_download",
          installedAt: 0,
          verifiedAt: 0,
          totalBytes,
          artifacts: manifest.artifacts.map((a) => ({
            path: a.path,
            sizeBytes: a.size_bytes,
            sha256: a.sha256
          })),
          downloadCheckpoint: checkpoint
        });
        const msg = err instanceof Error ? err.message : String(err);
        emit(
          "failed_download",
          runningDownloaded,
          currentFileName,
          rangeSupported,
          { code: "internal_error", message: msg },
          true
        );
      }
      throw err;
    } finally {
      this.controllers.delete(manifest.id);
    }
  }

  private async verifyStagingArtifact(
    modelId: string,
    artifact: ModelArtifact
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const actualSize = await this.store.getStagingSize(modelId, artifact.path);
    if (actualSize !== artifact.size_bytes) {
      return {
        ok: false,
        reason: `Expected ${artifact.size_bytes} bytes, got ${actualSize} bytes.`
      };
    }
    const hasher = new StreamingSha256();
    for await (const chunk of this.store.readStagingChunks(modelId, artifact.path)) {
      hasher.update(chunk);
    }
    const actualHash = hasher.digestHex();
    if (actualHash.toLowerCase() !== artifact.sha256.toLowerCase()) {
      return {
        ok: false,
        reason: `SHA-256 mismatch (expected ${artifact.sha256.slice(0, 12)}…, got ${actualHash.slice(0, 12)}…).`
      };
    }
    return { ok: true };
  }

  /**
   * Verify an installed model before loading or on demand (FR-103, FR-119, OQ-17 = Option A).
   * - fullHash=false (default at load): checks verification record, file existence, and exact byte size (< 20 ms).
   * - fullHash=true (on demand / after load failure): recomputes streaming SHA-256 across all artifacts.
   */
  async verifyInstalledModel(
    modelId: string,
    opts?: { fullHash?: boolean }
  ): Promise<{ valid: true } | { valid: false; missingFiles: string[]; reason: string }> {
    const record = await this.meta.get(modelId);
    if (!record || (record.status !== "ready" && record.status !== "loaded") || record.verifiedAt <= 0) {
      return {
        valid: false,
        missingFiles: [],
        reason: "Model has no verified installation record."
      };
    }

    const missingFiles: string[] = [];
    for (const artifact of record.artifacts) {
      const stat = await this.store.statFinal(modelId, artifact.path);
      if (!stat) {
        missingFiles.push(artifact.path);
        continue;
      }
      if (stat.sizeBytes !== artifact.sizeBytes) {
        await this.meta.put({ ...record, status: "missing_files" });
        return {
          valid: false,
          missingFiles: [artifact.path],
          reason: `File size mismatch for ${artifact.path} (expected ${artifact.sizeBytes}, found ${stat.sizeBytes}).`
        };
      }
      if (opts?.fullHash) {
        const hasher = new StreamingSha256();
        for await (const chunk of this.store.readFinalChunks(modelId, artifact.path)) {
          hasher.update(chunk);
        }
        const digest = hasher.digestHex();
        if (digest.toLowerCase() !== artifact.sha256.toLowerCase()) {
          await this.meta.put({ ...record, status: "failed_integrity" });
          return {
            valid: false,
            missingFiles: [artifact.path],
            reason: `SHA-256 mismatch detected in stored artifact ${artifact.path}.`
          };
        }
      }
    }

    if (missingFiles.length > 0) {
      await this.meta.put({ ...record, status: "missing_files" });
      return {
        valid: false,
        missingFiles,
        reason: `Missing model artifact files (possibly evicted by browser): ${missingFiles.join(", ")}`
      };
    }

    return { valid: true };
  }

  async removeModel(modelId: string): Promise<void> {
    await this.cancel(modelId);
    await this.store.deleteFinalModel(modelId);
    await this.meta.delete(modelId);
  }
}
