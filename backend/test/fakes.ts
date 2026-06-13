/**
 * In-memory fakes for the worker's bindings (D1, KV, R2) plus env/request
 * helpers - pure node, no miniflare, same philosophy as the rest of test/.
 *
 * FakeD1 dispatches on the EXACT (whitespace-normalized) SQL strings the
 * routes issue and throws on anything it does not recognise. That coupling
 * is deliberate: a route changing its SQL must update this file and its
 * tests in the same commit - the schema.sql <-> validate.ts discipline
 * applied to the test doubles.
 */

import worker from "../src/index";
import type { Env } from "../src/env";
import { SESSION_COOKIE_NAME } from "../src/routes/auth";

// --- D1 ----------------------------------------------------------------

export type UserTableRow = { id: string; email: string; kind: string; created_at: string };
export type MagicLinkTableRow = {
  token_hash: string;
  email: string;
  expires_at: string;
  used_at: string | null;
};
export type SessionTableRow = {
  rowid: number;
  id: string;
  user_id: string;
  created_at: string | null;
  expires_at: string;
};
export type ProfileTableRow = { user_id: string; payload: string; updated_at: string };
export type PrefsTableRow = { user_id: string; payload: string; updated_at: string };
export type ClientTableRow = {
  rowid: number;
  id: string;
  user_id: string;
  label: string;
  created_at: string;
};
export type PurchaseTableRow = {
  id: string;
  user_id: string | null;
  email: string;
  stripe_session_id: string;
  sku: string;
  address_label: string;
  status: string;
  created_at: string;
};

export type Tables = {
  users: UserTableRow[];
  magic_links: MagicLinkTableRow[];
  sessions: SessionTableRow[];
  profiles: ProfileTableRow[];
  prefs: PrefsTableRow[];
  clients: ClientTableRow[];
  purchases: PurchaseTableRow[];
};

const normalize = (sql: string): string => sql.replace(/\s+/g, " ").trim();

/** The full SQL surface of src/routes/* - normalized, exact. */
const SQL = {
  insertMagicLink: "INSERT INTO magic_links (token_hash, email, expires_at) VALUES (?, ?, ?)",
  selectMagicLink:
    "SELECT token_hash, email, expires_at, used_at FROM magic_links WHERE token_hash = ?",
  burnMagicLink: "UPDATE magic_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL",
  selectUserByEmail: "SELECT id, email, kind, created_at FROM users WHERE email = ?",
  insertUser: "INSERT INTO users (id, email, kind, created_at) VALUES (?, ?, 'buyer', ?)",
  insertSession: "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
  selectEvictedSessions:
    "SELECT id FROM sessions WHERE user_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?2",
  deleteSessionById: "DELETE FROM sessions WHERE id = ? AND user_id = ?",
  selectUserById: "SELECT id, email, kind, created_at FROM users WHERE id = ?",
  selectProfile: "SELECT payload FROM profiles WHERE user_id = ?",
  upsertProfile:
    "INSERT INTO profiles (user_id, payload, updated_at) VALUES (?, ?, ?) " +
    "ON CONFLICT (user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
  selectPrefs: "SELECT payload FROM prefs WHERE user_id = ?",
  upsertPrefs:
    "INSERT INTO prefs (user_id, payload, updated_at) VALUES (?, ?, ?) " +
    "ON CONFLICT (user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
  updateUserKind: "UPDATE users SET kind = ? WHERE id = ?",
  insertClient: "INSERT INTO clients (id, user_id, label, created_at) VALUES (?, ?, ?, ?)",
  trimClients:
    "DELETE FROM clients WHERE user_id = ?1 AND rowid NOT IN " +
    "(SELECT rowid FROM clients WHERE user_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT ?2)",
  insertPurchase:
    "INSERT INTO purchases (id, user_id, email, stripe_session_id, sku, address_label, status) " +
    "VALUES (?, ?, ?, ?, ?, ?, 'pending')",
  completePurchase:
    "UPDATE purchases SET status = 'paid' WHERE stripe_session_id = ? AND status = 'pending'",
  expirePurchase:
    "UPDATE purchases SET status = 'failed' WHERE stripe_session_id = ? AND status = 'pending'",
} as const;

type ExecResult = { rows: Record<string, unknown>[]; changes: number };

const d1Meta = (changes: number, rowsRead: number): D1Meta & Record<string, unknown> => ({
  duration: 0,
  size_after: 0,
  rows_read: rowsRead,
  rows_written: changes,
  last_row_id: 0,
  changed_db: changes > 0,
  changes,
});

class FakeStatement implements D1PreparedStatement {
  private params: unknown[] = [];

  constructor(
    private readonly db: FakeD1,
    private readonly sql: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.params = values;
    return this;
  }

  first<T = unknown>(colName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const { rows } = this.db.execute(this.sql, this.params);
    const row = rows[0];
    if (!row) return null;
    if (colName !== undefined) return (row[colName] as T | undefined) ?? null;
    return row as unknown as T;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const { rows, changes } = this.db.execute(this.sql, this.params);
    return { results: rows as unknown as T[], success: true, meta: d1Meta(changes, rows.length) };
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.run<T>();
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    const { results } = await this.all<Record<string, unknown>>();
    const rows = results.map((row) => Object.values(row) as T);
    if (options?.columnNames) {
      return [results[0] ? Object.keys(results[0]) : [], ...rows];
    }
    return rows;
  }
}

export class FakeD1 implements D1Database {
  readonly tables: Tables = {
    users: [],
    magic_links: [],
    sessions: [],
    profiles: [],
    prefs: [],
    clients: [],
    purchases: [],
  };
  private nextSessionRowid = 1;
  private nextClientRowid = 1;

  allocateSessionRowid(): number {
    return this.nextSessionRowid++;
  }

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, normalize(query));
  }

  async batch<T = Record<string, unknown>>(
    _statements: D1PreparedStatement[]
  ): Promise<D1Result<T>[]> {
    throw new Error("FakeD1.batch: no route uses batch");
  }

  async exec(query: string): Promise<D1ExecResult> {
    const statements = query
      .split(";")
      .map(normalize)
      .filter((statement) => statement.length > 0);
    for (const statement of statements) this.execute(statement, []);
    return { count: statements.length, duration: 0 };
  }

  withSession(): D1DatabaseSession {
    throw new Error("FakeD1.withSession: no route uses sessions");
  }

  dump(): Promise<ArrayBuffer> {
    throw new Error("FakeD1.dump: no route uses dump");
  }

  execute(sql: string, params: unknown[]): ExecResult {
    const t = this.tables;
    switch (sql) {
      case SQL.insertMagicLink: {
        const [token_hash, email, expires_at] = params as [string, string, string];
        if (t.magic_links.some((r) => r.token_hash === token_hash)) {
          throw new Error("UNIQUE constraint failed: magic_links.token_hash");
        }
        t.magic_links.push({ token_hash, email, expires_at, used_at: null });
        return { rows: [], changes: 1 };
      }
      case SQL.selectMagicLink: {
        const [token_hash] = params as [string];
        return { rows: t.magic_links.filter((r) => r.token_hash === token_hash), changes: 0 };
      }
      case SQL.burnMagicLink: {
        const [used_at, token_hash] = params as [string, string];
        let changes = 0;
        for (const r of t.magic_links) {
          if (r.token_hash === token_hash && r.used_at === null) {
            r.used_at = used_at;
            changes += 1;
          }
        }
        return { rows: [], changes };
      }
      case SQL.selectUserByEmail: {
        const [email] = params as [string];
        return { rows: t.users.filter((r) => r.email === email), changes: 0 };
      }
      case SQL.insertUser: {
        const [id, email, created_at] = params as [string, string, string];
        if (t.users.some((r) => r.email === email)) {
          throw new Error("UNIQUE constraint failed: users.email");
        }
        t.users.push({ id, email, kind: "buyer", created_at });
        return { rows: [], changes: 1 };
      }
      case SQL.insertSession: {
        const [id, user_id, expires_at] = params as [string, string, string];
        t.sessions.push({
          rowid: this.allocateSessionRowid(),
          id,
          user_id,
          created_at: new Date().toISOString(),
          expires_at,
        });
        return { rows: [], changes: 1 };
      }
      case SQL.selectEvictedSessions: {
        const [user_id, offset] = params as [string, number];
        const newestFirst = t.sessions
          .filter((s) => s.user_id === user_id)
          .sort((a, b) => {
            if (a.created_at === b.created_at) return b.rowid - a.rowid;
            if (a.created_at === null) return 1;
            if (b.created_at === null) return -1;
            return a.created_at < b.created_at ? 1 : -1;
          });
        return {
          rows: newestFirst.slice(offset).map((s) => ({ id: s.id })),
          changes: 0,
        };
      }
      case SQL.deleteSessionById: {
        const [id, user_id] = params as [string, string];
        const before = t.sessions.length;
        this.tables.sessions = t.sessions.filter((s) => s.id !== id || s.user_id !== user_id);
        return { rows: [], changes: before - this.tables.sessions.length };
      }
      case SQL.selectUserById: {
        const [id] = params as [string];
        return { rows: t.users.filter((r) => r.id === id), changes: 0 };
      }
      case SQL.selectProfile: {
        const [user_id] = params as [string];
        return { rows: t.profiles.filter((r) => r.user_id === user_id), changes: 0 };
      }
      case SQL.upsertProfile: {
        const [user_id, payload, updated_at] = params as [string, string, string];
        const existing = t.profiles.find((r) => r.user_id === user_id);
        if (existing) {
          existing.payload = payload;
          existing.updated_at = updated_at;
        } else {
          t.profiles.push({ user_id, payload, updated_at });
        }
        return { rows: [], changes: 1 };
      }
      case SQL.selectPrefs: {
        const [user_id] = params as [string];
        return { rows: t.prefs.filter((r) => r.user_id === user_id), changes: 0 };
      }
      case SQL.upsertPrefs: {
        const [user_id, payload, updated_at] = params as [string, string, string];
        const existing = t.prefs.find((r) => r.user_id === user_id);
        if (existing) {
          existing.payload = payload;
          existing.updated_at = updated_at;
        } else {
          t.prefs.push({ user_id, payload, updated_at });
        }
        return { rows: [], changes: 1 };
      }
      case SQL.updateUserKind: {
        const [kind, id] = params as [string, string];
        let changes = 0;
        for (const r of t.users) {
          if (r.id === id) {
            r.kind = kind;
            changes += 1;
          }
        }
        return { rows: [], changes };
      }
      case SQL.insertClient: {
        const [id, user_id, label, created_at] = params as [string, string, string, string];
        t.clients.push({ rowid: this.nextClientRowid++, id, user_id, label, created_at });
        return { rows: [], changes: 1 };
      }
      case SQL.trimClients: {
        const [user_id, limit] = params as [string, number];
        const newestFirst = t.clients
          .filter((c) => c.user_id === user_id)
          .sort((a, b) =>
            a.created_at === b.created_at
              ? b.rowid - a.rowid
              : a.created_at < b.created_at
                ? 1
                : -1
          );
        const keep = new Set(newestFirst.slice(0, limit).map((c) => c.rowid));
        const before = t.clients.length;
        this.tables.clients = t.clients.filter(
          (c) => c.user_id !== user_id || keep.has(c.rowid)
        );
        return { rows: [], changes: before - this.tables.clients.length };
      }
      case SQL.insertPurchase: {
        const [id, user_id, email, stripe_session_id, sku, address_label] = params as [
          string,
          string | null,
          string,
          string,
          string,
          string,
        ];
        if (t.purchases.some((r) => r.stripe_session_id === stripe_session_id)) {
          throw new Error("UNIQUE constraint failed: purchases.stripe_session_id");
        }
        t.purchases.push({
          id,
          user_id,
          email,
          stripe_session_id,
          sku,
          address_label,
          status: "pending",
          created_at: new Date().toISOString(),
        });
        return { rows: [], changes: 1 };
      }
      case SQL.completePurchase:
      case SQL.expirePurchase: {
        const [stripe_session_id] = params as [string];
        const next = sql === SQL.completePurchase ? "paid" : "failed";
        let changes = 0;
        for (const r of t.purchases) {
          if (r.stripe_session_id === stripe_session_id && r.status === "pending") {
            r.status = next;
            changes += 1;
          }
        }
        return { rows: [], changes };
      }
      default:
        throw new Error(`FakeD1: unhandled SQL: ${sql}`);
    }
  }
}

// --- KV ----------------------------------------------------------------

/**
 * TTL-aware KV fake with its own advanceable clock, so "the session
 * expired" is modelled as elapsed time, not as a sneaky delete.
 */
type KvGetType = "text" | "json" | "arrayBuffer" | "stream";
type KvGetArg =
  | KvGetType
  | Partial<KVNamespaceGetOptions<undefined>>
  | KVNamespaceGetOptions<KvGetType>;

const isKvGetType = (value: unknown): value is KvGetType =>
  value === "text" || value === "json" || value === "arrayBuffer" || value === "stream";

const kvGetType = (arg: KvGetArg | undefined): KvGetType => {
  if (isKvGetType(arg)) return arg;
  if (typeof arg === "object" && arg !== null && "type" in arg) {
    const candidate = (arg as { type?: unknown }).type;
    if (isKvGetType(candidate)) return candidate;
  }
  return "text";
};

export class FakeKV implements KVNamespace {
  readonly store = new Map<string, { value: string; expiresAtMs: number | null }>();
  private nowMs = Date.now();

  /** Move this namespace's TTL clock forward (simulates KV expiry). */
  advance(seconds: number): void {
    this.nowMs += seconds * 1000;
  }

  private readString(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs !== null && entry.expiresAtMs <= this.nowMs) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  private readValue<ExpectedValue>(key: string, type: KvGetType) {
    const value = this.readString(key);
    if (value === null) return null;
    if (type === "json") return JSON.parse(value) as ExpectedValue;
    if (type === "arrayBuffer") return new TextEncoder().encode(value).buffer.slice(0);
    if (type === "stream") return new Blob([value]).stream();
    return value;
  }

  get(key: string, options?: Partial<KVNamespaceGetOptions<undefined>>): Promise<string | null>;
  get(key: string, type: "text"): Promise<string | null>;
  get<ExpectedValue = unknown>(key: string, type: "json"): Promise<ExpectedValue | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  get(key: string, type: "stream"): Promise<ReadableStream | null>;
  get(key: string, options?: KVNamespaceGetOptions<"text">): Promise<string | null>;
  get<ExpectedValue = unknown>(
    key: string,
    options?: KVNamespaceGetOptions<"json">
  ): Promise<ExpectedValue | null>;
  get(key: string, options?: KVNamespaceGetOptions<"arrayBuffer">): Promise<ArrayBuffer | null>;
  get(key: string, options?: KVNamespaceGetOptions<"stream">): Promise<ReadableStream | null>;
  get(key: string[], type: "text"): Promise<Map<string, string | null>>;
  get<ExpectedValue = unknown>(
    key: string[],
    type: "json"
  ): Promise<Map<string, ExpectedValue | null>>;
  get(
    key: string[],
    options?: Partial<KVNamespaceGetOptions<undefined>>
  ): Promise<Map<string, string | null>>;
  get(
    key: string[],
    options?: KVNamespaceGetOptions<"text">
  ): Promise<Map<string, string | null>>;
  get<ExpectedValue = unknown>(
    key: string[],
    options?: KVNamespaceGetOptions<"json">
  ): Promise<Map<string, ExpectedValue | null>>;
  async get<ExpectedValue = unknown>(
    key: string | string[],
    typeOrOptions?: KvGetArg
  ): Promise<
    | string
    | ExpectedValue
    | ArrayBuffer
    | ReadableStream
    | null
    | Map<string, string | ExpectedValue | ArrayBuffer | ReadableStream | null>
  > {
    const type = kvGetType(typeOrOptions);
    if (Array.isArray(key)) {
      return new Map(key.map((item) => [item, this.readValue<ExpectedValue>(item, type)]));
    }
    return this.readValue<ExpectedValue>(key, type);
  }

  async list<Metadata = unknown>(
    options?: KVNamespaceListOptions
  ): Promise<KVNamespaceListResult<Metadata, string>> {
    const prefix = options?.prefix ?? "";
    const liveKeys = [...this.store.keys()].filter((key) => this.readString(key) !== null);
    const matchingKeys = prefix ? liveKeys.filter((key) => key.startsWith(prefix)) : liveKeys;
    const limit = options?.limit ?? matchingKeys.length;
    return {
      list_complete: true,
      keys: matchingKeys.slice(0, limit).map((name) => ({ name })),
      cacheStatus: null,
    };
  }

  private withMetadata<Value, Metadata>(
    value: Value | null
  ): KVNamespaceGetWithMetadataResult<Value, Metadata> {
    return { value, metadata: null, cacheStatus: null };
  }

  getWithMetadata<Metadata = unknown>(
    key: string,
    options?: Partial<KVNamespaceGetOptions<undefined>>
  ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    type: "text"
  ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
  getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string,
    type: "json"
  ): Promise<KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    type: "arrayBuffer"
  ): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    type: "stream"
  ): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    options: KVNamespaceGetOptions<"text">
  ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
  getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string,
    options: KVNamespaceGetOptions<"json">
  ): Promise<KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    options: KVNamespaceGetOptions<"arrayBuffer">
  ): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    options: KVNamespaceGetOptions<"stream">
  ): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string[],
    type: "text"
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<string, Metadata>>>;
  getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string[],
    type: "json"
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>>;
  getWithMetadata<Metadata = unknown>(
    key: string[],
    options?: Partial<KVNamespaceGetOptions<undefined>>
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<string, Metadata>>>;
  getWithMetadata<Metadata = unknown>(
    key: string[],
    options?: KVNamespaceGetOptions<"text">
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<string, Metadata>>>;
  getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string[],
    options?: KVNamespaceGetOptions<"json">
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>>;
  async getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string | string[],
    typeOrOptions?: KvGetArg
  ): Promise<
    | KVNamespaceGetWithMetadataResult<
        string | ExpectedValue | ArrayBuffer | ReadableStream,
        Metadata
      >
    | Map<
        string,
        KVNamespaceGetWithMetadataResult<
          string | ExpectedValue | ArrayBuffer | ReadableStream,
          Metadata
        >
      >
  > {
    const type = kvGetType(typeOrOptions);
    if (Array.isArray(key)) {
      return new Map(
        key.map((item) => [
          item,
          this.withMetadata<string | ExpectedValue | ArrayBuffer | ReadableStream, Metadata>(
            this.readValue<ExpectedValue>(item, type)
          ),
        ])
      );
    }
    return this.withMetadata<string | ExpectedValue | ArrayBuffer | ReadableStream, Metadata>(
      this.readValue<ExpectedValue>(key, type)
    );
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    if (typeof value !== "string") {
      throw new Error("FakeKV.put: only string values are used by these tests");
    }
    const expiresAtMs =
      options?.expirationTtl !== undefined
        ? this.nowMs + options.expirationTtl * 1000
        : options?.expiration !== undefined
          ? options.expiration * 1000
          : null;
    this.store.set(key, { value, expiresAtMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

// --- R2 (bound but unused until the report pipeline lands) --------------

type R2PutValue = ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob;

const r2Size = (value: R2PutValue): number => {
  if (value === null) return 0;
  if (typeof value === "string") return new TextEncoder().encode(value).byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof Blob) return value.size;
  return 0;
};

const r2HttpMetadata = (metadata?: R2HTTPMetadata | Headers): R2HTTPMetadata | undefined => {
  if (!metadata) return undefined;
  if (!(metadata instanceof Headers)) return metadata;

  const out: R2HTTPMetadata = {};
  const contentType = metadata.get("content-type");
  const contentLanguage = metadata.get("content-language");
  const contentDisposition = metadata.get("content-disposition");
  const contentEncoding = metadata.get("content-encoding");
  const cacheControl = metadata.get("cache-control");
  if (contentType !== null) out.contentType = contentType;
  if (contentLanguage !== null) out.contentLanguage = contentLanguage;
  if (contentDisposition !== null) out.contentDisposition = contentDisposition;
  if (contentEncoding !== null) out.contentEncoding = contentEncoding;
  if (cacheControl !== null) out.cacheControl = cacheControl;
  return Object.keys(out).length > 0 ? out : undefined;
};

const writeR2HttpMetadata = (headers: Headers, metadata: R2HTTPMetadata | undefined): void => {
  if (!metadata) return;
  if (metadata.contentType) headers.set("content-type", metadata.contentType);
  if (metadata.contentLanguage) headers.set("content-language", metadata.contentLanguage);
  if (metadata.contentDisposition) headers.set("content-disposition", metadata.contentDisposition);
  if (metadata.contentEncoding) headers.set("content-encoding", metadata.contentEncoding);
  if (metadata.cacheControl) headers.set("cache-control", metadata.cacheControl);
  if (metadata.cacheExpiry) headers.set("expires", metadata.cacheExpiry.toUTCString());
};

const makeR2Object = (
  key: string,
  value: R2PutValue,
  options?: R2PutOptions
): R2Object => {
  const httpMetadata = r2HttpMetadata(options?.httpMetadata);
  return {
    key,
    version: "fake-r2-version",
    size: r2Size(value),
    etag: "fake-r2-etag",
    httpEtag: '"fake-r2-etag"',
    checksums: { toJSON: () => ({}) },
    uploaded: new Date(0),
    httpMetadata,
    customMetadata: options?.customMetadata,
    storageClass: options?.storageClass ?? "Standard",
    writeHttpMetadata(headers: Headers) {
      writeR2HttpMetadata(headers, httpMetadata);
    },
  };
};

class FakeR2 implements R2Bucket {
  async head(_key: string): Promise<R2Object | null> {
    return null;
  }

  get(
    key: string,
    options: R2GetOptions & { onlyIf: R2Conditional | Headers }
  ): Promise<R2ObjectBody | R2Object | null>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  async get(_key: string, _options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null> {
    return null;
  }

  put(
    key: string,
    value: R2PutValue,
    options?: R2PutOptions & { onlyIf: R2Conditional | Headers }
  ): Promise<R2Object | null>;
  put(key: string, value: R2PutValue, options?: R2PutOptions): Promise<R2Object>;
  async put(key: string, value: R2PutValue, options?: R2PutOptions): Promise<R2Object | null> {
    return makeR2Object(key, value, options);
  }

  async createMultipartUpload(
    _key: string,
    _options?: R2MultipartOptions
  ): Promise<R2MultipartUpload> {
    throw new Error("FakeR2.createMultipartUpload: no route uses multipart uploads");
  }

  resumeMultipartUpload(_key: string, _uploadId: string): R2MultipartUpload {
    throw new Error("FakeR2.resumeMultipartUpload: no route uses multipart uploads");
  }

  async delete(_keys: string | string[]): Promise<void> {}

  async list(_options?: R2ListOptions): Promise<R2Objects> {
    return { objects: [], delimitedPrefixes: [], truncated: false };
  }
}

export function fakeR2(): R2Bucket {
  return new FakeR2();
}

// --- env / request helpers ----------------------------------------------

export type TestEnv = Env & { DB: FakeD1; SESSIONS: FakeKV };

export function makeEnv(overrides: Partial<Env> = {}): TestEnv {
  return {
    DB: new FakeD1(),
    SESSIONS: new FakeKV(),
    REPORTS: fakeR2(),
    ...overrides,
  } as TestEnv;
}

export const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

/**
 * Dispatch a request through the worker's fetch handler. A string body is
 * sent raw (webhook signatures cover exact bytes); anything else is
 * JSON-stringified with a Content-Type to match.
 */
export function call(
  env: Env,
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: unknown } = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  let body: string | undefined;
  if (typeof init.body === "string") {
    body = init.body;
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  return worker.fetch(new Request(`https://api.festra.au${path}`, { method, headers, body }), env, ctx);
}

/** Seed a user + live session (KV hot path AND D1 audit mirror). */
export async function seedUserWithSession(
  env: TestEnv,
  opts: { email?: string; kind?: "buyer" | "agent" } = {}
): Promise<{ userId: string; sessionId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const now = new Date();
  env.DB.tables.users.push({
    id: userId,
    email: opts.email ?? "user@festra.au",
    kind: opts.kind ?? "buyer",
    created_at: now.toISOString(),
  });
  env.DB.tables.sessions.push({
    rowid: env.DB.allocateSessionRowid(),
    id: sessionId,
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
  });
  await env.SESSIONS.put(sessionId, userId, { expirationTtl: 30 * 86_400 });
  return { userId, sessionId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

// --- global fetch stub (Stripe / Resend) ---------------------------------

export type FetchStub = {
  calls: Array<{ url: string; init: RequestInit | undefined }>;
  restore: () => void;
};

/** Replace globalThis.fetch, recording every call. Always restore() after. */
export function stubFetch(
  responder: (url: string, init: RequestInit | undefined) => Response | Promise<Response>
): FetchStub {
  const calls: FetchStub["calls"] = [];
  const original = globalThis.fetch;
  const fake = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return responder(url, init);
  };
  (globalThis as { fetch: typeof fetch }).fetch = fake as typeof fetch;
  return {
    calls,
    restore() {
      (globalThis as { fetch: typeof fetch }).fetch = original;
    },
  };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
