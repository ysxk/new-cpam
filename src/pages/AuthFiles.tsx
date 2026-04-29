import { ChangeEvent, useEffect, useState } from "react";
import { downloadBrowserFile, managementApi, AuthFile } from "../api/client";
import Icon from "../components/Icon";
import { formatBytes, formatDate } from "../utils/format";

interface AuthFlow {
  provider: "anthropic" | "codex" | "gemini-cli" | "antigravity";
  label: string;
  state: string;
  url: string;
  status: string;
  error?: string;
}

const oauthProviders: Array<AuthFlow["provider"]> = [
  "anthropic",
  "codex",
  "gemini-cli",
  "antigravity",
];

const oauthLabels: Record<AuthFlow["provider"], string> = {
  anthropic: "Claude 登录",
  codex: "Codex 登录",
  "gemini-cli": "Gemini 登录",
  antigravity: "Antigravity 登录",
};

function fileStatusClass(file: AuthFile): string {
  if (file.disabled || file.unavailable || file.status === "error") {
    return "badge danger";
  }
  if (file.runtime_only || file.status === "wait") {
    return "badge warn";
  }
  return "badge ok";
}

export default function AuthFiles() {
  const [files, setFiles] = useState<AuthFile[]>([]);
  const [flows, setFlows] = useState<AuthFlow[]>([]);
  const [geminiProjectId, setGeminiProjectId] = useState("");
  const [vertexLocation, setVertexLocation] = useState("us-central1");
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

  async function startOAuth(provider: AuthFlow["provider"]) {
    setError("");
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
      label: oauthLabels[provider],
      state: response.state,
      url: response.url,
      status: "wait",
    };
    setFlows((items) => [nextFlow, ...items.filter((item) => item.state !== response.state)].slice(0, 6));
    window.open(response.url, "_blank", "noopener,noreferrer");
  }

  async function pollFlow(state: string) {
    const response = await managementApi.pollOAuthStatus(state);
    setFlows((items) =>
      items.map((flow) =>
        flow.state === state
          ? {
              ...flow,
              status: response.status ?? "wait",
              error: response.error,
            }
          : flow,
      ),
    );
    if (response.status === "ok") {
      setMessage("OAuth 登录已完成");
      await loadFiles();
    }
  }

  useEffect(() => {
    const waiting = flows.filter((flow) => flow.status === "wait");
    if (waiting.length === 0) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      waiting.forEach((flow) => {
        void pollFlow(flow.state);
      });
    }, 3500);
    return () => window.clearInterval(timer);
  }, [flows]);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>认证文件</h2>
          <p>管理 auth-dir 下的 JSON token 文件，支持 OAuth 登录轮询和 Vertex 服务账号导入。</p>
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
              <label htmlFor="gemini-project-id">Gemini project_id，可选</label>
              <input
                id="gemini-project-id"
                value={geminiProjectId}
                onChange={(event) => setGeminiProjectId(event.target.value)}
              />
            </div>
            <div className="actions">
              {oauthProviders.map((provider) => (
                <button className="button subtle" key={provider} type="button" onClick={() => startOAuth(provider)}>
                  {oauthLabels[provider]}
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
            OAuth 登录流程
          </h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>提供商</th>
                <th>State</th>
                <th>状态</th>
                <th>授权地址</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((flow) => (
                <tr key={flow.state}>
                  <td>{flow.label}</td>
                  <td className="mono">{flow.state}</td>
                  <td>
                    <span className={flow.status === "ok" ? "badge ok" : flow.status === "error" ? "badge danger" : "badge warn"}>
                      {flow.status}
                    </span>
                    {flow.error && <div className="faint">{flow.error}</div>}
                  </td>
                  <td className="mono">{flow.url}</td>
                  <td>
                    <div className="actions">
                      <button className="icon-button" title="重新打开" type="button" onClick={() => window.open(flow.url, "_blank", "noopener,noreferrer")}>
                        <Icon name="archive" />
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
    </div>
  );
}
