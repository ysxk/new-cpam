import { ChangeEvent, useEffect, useState } from "react";
import { AuthFile, downloadBrowserFile, managementApi, OAuthProvider } from "../api/client";
import Icon from "../components/Icon";
import { formatBytes, formatDate } from "../utils/format";

interface AuthFlow {
  provider: OAuthProvider;
  providerKey: string;
  label: string;
  state: string;
  url: string;
  status: string;
  error?: string;
  callbackUrl?: string;
  callbackSubmitted?: boolean;
}

const oauthProviders: Array<{
  provider: OAuthProvider;
  providerKey: string;
  label: string;
}> = [
  { provider: "anthropic", providerKey: "anthropic", label: "Claude 登录" },
  { provider: "codex", providerKey: "codex", label: "Codex 登录" },
  { provider: "gemini-cli", providerKey: "gemini", label: "Gemini 登录" },
  { provider: "antigravity", providerKey: "antigravity", label: "Antigravity 登录" },
  { provider: "kimi", providerKey: "kimi", label: "Kimi 登录" },
];

function fileStatusClass(file: AuthFile): string {
  if (file.disabled || file.unavailable || file.status === "error") {
    return "badge danger";
  }
  if (file.runtime_only || file.status === "wait") {
    return "badge warn";
  }
  return "badge ok";
}

function flowStatusClass(status: string): string {
  if (status === "ok") {
    return "badge ok";
  }
  if (status === "error") {
    return "badge danger";
  }
  return "badge warn";
}

export default function AuthFiles() {
  const [files, setFiles] = useState<AuthFile[]>([]);
  const [flows, setFlows] = useState<AuthFlow[]>([]);
  const [activeFlow, setActiveFlow] = useState<AuthFlow | null>(null);
  const [geminiProjectId, setGeminiProjectId] = useState("");
  const [vertexLocation, setVertexLocation] = useState("us-central1");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [submittingCallback, setSubmittingCallback] = useState(false);
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

  async function startOAuth(provider: OAuthProvider) {
    const meta = oauthProviders.find((item) => item.provider === provider);
    if (!meta) {
      return;
    }

    setError("");
    setMessage("");
    setCallbackUrl("");

    try {
      const response = await managementApi.startOAuth(
        provider,
        provider === "gemini-cli" ? geminiProjectId : "",
      );
      if (!response.url || !response.state) {
        setError("授权地址返回不完整");
        return;
      }

      const nextFlow: AuthFlow = {
        provider,
        providerKey: meta.providerKey,
        label: meta.label,
        state: response.state,
        url: response.url,
        status: "wait",
      };
      setActiveFlow(nextFlow);
      setFlows((items) => [nextFlow, ...items.filter((item) => item.state !== response.state)].slice(0, 8));
      window.open(response.url, "_blank", "noopener,noreferrer");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "发起登录失败");
    }
  }

  function updateFlow(state: string, patch: Partial<AuthFlow>) {
    setFlows((items) =>
      items.map((flow) => (flow.state === state ? { ...flow, ...patch } : flow)),
    );
    setActiveFlow((flow) => (flow?.state === state ? { ...flow, ...patch } : flow));
  }

  async function pollFlow(state: string) {
    try {
      const response = await managementApi.pollOAuthStatus(state);
      updateFlow(state, {
        status: response.status ?? "wait",
        error: response.error,
      });
      if (response.status === "ok") {
        setMessage("OAuth 登录已完成");
        await loadFiles();
      }
      if (response.status === "error") {
        setError(response.error ?? "OAuth 登录失败");
      }
    } catch {
      // Polling is intentionally tolerant; users can still submit callback URL manually.
    }
  }

  async function submitCallback() {
    if (!activeFlow || !callbackUrl.trim()) {
      return;
    }

    setSubmittingCallback(true);
    setError("");
    try {
      await managementApi.submitOAuthCallback(
        activeFlow.providerKey,
        activeFlow.state,
        callbackUrl.trim(),
      );
      updateFlow(activeFlow.state, {
        callbackUrl: callbackUrl.trim(),
        callbackSubmitted: true,
        status: "wait",
      });
      setMessage("回调 URL 已提交，正在等待后端保存认证文件");
      await pollFlow(activeFlow.state);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交回调 URL 失败");
    } finally {
      setSubmittingCallback(false);
    }
  }

  async function copyAuthUrl() {
    if (!activeFlow?.url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(activeFlow.url);
      setMessage("授权地址已复制");
    } catch {
      setError("复制失败");
    }
  }

  useEffect(() => {
    const waitingStates = Array.from(
      new Set(
        [activeFlow, ...flows]
          .filter((flow): flow is AuthFlow => flow !== null && flow.status === "wait")
          .map((flow) => flow.state),
      ),
    );
    if (waitingStates.length === 0) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      waitingStates.forEach((state) => {
        void pollFlow(state);
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeFlow, flows]);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>认证文件</h2>
          <p>管理 auth-dir 下的 JSON token 文件，支持 OAuth 登录、回调提交和 Vertex 导入。</p>
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

      <div className="grid sidebar-layout">
        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="file" size={16} />
              文件列表
            </h3>
            <span className="badge">{files.length} 个</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>提供商</th>
                  <th>邮箱 / 账号</th>
                  <th>状态</th>
                  <th>来源</th>
                  <th>大小</th>
                  <th>最后刷新</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id ?? file.name}>
                    <td>
                      <div className="mono">{file.name}</div>
                      {file.label && <div className="faint">{file.label}</div>}
                    </td>
                    <td>{file.provider ?? file.type ?? "-"}</td>
                    <td>{file.email ?? file.account ?? "-"}</td>
                    <td>
                      <span className={fileStatusClass(file)}>
                        {file.status ?? (file.disabled ? "disabled" : "ready")}
                      </span>
                      {file.status_message && <div className="faint">{file.status_message}</div>}
                    </td>
                    <td>{file.source ?? (file.runtime_only ? "memory" : "file")}</td>
                    <td>{formatBytes(file.size)}</td>
                    <td>{formatDate(file.last_refresh ?? file.updated_at ?? file.modtime)}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="icon-button"
                          disabled={file.runtime_only || file.source === "memory"}
                          title="下载"
                          type="button"
                          onClick={() => downloadFile(file)}
                        >
                          <Icon name="download" />
                        </button>
                        <button
                          className="icon-button"
                          disabled={file.runtime_only || file.source === "memory"}
                          title="删除"
                          type="button"
                          onClick={() => deleteFile(file)}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {files.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">暂无认证文件</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="shield" size={16} />
              登录与导入
            </h3>
          </div>
          <div className="panel-body form-stack">
            <div className="field">
              <label htmlFor="gemini-project-id">Gemini project_id</label>
              <input
                id="gemini-project-id"
                placeholder="留空自动选择，ALL 导入全部，GOOGLE_ONE 自动发现"
                value={geminiProjectId}
                onChange={(event) => setGeminiProjectId(event.target.value)}
              />
            </div>
            <div className="auth-provider-grid">
              {oauthProviders.map((item) => (
                <button className="button subtle" key={item.provider} type="button" onClick={() => startOAuth(item.provider)}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="field">
              <label htmlFor="vertex-location">Vertex location</label>
              <input
                id="vertex-location"
                value={vertexLocation}
                onChange={(event) => setVertexLocation(event.target.value)}
              />
            </div>
            <label className="dropzone" htmlFor="vertex-import">
              <span>
                <Icon name="upload" size={18} />
              </span>
              <span>选择 Vertex 服务账号 JSON</span>
            </label>
            <input id="vertex-import" hidden type="file" accept="application/json,.json" onChange={importVertex} />
          </div>
        </aside>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Icon name="activity" size={16} />
            最近 OAuth 流程
          </h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>提供商</th>
                <th>State</th>
                <th>状态</th>
                <th>回调</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((flow) => (
                <tr key={flow.state}>
                  <td>{flow.label}</td>
                  <td className="mono">{flow.state}</td>
                  <td>
                    <span className={flowStatusClass(flow.status)}>{flow.status}</span>
                    {flow.error && <div className="faint">{flow.error}</div>}
                  </td>
                  <td>{flow.callbackSubmitted ? "已提交" : "-"}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="icon-button"
                        title="打开弹窗"
                        type="button"
                        onClick={() => {
                          setActiveFlow(flow);
                          setCallbackUrl(flow.callbackUrl ?? "");
                        }}
                      >
                        <Icon name="edit" />
                      </button>
                      <button className="icon-button" title="轮询" type="button" onClick={() => pollFlow(flow.state)}>
                        <Icon name="refresh" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {flows.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">尚未发起 OAuth 登录</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {activeFlow && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel auth-modal" role="dialog" aria-modal="true" aria-labelledby="oauth-modal-title">
            <div className="modal-header">
              <div>
                <h3 id="oauth-modal-title">{activeFlow.label}</h3>
                <p className="panel-subtitle">State: <span className="mono">{activeFlow.state}</span></p>
              </div>
              <button className="icon-button" title="关闭" type="button" onClick={() => setActiveFlow(null)}>
                <Icon name="x" />
              </button>
            </div>

            <div className="oauth-steps">
              <div className="oauth-step done">
                <span>1</span>
                <strong>授权地址</strong>
              </div>
              <div className={activeFlow.callbackSubmitted ? "oauth-step done" : "oauth-step active"}>
                <span>2</span>
                <strong>回调 URL</strong>
              </div>
              <div className={activeFlow.status === "ok" ? "oauth-step done" : "oauth-step active"}>
                <span>3</span>
                <strong>保存认证</strong>
              </div>
            </div>

            <div className="form-stack">
              <div className="field">
                <label htmlFor="oauth-auth-url">授权地址</label>
                <textarea id="oauth-auth-url" className="compact-textarea mono" readOnly value={activeFlow.url} />
              </div>
              <div className="actions">
                <button className="button" type="button" onClick={() => window.open(activeFlow.url, "_blank", "noopener,noreferrer")}>
                  <Icon name="archive" size={16} />
                  打开授权页
                </button>
                <button className="button subtle" type="button" onClick={copyAuthUrl}>
                  <Icon name="copy" size={16} />
                  复制授权地址
                </button>
                <button className="button subtle" type="button" onClick={() => pollFlow(activeFlow.state)}>
                  <Icon name="refresh" size={16} />
                  检查状态
                </button>
              </div>

              <div className="field">
                <label htmlFor="oauth-callback-url">回调 URL</label>
                <textarea
                  id="oauth-callback-url"
                  className="callback-textarea mono"
                  placeholder="http://localhost:.../callback?code=...&state=..."
                  value={callbackUrl}
                  onChange={(event) => setCallbackUrl(event.target.value)}
                />
              </div>

              <div className="modal-status-row">
                <span className={flowStatusClass(activeFlow.status)}>{activeFlow.status}</span>
                {activeFlow.callbackSubmitted && <span className="badge ok">回调已提交</span>}
                {activeFlow.error && <span className="badge danger">{activeFlow.error}</span>}
              </div>

              <div className="modal-actions">
                <button className="button subtle" type="button" onClick={() => setActiveFlow(null)}>
                  关闭
                </button>
                <button
                  className="button primary"
                  disabled={!callbackUrl.trim() || submittingCallback}
                  type="button"
                  onClick={submitCallback}
                >
                  <Icon name="save" size={16} />
                  提交回调 URL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
