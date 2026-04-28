// API 客户端 —— 待 API 文档确定后填充具体接口
const BASE_URL = "/api";

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;

  const headers: Record<string, string> = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ========== 发布相关接口（待 API 文档补充） ==========

export interface Release {
  id: string;
  version: string;
  status: "draft" | "published" | "archived";
  createdAt: string;
}

export const releaseApi = {
  list: () => api.get<Release[]>("/releases"),
  get: (id: string) => api.get<Release>(`/releases/${id}`),
  create: (data: Partial<Release>) => api.post<Release>("/releases", data),
};
