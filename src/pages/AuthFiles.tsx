import { ChangeEvent, useEffect, useMemo, useState } from "react";
import antigravityIcon from "@lobehub/icons-static-svg/icons/antigravity-color.svg?url";
import claudeIcon from "@lobehub/icons-static-svg/icons/claude-color.svg?url";
import codexIcon from "@lobehub/icons-static-svg/icons/codex-color.svg?url";
import geminiIcon from "@lobehub/icons-static-svg/icons/gemini-color.svg?url";
import googleIcon from "@lobehub/icons-static-svg/icons/google-color.svg?url";
import kimiIcon from "@lobehub/icons-static-svg/icons/kimi-color.svg?url";
import openaiIcon from "@lobehub/icons-static-svg/icons/openai.svg?url";
import vertexIcon from "@lobehub/icons-static-svg/icons/vertexai-color.svg?url";
import { AuthFile, downloadBrowserFile, managementApi } from "../api/client";
import Icon from "../components/Icon";
import { formatBytes, formatDate } from "../utils/format";

type StatusFilter = "all" | "ready" | "warning" | "error";
type ProviderTone =
  | "antigravity"
  | "claude"
  | "codex"
  | "default"
  | "gemini"
  | "google"
  | "kimi"
  | "openai"
  | "vertex";

type BrandIcon = string;

interface AuthFileEditForm {
  name: string;
  prefix: string;
  proxyUrl: string;
  headers: string;
  priority: string;
  note: string;
}

const providerIcons: Partial<Record<ProviderTone, BrandIcon>> = {
  antigravity: antigravityIcon,
  claude: claudeIcon,
  codex: codexIcon,
  gemini: geminiIcon,
  google: googleIcon,
  kimi: kimiIcon,
  openai: openaiIcon,
  vertex: vertexIcon,
};

const emptyEditForm: AuthFileEditForm = {
  name: "",
  prefix: "",
  proxyUrl: "",
  headers: "",
  priority: "0",
  note: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function fieldFromAuth(file: AuthFile, key: string): unknown {
  const raw = file as unknown as Record<string, unknown>;
  const metadata = isRecord(file.metadata) ? file.metadata : {};
  const attributes = isRecord(file.attributes) ? file.attributes : {};
  return raw[key] ?? metadata[key] ?? attributes[key];
}

function authPrefix(file: AuthFile): string {
  return stringValue(fieldFromAuth(file, "prefix"));
}

function authProxyUrl(file: AuthFile): string {
  return stringValue(file.proxy_url ?? file.proxyUrl ?? fieldFromAuth(file, "proxy_url") ?? fieldFromAuth(file, "proxyUrl"));
}

function authPriority(file: AuthFile): number {
  return numberValue(file.priority ?? fieldFromAuth(file, "priority"));
}

function authNote(file: AuthFile): string {
  return stringValue(file.note ?? fieldFromAuth(file, "note"));
}

function authHeaders(file: AuthFile): Record<string, string> {
  const headers: Record<string, string> = {};
  const metadata = isRecord(file.metadata) ? file.metadata : {};
  const metadataHeaders = metadata.headers;
  if (isRecord(metadataHeaders)) {
    Object.entries(metadataHeaders).forEach(([key, value]) => {
      const text = stringValue(value).trim();
      if (key.trim() && text) {
        headers[key.trim()] = text;
      }
    });
  }
  const attributes = isRecord(file.attributes) ? file.attributes : {};
  Object.entries(attributes).forEach(([key, value]) => {
    if (!key.startsWith("header:")) {
      return;
    }
    const name = key.slice("header:".length).trim();
    const text = stringValue(value).trim();
    if (name && text) {
      headers[name] = text;
    }
  });
  return headers;
}

function headersToText(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function textToHeaders(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.includes(":") ? ":" : "=";
        const [key, ...rest] = line.split(separator);
        return [key.trim(), rest.join(separator).trim()] as const;
      })
      .filter(([key, entryValue]) => key && entryValue),
  );
}

function statusKind(file: AuthFile): Exclude<StatusFilter, "all"> {
  if (file.disabled || file.unavailable || file.status === "error") {
    return "error";
  }
  if (file.runtime_only || file.status === "wait") {
    return "warning";
  }
  return "ready";
}

function fileStatusClass(file: AuthFile): string {
  const kind = statusKind(file);
  if (kind === "error") {
    return "badge danger";
  }
  if (kind === "warning") {
    return "badge warn";
  }
  return "badge ok";
}

function statusLabel(file: AuthFile): string {
  if (file.status) {
    return file.status;
  }
  if (file.disabled) {
    return "disabled";
  }
  if (file.runtime_only) {
    return "runtime";
  }
  return "ready";
}

function providerName(file: AuthFile): string {
  return file.provider ?? file.type ?? "unknown";
}

function providerTone(file: AuthFile): ProviderTone {
  const provider = providerName(file).toLowerCase();
  if (provider.includes("antigravity")) {
    return "antigravity";
  }
  if (provider.includes("claude") || provider.includes("anthropic")) {
    return "claude";
  }
  if (provider.includes("codex")) {
    return "codex";
  }
  if (provider.includes("vertex")) {
    return "vertex";
  }
  if (provider.includes("gemini") || provider.includes("aistudio")) {
    return "gemini";
  }
  if (provider.includes("kimi")) {
    return "kimi";
  }
  if (provider.includes("openai")) {
    return "openai";
  }
  if (provider.includes("google")) {
    return "google";
  }
  return "default";
}

function providerLabel(file: AuthFile): string {
  const provider = providerName(file);
  const tone = providerTone(file);
  const labels: Record<ProviderTone, string> = {
    antigravity: "Antigravity",
    claude: "Claude",
    codex: "Codex",
    default: provider,
    gemini: "Gemini",
    google: "Google",
    kimi: "Kimi",
    openai: "OpenAI",
    vertex: "Vertex",
  };
  return labels[tone];
}

function accountLabel(file: AuthFile): string {
  return file.email ?? file.account ?? file.label ?? "-";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return objectValue(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

function planLabel(file: AuthFile): string {
  const idToken = objectValue(file.id_token);
  const metadata = objectValue(file.metadata);
  const attributes = objectValue(file.attributes);
  const metadataIdToken = objectValue(metadata?.id_token);
  const attributesIdToken = objectValue(attributes?.id_token);
  const candidates = [
    file.plan,
    file.plan_type,
    file.planType,
    idToken?.plan,
    idToken?.plan_type,
    idToken?.planType,
    metadata?.plan,
    metadata?.plan_type,
    metadata?.planType,
    metadataIdToken?.plan,
    metadataIdToken?.plan_type,
    metadataIdToken?.planType,
    attributes?.plan,
    attributes?.plan_type,
    attributes?.planType,
    attributesIdToken?.plan,
    attributesIdToken?.plan_type,
    attributesIdToken?.planType,
  ];
  const plan = candidates.map(stringValue).find(Boolean);
  if (!plan) {
    return "-";
  }

  const labels: Record<string, string> = {
    enterprise: "Enterprise",
    free: "Free",
    max: "Max",
    plan_enterprise: "Enterprise",
    plan_free: "Free",
    plan_max: "Max",
    plan_pro: "Pro",
    plan_team: "Team",
    pro: "Pro",
    team: "Team",
  };

  return labels[plan.toLowerCase()] ?? plan;
}

function matchesSearch(file: AuthFile, query: string): boolean {
  const text = [
    file.name,
    file.label,
    file.provider,
    file.type,
    file.email,
    file.account,
    file.status,
    file.status_message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

function ProviderBadge({ file }: { file: AuthFile }) {
  const tone = providerTone(file);
  const label = providerLabel(file);
  const Logo = providerIcons[tone];
  const initial = label.trim().slice(0, 1).toUpperCase() || "A";

  return (
    <span className={`auth-provider-pill ${tone}`} title={providerName(file)}>
      <span className="auth-provider-logo">
        {Logo ? <img src={Logo} alt="" aria-hidden="true" /> : <span>{initial}</span>}
      </span>
      <span>{label}</span>
    </span>
  );
}

export default function AuthFiles() {
  const [files, setFiles] = useState<AuthFile[]>([]);
  const [vertexLocation, setVertexLocation] = useState("us-central1");
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editForm, setEditForm] = useState<AuthFileEditForm>(emptyEditForm);
  const [editingFile, setEditingFile] = useState<AuthFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadFiles() {
    setLoading(true);
    setError("");
    try {
      setFiles(await managementApi.getAuthFiles());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载认证文件失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFiles();
    const refresh = () => void loadFiles();
    window.addEventListener("cpam-refresh", refresh);
    return () => window.removeEventListener("cpam-refresh", refresh);
  }, []);

  async function uploadAuthFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await managementApi.uploadAuthFile(file);
    event.target.value = "";
    setMessage("认证文件已上传");
    await loadFiles();
  }

  async function importVertex(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const result = await managementApi.importVertex(file, vertexLocation);
    event.target.value = "";
    setMessage(`Vertex 凭证已导入：${result.project_id ?? result["auth-file"] ?? "ok"}`);
    await loadFiles();
  }

  async function downloadFile(file: AuthFile) {
    const blob = await managementApi.downloadAuthFile(file.name);
    downloadBrowserFile(blob, file.name);
  }

  async function deleteFile(file: AuthFile) {
    if (!window.confirm(`删除 ${file.name}？`)) {
      return;
    }
    await managementApi.deleteAuthFile(file.name);
    setMessage("认证文件已删除");
    await loadFiles();
  }

  async function deleteAll() {
    if (!window.confirm("删除 auth-dir 下所有 JSON 认证文件？")) {
      return;
    }
    const result = await managementApi.deleteAllAuthFiles();
    setMessage(`已删除 ${result.deleted ?? 0} 个文件`);
    await loadFiles();
  }

  function openEditFields(file: AuthFile) {
    setEditingFile(file);
    setEditForm({
      name: file.id ?? file.name,
      prefix: authPrefix(file),
      proxyUrl: authProxyUrl(file),
      headers: headersToText(authHeaders(file)),
      priority: String(authPriority(file)),
      note: authNote(file),
    });
    setError("");
  }

  function closeEditFields() {
    setEditingFile(null);
    setEditForm(emptyEditForm);
  }

  async function saveEditFields() {
    if (!editForm.name.trim()) {
      return;
    }
    const existingHeaders = editingFile ? authHeaders(editingFile) : {};
    const nextHeaders = textToHeaders(editForm.headers);
    const headerPatch =
      editForm.headers.trim() || Object.keys(existingHeaders).length === 0
        ? nextHeaders
        : Object.fromEntries(Object.keys(existingHeaders).map((key) => [key, ""]));
    await managementApi.patchAuthFileFields({
      name: editForm.name.trim(),
      prefix: editForm.prefix.trim(),
      proxy_url: editForm.proxyUrl.trim(),
      headers: headerPatch,
      priority: Number(editForm.priority) || 0,
      note: editForm.note.trim(),
    });
    setMessage("认证文件字段已保存");
    closeEditFields();
    await loadFiles();
  }

  async function toggleDisabled(file: AuthFile) {
    const nextDisabled = !(file.disabled || file.status === "disabled");
    await managementApi.patchAuthFileStatus(file.id ?? file.name, nextDisabled);
    setMessage(nextDisabled ? "认证文件已禁用" : "认证文件已启用");
    await loadFiles();
  }

  const providerOptions = useMemo(
    () => Array.from(new Set(files.map((file) => providerName(file)).filter(Boolean))).sort(),
    [files],
  );

  const filteredFiles = useMemo(
    () =>
      files.filter((file) => {
        const providerMatched = providerFilter === "all" || providerName(file) === providerFilter;
        const statusMatched = statusFilter === "all" || statusKind(file) === statusFilter;
        return providerMatched && statusMatched && matchesSearch(file, query);
      }),
    [files, providerFilter, query, statusFilter],
  );

  const readyCount = files.filter((file) => statusKind(file) === "ready").length;
  const warningCount = files.filter((file) => statusKind(file) === "warning").length;
  const errorCount = files.filter((file) => statusKind(file) === "error").length;
  const fileCount = files.filter((file) => file.source !== "memory" && !file.runtime_only).length;

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>认证文件</h2>
          <p>管理 auth-dir 下的 JSON token 文件，支持上传、下载、删除和 Vertex 导入。</p>
        </div>
        <div className="actions">
          <label className="button subtle" htmlFor="auth-file-upload">
            <Icon name="upload" size={16} />
            上传 JSON
          </label>
          <input id="auth-file-upload" hidden type="file" accept="application/json,.json" onChange={uploadAuthFile} />
          <button className="button" disabled={loading} type="button" onClick={loadFiles}>
            <Icon name="refresh" size={16} />
            刷新
          </button>
          <button className="button danger" type="button" onClick={deleteAll}>
            <Icon name="trash" size={16} />
            删除全部
          </button>
        </div>
      </div>

      {error && <div className="error-state">{error}</div>}
      {message && <div className="empty-state">{message}</div>}

      <div className="grid four">
        <div className="stat-card">
          <div className="stat-label">认证文件</div>
          <div className="stat-value">{files.length}</div>
          <div className="stat-trend">磁盘文件 {fileCount} 个</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">可用</div>
          <div className="stat-value">{readyCount}</div>
          <div className="stat-trend">ready / active</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">等待或内存</div>
          <div className="stat-value">{warningCount}</div>
          <div className="stat-trend">wait / runtime</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">异常</div>
          <div className="stat-value">{errorCount}</div>
          <div className="stat-trend">disabled / unavailable</div>
        </div>
      </div>

      <div className="auth-files-layout">
        <div className="auth-files-main">
          <section className="panel">
            <div className="panel-header auth-toolbar">
              <div className="auth-search">
                <Icon name="search" size={16} />
                <input
                  placeholder="搜索文件、账号、Provider"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <select
                className="auth-filter-select"
                value={providerFilter}
                onChange={(event) => setProviderFilter(event.target.value)}
              >
                <option value="all">全部 Provider</option>
                {providerOptions.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
              <div className="segmented compact">
                <button className={statusFilter === "all" ? "active" : ""} type="button" onClick={() => setStatusFilter("all")}>
                  全部
                </button>
                <button className={statusFilter === "ready" ? "active" : ""} type="button" onClick={() => setStatusFilter("ready")}>
                  可用
                </button>
                <button className={statusFilter === "warning" ? "active" : ""} type="button" onClick={() => setStatusFilter("warning")}>
                  等待
                </button>
                <button className={statusFilter === "error" ? "active" : ""} type="button" onClick={() => setStatusFilter("error")}>
                  异常
                </button>
              </div>
              <span className="badge">{filteredFiles.length} / {files.length}</span>
            </div>
          </section>

          <div className="auth-card-grid">
            {filteredFiles.map((file) => {
              const canUseFileActions = !file.runtime_only && file.source !== "memory";
              const note = authNote(file);
              const prefix = authPrefix(file);
              const priority = authPriority(file);
              return (
                <article className={`auth-file-card ${statusKind(file)}`} key={file.id ?? file.name}>
                  <div className="auth-card-top">
                    <ProviderBadge file={file} />
                    <span className={fileStatusClass(file)}>{statusLabel(file)}</span>
                  </div>

                  <div className="auth-card-title">
                    <strong className="mono">{file.name}</strong>
                  </div>

                  <div className="auth-account-line">
                    <span>{accountLabel(file)}</span>
                    {file.label && <span className="tag">{file.label}</span>}
                    {prefix && <span className="tag">prefix: {prefix}</span>}
                    {priority !== 0 && <span className="tag">P{priority}</span>}
                  </div>

                  {file.status_message && <div className="auth-card-message">{file.status_message}</div>}
                  {!file.status_message && note && <div className="auth-card-message">{note}</div>}

                  <div className="auth-card-meta">
                    <div>
                      <span>套餐</span>
                      <strong>{planLabel(file)}</strong>
                    </div>
                    <div>
                      <span>大小</span>
                      <strong>{formatBytes(file.size)}</strong>
                    </div>
                    <div>
                      <span>最后刷新</span>
                      <strong>{formatDate(file.last_refresh ?? file.updated_at ?? file.modtime)}</strong>
                    </div>
                  </div>

                  <div className="auth-card-actions">
                    <button
                      className="button subtle"
                      disabled={!canUseFileActions}
                      type="button"
                      onClick={() => openEditFields(file)}
                    >
                      <Icon name="edit" size={16} />
                      编辑
                    </button>
                    <button
                      className={file.disabled || file.status === "disabled" ? "button" : "button subtle"}
                      type="button"
                      onClick={() => toggleDisabled(file)}
                    >
                      <Icon name="shield" size={16} />
                      {file.disabled || file.status === "disabled" ? "启用" : "禁用"}
                    </button>
                    <button
                      className="button subtle"
                      disabled={!canUseFileActions}
                      type="button"
                      onClick={() => downloadFile(file)}
                    >
                      <Icon name="download" size={16} />
                      下载
                    </button>
                    <button
                      className="button"
                      disabled={!canUseFileActions}
                      type="button"
                      onClick={() => deleteFile(file)}
                    >
                      <Icon name="trash" size={16} />
                      删除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

      {filteredFiles.length === 0 && (
            <div className="empty-state">没有匹配的认证文件</div>
          )}
        </div>

        <aside className="panel auth-vertex-panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="upload" size={16} />
              Vertex 导入
            </h3>
          </div>
          <div className="panel-body form-stack">
            <div className="field">
              <label htmlFor="vertex-location">Vertex location</label>
              <input
                id="vertex-location"
                value={vertexLocation}
                onChange={(event) => setVertexLocation(event.target.value)}
              />
            </div>
            <label className="dropzone auth-vertex-dropzone" htmlFor="vertex-import">
              <span>
                <Icon name="upload" size={18} />
              </span>
              <span>选择 Vertex 服务账号 JSON</span>
            </label>
            <input id="vertex-import" hidden type="file" accept="application/json,.json" onChange={importVertex} />
            <div className="empty-state">
              导入后会生成对应的认证文件，并出现在左侧卡片列表中。
            </div>
          </div>
        </aside>
      </div>

      {editingFile && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel provider-modal" role="dialog" aria-modal="true" aria-labelledby="auth-fields-modal-title">
            <div className="modal-header">
              <div>
                <h3 id="auth-fields-modal-title">编辑认证文件字段</h3>
                <p className="panel-subtitle">
                  <span className="mono">{editingFile.name}</span>
                </p>
              </div>
              <button className="icon-button" title="关闭" type="button" onClick={closeEditFields}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal-body form-stack">
              <div className="field-row">
                <div className="field">
                  <label htmlFor="auth-edit-prefix">prefix</label>
                  <input
                    id="auth-edit-prefix"
                    value={editForm.prefix}
                    onChange={(event) => setEditForm({ ...editForm, prefix: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-edit-priority">priority</label>
                  <input
                    id="auth-edit-priority"
                    type="number"
                    value={editForm.priority}
                    onChange={(event) => setEditForm({ ...editForm, priority: event.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="auth-edit-proxy">proxy_url</label>
                <input
                  id="auth-edit-proxy"
                  placeholder="direct / none / socks5://..."
                  value={editForm.proxyUrl}
                  onChange={(event) => setEditForm({ ...editForm, proxyUrl: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="auth-edit-headers">Headers，每行 Key: Value</label>
                <textarea
                  id="auth-edit-headers"
                  value={editForm.headers}
                  onChange={(event) => setEditForm({ ...editForm, headers: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="auth-edit-note">note</label>
                <textarea
                  id="auth-edit-note"
                  className="compact-textarea"
                  value={editForm.note}
                  onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button className="button subtle" type="button" onClick={closeEditFields}>
                  取消
                </button>
                <button className="button primary" type="button" onClick={saveEditFields}>
                  <Icon name="save" size={16} />
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
