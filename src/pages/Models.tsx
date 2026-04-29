import { useEffect, useMemo, useState } from "react";
import { AuthFile, managementApi, ModelDefinition } from "../api/client";
import Icon from "../components/Icon";
import { formatNumber } from "../utils/format";

const channels = ["gemini-cli", "vertex", "aistudio", "antigravity", "claude", "codex", "kimi"];

function modelId(model: ModelDefinition): string {
  return String(model.id ?? model.name ?? model.display_name ?? "-");
}

function modelLabel(model: ModelDefinition): string {
  return String(model.display_name ?? model.name ?? model.id ?? "-");
}

export default function Models() {
  const [authFiles, setAuthFiles] = useState<AuthFile[]>([]);
  const [selectedAuth, setSelectedAuth] = useState("");
  const [authModels, setAuthModels] = useState<ModelDefinition[]>([]);
  const [channel, setChannel] = useState("gemini-cli");
  const [staticModels, setStaticModels] = useState<ModelDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadAuthFiles() {
    setLoading(true);
    setError("");
    try {
      const files = await managementApi.getAuthFiles();
      setAuthFiles(files);
      setSelectedAuth((current) => current || files[0]?.name || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载认证文件失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAuthFiles();
    const refresh = () => void loadAuthFiles();
    window.addEventListener("cpam-refresh", refresh);
    return () => window.removeEventListener("cpam-refresh", refresh);
  }, []);

  const selectedAuthFile = useMemo(
    () => authFiles.find((file) => file.name === selectedAuth || file.id === selectedAuth),
    [authFiles, selectedAuth],
  );

  async function loadAuthModels() {
    if (!selectedAuth.trim()) {
      setError("请选择认证文件");
      return;
    }
    setLoadingModels(true);
    setError("");
    try {
      setAuthModels(await managementApi.getAuthFileModels(selectedAuth.trim()));
      setMessage("认证文件模型已加载");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载认证文件模型失败");
    } finally {
      setLoadingModels(false);
    }
  }

  async function loadStaticModels() {
    setLoadingModels(true);
    setError("");
    try {
      const result = await managementApi.getModelDefinitions(channel);
      setStaticModels(result.models ?? []);
      setMessage(`${result.channel ?? channel} 模型定义已加载`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载模型定义失败");
    } finally {
      setLoadingModels(false);
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>模型</h2>
          <p>查看认证文件当前可用模型，以及后端内置的静态模型定义。</p>
        </div>
        <button className="button" disabled={loading} type="button" onClick={loadAuthFiles}>
          <Icon name="refresh" size={16} />
          刷新认证文件
        </button>
      </div>

      {error && <div className="error-state">{error}</div>}
      {message && <div className="empty-state">{message}</div>}

      <div className="grid two">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">
                <Icon name="shield" size={16} />
                认证文件模型
              </h3>
              <p className="panel-subtitle">调用 /auth-files/models?name=...</p>
            </div>
            <span className="badge">{formatNumber(authModels.length)} 个</span>
          </div>
          <div className="panel-body form-stack">
            <div className="field">
              <label htmlFor="auth-model-file">认证文件</label>
              <select
                id="auth-model-file"
                value={selectedAuth}
                onChange={(event) => {
                  setSelectedAuth(event.target.value);
                  setAuthModels([]);
                }}
              >
                <option value="">选择认证文件</option>
                {authFiles.map((file) => (
                  <option key={file.id ?? file.name} value={file.name}>
                    {file.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedAuthFile && (
              <div className="empty-state">
                {selectedAuthFile.provider ?? selectedAuthFile.type ?? "unknown"} · {selectedAuthFile.email ?? selectedAuthFile.account ?? selectedAuthFile.label ?? "-"}
              </div>
            )}
            <button className="button primary" disabled={loadingModels || !selectedAuth} type="button" onClick={loadAuthModels}>
              <Icon name="refresh" size={16} />
              查询模型
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>显示名</th>
                  <th>类型</th>
                  <th>Owned by</th>
                </tr>
              </thead>
              <tbody>
                {authModels.map((model, index) => (
                  <tr key={`${modelId(model)}-${index}`}>
                    <td className="mono">{modelId(model)}</td>
                    <td>{modelLabel(model)}</td>
                    <td>{String(model.type ?? "-")}</td>
                    <td>{String(model.owned_by ?? "-")}</td>
                  </tr>
                ))}
                {authModels.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">暂无认证文件模型</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">
                <Icon name="layers" size={16} />
                静态模型定义
              </h3>
              <p className="panel-subtitle">调用 /model-definitions/:channel</p>
            </div>
            <span className="badge">{formatNumber(staticModels.length)} 个</span>
          </div>
          <div className="panel-body form-stack">
            <div className="field">
              <label htmlFor="model-channel">Channel</label>
              <select id="model-channel" value={channel} onChange={(event) => setChannel(event.target.value)}>
                {channels.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <button className="button primary" disabled={loadingModels} type="button" onClick={loadStaticModels}>
              <Icon name="refresh" size={16} />
              查询定义
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>显示名</th>
                  <th>类型</th>
                  <th>Owned by</th>
                </tr>
              </thead>
              <tbody>
                {staticModels.map((model, index) => (
                  <tr key={`${modelId(model)}-${index}`}>
                    <td className="mono">{modelId(model)}</td>
                    <td>{modelLabel(model)}</td>
                    <td>{String(model.type ?? "-")}</td>
                    <td>{String(model.owned_by ?? "-")}</td>
                  </tr>
                ))}
                {staticModels.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">暂无静态模型定义</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
