import { useEffect, useMemo, useState } from "react";
import { managementApi } from "../api/client";
import Icon from "../components/Icon";
import { formatNumber, objectSize } from "../utils/format";

export default function ConfigPage() {
  const [yaml, setYaml] = useState("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadConfig() {
    setLoading(true);
    setError("");
    try {
      const [yamlText, configJson] = await Promise.all([managementApi.getYaml(), managementApi.getConfig()]);
      setYaml(yamlText);
      setConfig(configJson);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载配置失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
    const refresh = () => void loadConfig();
    window.addEventListener("cpam-refresh", refresh);
    return () => window.removeEventListener("cpam-refresh", refresh);
  }, []);

  const configPreview = useMemo(() => JSON.stringify(config, null, 2), [config]);

  async function saveYaml() {
    setSaving(true);
    setError("");
    try {
      const result = await managementApi.saveYaml(yaml);
      setMessage(`配置已保存${result.changed?.length ? `：${result.changed.join(", ")}` : ""}`);
      setConfig(await managementApi.getConfig());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存配置失败");
    } finally {
      setSaving(false);
    }
  }

  async function copyYaml() {
    await navigator.clipboard.writeText(yaml);
    setMessage("YAML 已复制");
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>YAML 配置</h2>
          <p>直接编辑持久化 YAML；服务端会在保存前加载校验，成功后由文件监控热重载。</p>
        </div>
        <div className="actions">
          <button className="button" disabled={loading} type="button" onClick={loadConfig}>
            <Icon name="refresh" size={16} />
            恢复
          </button>
          <button className="button subtle" type="button" onClick={copyYaml}>
            <Icon name="copy" size={16} />
            复制
          </button>
          <button className="button primary" disabled={saving} type="button" onClick={saveYaml}>
            <Icon name="save" size={16} />
            保存并校验
          </button>
        </div>
      </div>

      {error && <div className="error-state">{error}</div>}
      {message && <div className="empty-state">{message}</div>}

      <div className="grid sidebar-layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">
                <Icon name="code" size={16} />
                config.yaml
              </h3>
              <p className="panel-subtitle">{formatNumber(yaml.split("\n").length)} 行</p>
            </div>
            <span className="badge warn">只读项需在配置文件中设置</span>
          </div>
          <textarea className="code-editor" value={yaml} spellCheck={false} onChange={(event) => setYaml(event.target.value)} />
        </section>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">
                <Icon name="settings" size={16} />
                当前配置快照
              </h3>
              <p className="panel-subtitle">顶层字段 {objectSize(config)} 个</p>
            </div>
          </div>
          <div className="panel-body form-stack">
            <div className="toggle-line">
              <div>
                <strong>allow-remote-management</strong>
                <div className="faint">不能通过管理 API 修改</div>
              </div>
              <span className="badge warn">只读</span>
            </div>
            <div className="toggle-line">
              <div>
                <strong>remote-management-key</strong>
                <div className="faint">明文启动时会被服务端 bcrypt 回写</div>
              </div>
              <span className="badge warn">只读</span>
            </div>
            <textarea className="code-editor" readOnly value={configPreview} />
          </div>
        </aside>
      </div>
    </div>
  );
}
