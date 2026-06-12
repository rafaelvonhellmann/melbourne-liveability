export type ApiErrorCode = "network" | "unavailable" | string;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type JsonBody = Record<string, unknown> | unknown[];

type ApiFetchInit = Omit<RequestInit, "body" | "credentials"> & {
  body?: BodyInit | null;
  json?: JsonBody;
};

function isObjectBody(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorCode(response: Response, body: unknown): ApiErrorCode {
  if (response.status === 503) return "unavailable";
  if (isObjectBody(body) && typeof body.error === "string" && body.error.length > 0) {
    return body.error;
  }
  return `http_${response.status}`;
}

export async function apiFetch<T = unknown>(
  path: `/api/${string}`,
  init: ApiFetchInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  const body =
    init.json === undefined
      ? init.body
      : JSON.stringify(init.json);

  if (init.json !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      body,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "network");
  }

  const parsed = await readJson(response);
  if (!response.ok) {
    throw new ApiError(response.status, errorCode(response, parsed));
  }
  return parsed as T;
}
