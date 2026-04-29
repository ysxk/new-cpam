import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { AuthFile, downloadBrowserFile, managementApi } from "../api/client";
import Icon from "../components/Icon";
import { formatBytes, formatDate } from "../utils/format";

type StatusFilter = "all" | "ready" | "warning" | "error";

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

function providerTone(file: AuthFile): string {
  const provider = providerName(file).toLowerCase();
  if (provider.includes("claude") || provider.includes("anthropic")) {
    return "claude";
  }
  if (provider.includes("codex") || provider.includes("openai")) {
    return "codex";
  }
  if (provider.includes("gemini") || provider.includes("vertex")) {
    return "gemini";
  }
  if (provider.includes("kimi")) {
    return "kimi";
  }
  return "default";
}

function providerInitial(file: AuthFile): string {
  return providerName(file).trim().slice(0, 1).toUpperCase() || "A";
}

function accountLabel(file: AuthFile): string {
  return file.email ?? file.account ?? file.label ?? "-";
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

export default function AuthFiles() {
  const [files, setFiles] = useState<AuthFile[]>([]);
  const [vertexLocation, setVertexLocation] = useState("us-central1");
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
              return (
                <article className={`auth-file-card ${statusKind(file)}`} key={file.id ?? file.name}>
                  <div className="auth-card-top">
                    <div className={`auth-provider-avatar ${providerTone(file)}`}>{providerInitial(file)}</div>
                    <div className="auth-card-title">
                      <strong>{providerName(file)}</strong>
                      <span className="mono">{file.name}</span>
                    </div>
                    <span className={fileStatusClass(file)}>{statusLabel(file)}</span>
                  </div>

                  <div className="auth-account-line">
                    <span>{accountLabel(file)}</span>
                    {file.label && <span className="tag">{file.label}</span>}
                  </div>

                  {file.status_message && <div className="auth-card-message">{file.status_message}</div>}

                  <div className="auth-card-meta">
                    <div>
                      <span>来源</span>
                      <strong>{file.source ?? (file.runtime_only ? "memory" : "file")}</strong>
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
    </div>
  );
}
