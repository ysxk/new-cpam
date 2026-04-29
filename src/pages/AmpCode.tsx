import { useEffect, useMemo, useState } from "react";
import { AmpModelMapping, AmpUpstreamApiKeyEntry, managementApi } from "../api/client";
import Icon from "../components/Icon";
import { maskSecret, splitLines, uniqueClean } from "../utils/format";

interface UpstreamRouteDraft {
  upstreamKey: string;
  apiKeys: string;
}

interface ModelMappingDraft {
  from: string;
  to: string;
  regex: boolean;
}

const emptyRoute: UpstreamRouteDraft = {
  upstreamKey: "",
  apiKeys: "",
};

const emptyMapping: ModelMappingDraft = {
  from: "",
  to: "",
  regex: false,
};

function routeToDraft(entry: AmpUpstreamApiKeyEntry): UpstreamRouteDraft {
  return {
    upstreamKey: entry["upstream-api-key"] ?? "",
    apiKeys: (entry["api-keys"] ?? []).join("\n"),
  };
}

function draftToRoutes(items: UpstreamRouteDraft[]): AmpUpstreamApiKeyEntry[] {
  return items
    .map((item) => ({
      "upstream-api-key": item.upstreamKey.trim(),
      "api-keys": uniqueClean(splitLines(item.apiKeys)),
    }))
    .filter((item) => item["upstream-api-key"] && item["api-keys"].length > 0);
}

function mappingToDraft(entry: AmpModelMapping): ModelMappingDraft {
  return {
    from: entry.from ?? "",
    to: entry.to ?? "",
    regex: Boolean(entry.regex),
  };
}

function draftToMappings(items: ModelMappingDraft[]): AmpModelMapping[] {
  return items
    .map((item) => ({
      from: item.from.trim(),
      to: item.to.trim(),
      regex: item.regex || undefined,
    }))
    .filter((item) => item.from && item.to);
}

export default function AmpCode() {
  const [upstreamUrl, setUpstreamUrl] = useState("");
  const [upstreamApiKey, setUpstreamApiKey] = useState("");
  const [restrictManagement, setRestrictManagement] = useState(false);
  const [forceModelMappings, setForceModelMappings] = useState(false);
  const [routes, setRoutes] = useState<UpstreamRouteDraft[]>([]);
  const [mappings, setMappings] = useState<ModelMappingDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAmpCode() {
    setLoading(true);
    setError("");
    try {
      const config = await managementApi.getAmpCode();
      setUpstreamUrl(config["upstream-url"] ?? "");
      setUpstreamApiKey(config["upstream-api-key"] ?? "");
      setRestrictManagement(Boolean(config["restrict-management-to-localhost"]));
      setForceModelMappings(Boolean(config["force-model-mappings"]));
      setRoutes((config["upstream-api-keys"] ?? []).map(routeToDraft));
      setMappings((config["model-mappings"] ?? []).map(mappingToDraft));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载 AmpCode 配置失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAmpCode();
    const refresh = () => void loadAmpCode();
    window.addEventListener("cpam-refresh", refresh);
    return () => window.removeEventListener("cpam-refresh", refresh);
  }, []);

  const normalizedRoutes = useMemo(() => draftToRoutes(routes), [routes]);
  const normalizedMappings = useMemo(() => draftToMappings(mappings), [mappings]);

  function updateRoute(index: number, patch: Partial<UpstreamRouteDraft>) {
    setRoutes((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateMapping(index: number, patch: Partial<ModelMappingDraft>) {
    setMappings((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  async function saveAmpCode() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await Promise.all([
        upstreamUrl.trim()
          ? managementApi.putAmpUpstreamUrl(upstreamUrl.trim())
          : managementApi.deleteAmpUpstreamUrl(),
        upstreamApiKey.trim()
          ? managementApi.putAmpUpstreamApiKey(upstreamApiKey.trim())
          : managementApi.deleteAmpUpstreamApiKey(),
        managementApi.putAmpRestrictManagement(restrictManagement),
        managementApi.putAmpForceModelMappings(forceModelMappings),
        managementApi.putAmpUpstreamApiKeys(normalizedRoutes),
        managementApi.putAmpModelMappings(normalizedMappings),
      ]);
      setMessage("AmpCode 配置已保存");
      await loadAmpCode();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存 AmpCode 配置失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>AmpCode</h2>
          <p>管理 Amp CLI 上游控制面、官方 Key 路由、模型映射和管理路由限制。</p>
        </div>
        <div className="actions">
          <button className="button" disabled={loading} type="button" onClick={loadAmpCode}>
            <Icon name="refresh" size={16} />
            刷新
          </button>
          <button className="button primary" disabled={saving} type="button" onClick={saveAmpCode}>
            <Icon name="save" size={16} />
            保存
          </button>
        </div>
      </div>

      {error && <div className="error-state">{error}</div>}
      {message && <div className="empty-state">{message}</div>}

      <div className="grid four">
        <div className="stat-card">
          <div className="stat-label">上游地址</div>
          <div className="stat-value">{upstreamUrl.trim() ? "ON" : "默认"}</div>
          <div className="stat-trend mono">{upstreamUrl.trim() || "使用后端默认"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">官方 Key</div>
          <div className="stat-value">{upstreamApiKey.trim() ? "ON" : "OFF"}</div>
          <div className="stat-trend mono">{maskSecret(upstreamApiKey)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">多上游路由</div>
          <div className="stat-value">{normalizedRoutes.length}</div>
          <div className="stat-trend">按客户端 Key 选择 Amp 上游 Key</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">模型映射</div>
          <div className="stat-value">{normalizedMappings.length}</div>
          <div className="stat-trend">Amp 请求模型重写</div>
        </div>
      </div>

      <div className="grid two">
        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="settings" size={16} />
              上游控制面
            </h3>
          </div>
          <div className="panel-body form-stack">
            <div className="field">
              <label htmlFor="amp-upstream-url">upstream-url</label>
              <input
                id="amp-upstream-url"
                placeholder="https://ampcode.com"
                value={upstreamUrl}
                onChange={(event) => setUpstreamUrl(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="amp-upstream-api-key">upstream-api-key</label>
              <input
                id="amp-upstream-api-key"
                placeholder="留空会清除官方 Key 覆盖"
                type="password"
                value={upstreamApiKey}
                onChange={(event) => setUpstreamApiKey(event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="shield" size={16} />
              行为开关
            </h3>
          </div>
          <div className="panel-body form-stack">
            <div className="toggle-line">
              <div>
                <strong>限制 Amp 管理路由为本机</strong>
                <div className="faint">ampcode/restrict-management-to-localhost</div>
              </div>
              <button
                className={restrictManagement ? "switch on" : "switch"}
                type="button"
                onClick={() => setRestrictManagement((value) => !value)}
              />
            </div>
            <div className="toggle-line">
              <div>
                <strong>强制应用模型映射</strong>
                <div className="faint">ampcode/force-model-mappings</div>
              </div>
              <button
                className={forceModelMappings ? "switch on" : "switch"}
                type="button"
                onClick={() => setForceModelMappings((value) => !value)}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Icon name="key" size={16} />
            多上游 API Key 路由
          </h3>
          <button className="button primary" type="button" onClick={() => setRoutes((items) => [...items, emptyRoute])}>
            <Icon name="plus" size={16} />
            新增路由
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>上游 API Key</th>
                <th>客户端 API Keys</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route, index) => (
                <tr key={`route-${index}`}>
                  <td>
                    <input
                      value={route.upstreamKey}
                      onChange={(event) => updateRoute(index, { upstreamKey: event.target.value })}
                    />
                  </td>
                  <td>
                    <textarea
                      className="compact-textarea"
                      placeholder="每行一个客户端 API Key，也可用逗号分隔"
                      value={route.apiKeys}
                      onChange={(event) => updateRoute(index, { apiKeys: event.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      title="删除"
                      type="button"
                      onClick={() => setRoutes((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              ))}
              {routes.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state">暂无多上游路由</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Icon name="layers" size={16} />
            模型映射
          </h3>
          <button className="button primary" type="button" onClick={() => setMappings((items) => [...items, emptyMapping])}>
            <Icon name="plus" size={16} />
            新增映射
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>from</th>
                <th>to</th>
                <th>正则</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping, index) => (
                <tr key={`mapping-${index}`}>
                  <td>
                    <input
                      value={mapping.from}
                      onChange={(event) => updateMapping(index, { from: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={mapping.to}
                      onChange={(event) => updateMapping(index, { to: event.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      className={mapping.regex ? "switch on" : "switch"}
                      type="button"
                      onClick={() => updateMapping(index, { regex: !mapping.regex })}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      title="删除"
                      type="button"
                      onClick={() => setMappings((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              ))}
              {mappings.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">暂无模型映射</div>
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
