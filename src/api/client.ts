export type JsonObject = Record<string, unknown>;

export interface ManagementSettings {
  baseUrl: string;
  managementKey: string;
}

export interface UsageTokenBreakdown {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
  total_tokens?: number;
}

export interface UsageDetail {
  timestamp?: string;
  source?: string;
  auth_index?: string;
  tokens?: UsageTokenBreakdown;
  failed?: boolean;
  error?: string;
}

export interface UsageModelBucket {
  total_requests?: number;
  total_tokens?: number;
  details?: UsageDetail[];
}

export interface UsageApiBucket {
  total_requests?: number;
  total_tokens?: number;
  models?: Record<string, UsageModelBucket>;
}

export interface UsageSummary {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  requests_by_day?: Record<string, number>;
  requests_by_hour?: Record<string, number>;
  tokens_by_day?: Record<string, number>;
  tokens_by_hour?: Record<string, number>;
  apis?: Record<string, UsageApiBucket>;
}

export interface UsageResponse {
  usage?: UsageSummary;
  failed_requests?: number;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
}

export interface ModelAlias {
  name: string;
  alias?: string;
}

export interface ProviderApiKeyEntry {
  "api-key": string;
  "base-url"?: string;
  "proxy-url"?: string;
  headers?: Record<string, string>;
  "excluded-models"?: string[];
  models?: ModelAlias[];
}

export interface OpenAICompatibilityProvider {
  name: string;
  "base-url": string;
  "api-key-entries": Array<{
    "api-key": string;
    "proxy-url"?: string;
  }>;
  headers?: Record<string, string>;
  models?: ModelAlias[];
}

export interface AuthFile {
  id?: string;
  name: string;
  provider?: string;
  label?: string;
  status?: string;
  status_message?: string;
  disabled?: boolean;
  unavailable?: boolean;
  runtime_only?: boolean;
  source?: string;
  path?: string;
  size?: number;
  modtime?: string;
  email?: string;
  account_type?: string;
  account?: string;
  created_at?: string;
  updated_at?: string;
  last_refresh?: string;
  type?: string;
}

export interface LogResponse {
  lines?: string[];
  "line-count"?: number;
  "latest-timestamp"?: number;
}

export interface ErrorLogFile {
  name: string;
  size?: number;
  modified?: number;
}

export interface OAuthUrlResponse {
  status?: string;
  url?: string;
  state?: string;
}

export interface OAuthStatusResponse {
  status?: "wait" | "ok" | "error" | string;
  error?: string;
}

export interface VertexImportResponse {
  status?: string;
  "auth-file"?: string;
  project_id?: string;
  email?: string;
  location?: string;
}

export class ManagementApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "ManagementApiError";
    this.status = status;
    this.payload = payload;
  }
}

const SETTINGS_STORAGE_KEY = "cpam.management.settings";

function defaultBaseUrl(): string {
  if (typeof window === "undefined") {
    return "/v0/management";
  }

  const { protocol, hostname, port, origin } = window.location;
  if (protocol === "http:" || protocol === "https:") {
    const isLocalDevHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    if (isLocalDevHost && (port === "5173" || port === "4173")) {
      return "http://localhost:8317/v0/management";
    }
    return `${origin}/v0/management`;
  }

  return "http://localhost:8317/v0/management";
}

export function readManagementSettings(): ManagementSettings {
  const fallback = { baseUrl: defaultBaseUrl(), managementKey: "" };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<ManagementSettings>;
    return {
      baseUrl: parsed.baseUrl?.trim() || fallback.baseUrl,
      managementKey: parsed.managementKey ?? "",
    };
  } catch {
    return fallback;
  }
}

export function saveManagementSettings(settings: ManagementSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      baseUrl: settings.baseUrl.trim() || defaultBaseUrl(),
      managementKey: settings.managementKey,
    }),
  );
  window.dispatchEvent(new Event("cpam-management-settings"));
}

export function onManagementSettingsChange(listener: () => void) {
  window.addEventListener("cpam-management-settings", listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener("cpam-management-settings", listener);
    window.removeEventListener("storage", listener);
  };
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const { baseUrl } = readManagementSettings();
  return `${baseUrl.replace(/\/+$/, "")}${normalizePath(path)}`;
}

async function parseResponse(res: Response): Promise<unknown> {
  if (res.status === 204) {
    return null;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

function errorMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === "object") {
    const item = payload as JsonObject;
    const message = item.message ?? item.error;
    if (typeof message === "string") {
      return message;
    }
  }

  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  return `管理 API 请求失败 (${status})`;
}

async function request<T>(
  path: string,
  options: RequestInit & { yaml?: boolean } = {},
): Promise<T> {
  const { managementKey } = readManagementSettings();
  const headers = new Headers(options.headers);

  if (!managementKey.trim()) {
    throw new ManagementApiError(401, "请先在右上角配置管理密钥", null);
  }

  if (managementKey) {
    headers.set("Authorization", `Bearer ${managementKey}`);
  }

  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", options.yaml ? "application/yaml" : "application/json");
  }

  const res = await fetch(buildUrl(path), {
    ...options,
    headers,
    cache: "no-store",
  });
  const payload = await parseResponse(res);

  if (!res.ok) {
    throw new ManagementApiError(res.status, errorMessage(res.status, payload), payload);
  }

  return payload as T;
}

function withValue(value: boolean | number | string) {
  return JSON.stringify({ value });
}

function encodeQuery(value: string | number | boolean) {
  return encodeURIComponent(String(value));
}

async function downloadBlob(path: string): Promise<Blob> {
  const { managementKey } = readManagementSettings();
  const headers = new Headers();

  if (!managementKey.trim()) {
    throw new ManagementApiError(401, "请先在右上角配置管理密钥", null);
  }

  if (managementKey) {
    headers.set("Authorization", `Bearer ${managementKey}`);
  }

  const res = await fetch(buildUrl(path), { headers, cache: "no-store" });
  if (!res.ok) {
    const payload = await parseResponse(res);
    throw new ManagementApiError(res.status, errorMessage(res.status, payload), payload);
  }
  return res.blob();
}

export function downloadBrowserFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(data: unknown, filename: string) {
  downloadBrowserFile(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    filename,
  );
}

export const managementApi = {
  getUsage: () => request<UsageResponse>("/usage"),
  exportUsage: () => request<JsonObject>("/usage/export"),
  importUsage: (snapshot: unknown) =>
    request<UsageImportResponse>("/usage/import", {
      method: "POST",
      body: JSON.stringify(snapshot),
    }),

  getConfig: () => request<JsonObject>("/config"),
  getLatestVersion: () => request<{ "latest-version"?: string }>("/latest-version"),
  getYaml: () => request<string>("/config.yaml"),
  saveYaml: (yaml: string) =>
    request<{ ok?: boolean; changed?: string[] }>("/config.yaml", {
      method: "PUT",
      body: yaml,
      yaml: true,
    }),

  getBooleanSetting: (path: string, key: string) =>
    request<Record<string, boolean>>(path).then((data) => Boolean(data[key])),
  setValue: (path: string, value: boolean | number | string, method: "PATCH" | "PUT" = "PATCH") =>
    request<{ status?: string }>(path, { method, body: withValue(value) }),
  deletePath: (path: string) => request<{ status?: string }>(path, { method: "DELETE" }),

  getProxyUrl: () =>
    request<{ "proxy-url"?: string }>("/proxy-url").then((data) => data["proxy-url"] ?? ""),
  getNumberSetting: (path: string, key: string) =>
    request<Record<string, number>>(path).then((data) => Number(data[key] ?? 0)),

  getApiKeys: () =>
    request<{ "api-keys"?: string[] }>("/api-keys").then((data) => data["api-keys"] ?? []),
  putApiKeys: (items: string[]) =>
    request<{ status?: string }>("/api-keys", { method: "PUT", body: JSON.stringify(items) }),
  patchApiKey: (index: number, value: string) =>
    request<{ status?: string }>("/api-keys", {
      method: "PATCH",
      body: JSON.stringify({ index, value }),
    }),
  deleteApiKey: (index: number) =>
    request<{ status?: string }>(`/api-keys?index=${index}`, { method: "DELETE" }),

  getProviderList: <T>(path: string, key: string) =>
    request<Record<string, T[]>>(path).then((data) => data[key] ?? []),
  putProviderList: <T>(path: string, items: T[]) =>
    request<{ status?: string }>(path, { method: "PUT", body: JSON.stringify(items) }),
  deleteProviderItem: (path: string, queryKey: string, value: string | number) =>
    request<{ status?: string }>(`${path}?${queryKey}=${encodeQuery(value)}`, {
      method: "DELETE",
    }),

  getOAuthExcludedModels: () =>
    request<{ "oauth-excluded-models"?: Record<string, string[]> }>("/oauth-excluded-models").then(
      (data) => data["oauth-excluded-models"] ?? {},
    ),
  putOAuthExcludedModels: (items: Record<string, string[]>) =>
    request<{ status?: string }>("/oauth-excluded-models", {
      method: "PUT",
      body: JSON.stringify(items),
    }),
  deleteOAuthExcludedProvider: (provider: string) =>
    request<{ status?: string }>(`/oauth-excluded-models?provider=${encodeQuery(provider)}`, {
      method: "DELETE",
    }),

  getAuthFiles: () => request<{ files?: AuthFile[] }>("/auth-files").then((data) => data.files ?? []),
  uploadAuthFile: (file: File, name?: string) => {
    const form = new FormData();
    form.append("file", file, name || file.name);
    return request<{ status?: string }>("/auth-files", { method: "POST", body: form });
  },
  deleteAuthFile: (name: string) =>
    request<{ status?: string }>(`/auth-files?name=${encodeQuery(name)}`, { method: "DELETE" }),
  deleteAllAuthFiles: () =>
    request<{ status?: string; deleted?: number }>("/auth-files?all=true", { method: "DELETE" }),
  downloadAuthFile: (name: string) => downloadBlob(`/auth-files/download?name=${encodeQuery(name)}`),
  importVertex: (file: File, location: string) => {
    const form = new FormData();
    form.append("file", file, file.name);
    if (location.trim()) {
      form.append("location", location.trim());
    }
    return request<VertexImportResponse>("/vertex/import", { method: "POST", body: form });
  },

  startOAuth: (provider: "anthropic" | "codex" | "gemini-cli" | "antigravity", projectId = "") => {
    const params = new URLSearchParams({ is_webui: "true" });
    if (provider === "gemini-cli" && projectId.trim()) {
      params.set("project_id", projectId.trim());
    }
    return request<OAuthUrlResponse>(`/${provider}-auth-url?${params.toString()}`);
  },
  pollOAuthStatus: (state: string) =>
    request<OAuthStatusResponse>(`/get-auth-status?state=${encodeQuery(state)}`),

  getLogs: (after?: number) =>
    request<LogResponse>(after ? `/logs?after=${after}` : "/logs"),
  clearLogs: () =>
    request<{ success?: boolean; message?: string; removed?: number }>("/logs", {
      method: "DELETE",
    }),
  getErrorLogs: () =>
    request<{ files?: ErrorLogFile[] }>("/request-error-logs").then((data) => data.files ?? []),
  downloadErrorLog: (name: string) => downloadBlob(`/request-error-logs/${encodeQuery(name)}`),
};
