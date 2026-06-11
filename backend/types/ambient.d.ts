/**
 * Minimal, honest stand-ins for the handful of @cloudflare/workers-types
 * bindings this scaffold references. They exist so `tsc --noEmit` passes
 * before `npm install` has ever run in backend/ (workers-types is a declared
 * devDependency but deliberately not installed yet).
 *
 * Rules for this file:
 * - Declare ONLY what src/ actually uses, with signatures copied from the
 *   real workers-types so a later swap is a no-op.
 * - At cutover, after `npm install`: DELETE this file and set
 *   "types": ["@cloudflare/workers-types"] in tsconfig.json. Keeping both
 *   risks interface-merge conflicts.
 */

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[]
  ): Promise<D1Result<T>[]>;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expiration?: number; expirationTtl?: number }
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

interface R2Bucket {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpEtag: string } | null>;
  delete(key: string): Promise<void>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
