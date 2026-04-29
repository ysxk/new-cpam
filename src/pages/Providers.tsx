import { useEffect, useMemo, useState } from "react";
import {
  managementApi,
  ModelAlias,
  OpenAICompatibilityProvider,
  ProviderApiKeyEntry,
} from "../api/client";
import Icon from "../components/Icon";
import { maskSecret, objectSize, splitLines, uniqueClean } from "../utils/format";

type ProviderKind = "gemini" | "claude" | "codex";
type TabKey = ProviderKind | "openai" | "oauth";

interface ProviderConfig {
  label: string;
  path: string;
  key: string;
  baseUrlRequired: boolean;
}

interface KeyProviderForm {
  apiKey: string;
  baseUrl: string;
  proxyUrl: string;
  headers: string;
  excludedModels: string;
  models: string;
}

interface OpenAIProviderForm {
  name: string;
  baseUrl: string;
  keyEntries: string;
  headers: string;
  models: string;
}

const providerConfigs: Record<ProviderKind, ProviderConfig> = {
  gemini: {
    label: "Gemini",
    path: "/gemini-api-key",
    key: "gemini-api-key",
    baseUrlRequired: false,
  },
  claude: {
    label: "Claude",
    path: "/claude-api-key",
    key: "claude-api-key",
    baseUrlRequired: false,
  },
  codex: {
    label: "Codex",
    path: "/codex-api-key",
    key: "codex-api-key",
    baseUrlRequired: true,
  },
};

const emptyKeyForm: KeyProviderForm = {
  apiKey: "",
  baseUrl: "",
  proxyUrl: "",
  headers: "",
  excludedModels: "",
  models: "",
};

const emptyOpenAIForm: OpenAIProviderForm = {
  name: "",
  baseUrl: "",
  keyEntries: "",
  headers: "",
  models: "",
};

function headersToText(headers: Record<string, string> | undefined): string {
  return Object.entries(headers ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function textToHeaders(value: string): Record<string, string> | undefined {
  const entries = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.includes(":") ? ":" : "=";
      const [key, ...rest] = line.split(separator);
      return [key.trim(), rest.join(separator).trim()] as const;
    })
    .filter(([key, entryValue]) => key && entryValue);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function modelsToText(models: ModelAlias[] | undefined): string {
  return (models ?? [])
    .map((model) => (model.alias ? `${model.name} => ${model.alias}` : model.name))
    .join("\n");
}

function textToModels(value: string): ModelAlias[] | undefined {
  const models = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, alias] = line.split(/=>|\|/).map((item) => item.trim());
      return alias ? { name, alias } : { name };
    })
    .filter((model) => model.name);

  return models.length > 0 ? models : undefined;
}

function formToKeyEntry(form: KeyProviderForm): ProviderApiKeyEntry {
  const item: ProviderApiKeyEntry = {
    "api-key": form.apiKey.trim(),
    "base-url": form.baseUrl.trim(),
    "proxy-url": form.proxyUrl.trim(),
  };
  const headers = textToHeaders(form.headers);
  const excluded = uniqueClean(splitLines(form.excludedModels));
  const models = textToModels(form.models);
  if (headers) {
    item.headers = headers;
  }
  if (excluded.length > 0) {
    item["excluded-models"] = excluded;
  }
  if (models) {
    item.models = models;
  }
  return item;
}

function keyEntryToForm(entry: ProviderApiKeyEntry): KeyProviderForm {
  return {
    apiKey: entry["api-key"] ?? "",
    baseUrl: entry["base-url"] ?? "",
    proxyUrl: entry["proxy-url"] ?? "",
    headers: headersToText(entry.headers),
    excludedModels: (entry["excluded-models"] ?? []).join("\n"),
    models: modelsToText(entry.models),
  };
}

function formToOpenAIProvider(form: OpenAIProviderForm): OpenAICompatibilityProvider {
  const keyEntries = form.keyEntries
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [apiKey, proxyUrl = ""] = line.split("|").map((item) => item.trim());
      return { "api-key": apiKey, "proxy-url": proxyUrl };
    })
    .filter((entry) => entry["api-key"]);

  const item: OpenAICompatibilityProvider = {
    name: form.name.trim(),
    "base-url": form.baseUrl.trim(),
    "api-key-entries": keyEntries,
  };
  const headers = textToHeaders(form.headers);
  const models = textToModels(form.models);
  if (headers) {
    item.headers = headers;
  }
  if (models) {
    item.models = models;
  }
  return item;
}

function openAIProviderToForm(provider: OpenAICompatibilityProvider): OpenAIProviderForm {
  return {
    name: provider.name ?? "",
    baseUrl: provider["base-url"] ?? "",
    keyEntries: (provider["api-key-entries"] ?? [])
      .map((entry) => `${entry["api-key"]}${entry["proxy-url"] ? ` | ${entry["proxy-url"]}` : ""}`)
      .join("\n"),
    headers: headersToText(provider.headers),
    models: modelsToText(provider.models),
  };
}

export default function Providers() {
  const [activeTab, setActiveTab] = useState<TabKey>("gemini");
  const [gemini, setGemini] = useState<ProviderApiKeyEntry[]>([]);
  const [claude, setClaude] = useState<ProviderApiKeyEntry[]>([]);
  const [codex, setCodex] = useState<ProviderApiKeyEntry[]>([]);
  const [openai, setOpenai] = useState<OpenAICompatibilityProvider[]>([]);
  const [oauthExcluded, setOauthExcluded] = useState<Record<string, string[]>>({});
  const [keyForm, setKeyForm] = useState<KeyProviderForm>(emptyKeyForm);
  const [openaiForm, setOpenaiForm] = useState<OpenAIProviderForm>(emptyOpenAIForm);
  const [oauthProvider, setOauthProvider] = useState("");
  const [oauthModels, setOauthModels] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadProviders() {
    setLoading(true);
    setError("");
    try {
      const [geminiItems, claudeItems, codexItems, openaiItems, excluded] = await Promise.all([
        managementApi.getProviderList<ProviderApiKeyEntry>(
          providerConfigs.gemini.path,
          providerConfigs.gemini.key,
        ),
        managementApi.getProviderList<ProviderApiKeyEntry>(
          providerConfigs.claude.path,
          providerConfigs.claude.key,
        ),
        managementApi.getProviderList<ProviderApiKeyEntry>(
          providerConfigs.codex.path,
          providerConfigs.codex.key,
        ),
        managementApi.getProviderList<OpenAICompatibilityProvider>(
          "/openai-compatibility",
          "openai-compatibility",
        ),
        managementApi.getOAuthExcludedModels(),
      ]);
      setGemini(geminiItems);
      setClaude(claudeItems);
      setCodex(codexItems);
      setOpenai(openaiItems);
      setOauthExcluded(excluded);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载提供商失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProviders();
    const refresh = () => void loadProviders();
    window.addEventListener("cpam-refresh", refresh);
    return () => window.removeEventListener("cpam-refresh", refresh);
  }, []);

  const activeConfig = activeTab === "gemini" || activeTab === "claude" || activeTab === "codex"
    ? providerConfigs[activeTab]
    : providerConfigs.gemini;

  const activeList = useMemo(() => {
    if (activeTab === "claude") {
      return claude;
    }
    if (activeTab === "codex") {
      return codex;
    }
    return gemini;
  }, [activeTab, claude, codex, gemini]);

  function resetEditor() {
    setEditingIndex(null);
    setKeyForm(emptyKeyForm);
    setOpenaiForm(emptyOpenAIForm);
  }

  async function saveKeyProvider() {
    if (activeTab !== "gemini" && activeTab !== "claude" && activeTab !== "codex") {
      return;
    }
    if (!keyForm.apiKey.trim()) {
      setError("API Key 不能为空");
      return;
    }
    if (providerConfigs[activeTab].baseUrlRequired && !keyForm.baseUrl.trim()) {
      setError(`${providerConfigs[activeTab].label} 的 base-url 不能为空`);
      return;
    }

    const item = formToKeyEntry(keyForm);
    const next =
      editingIndex === null
        ? [...activeList, item]
        : activeList.map((entry, index) => (index === editingIndex ? item : entry));
    await managementApi.putProviderList(providerConfigs[activeTab].path, next);
    setMessage("提供商配置已保存");
    resetEditor();
    await loadProviders();
  }

  async function deleteKeyProvider(index: number) {
    if (activeTab !== "gemini" && activeTab !== "claude" && activeTab !== "codex") {
      return;
    }
    if (!window.confirm("删除这一条提供商 Key？")) {
      return;
    }
    const next = activeList.filter((_, itemIndex) => itemIndex !== index);
    await managementApi.putProviderList(providerConfigs[activeTab].path, next);
    setMessage("提供商 Key 已删除");
    await loadProviders();
  }

  async function saveOpenAIProvider() {
    if (!openaiForm.name.trim() || !openaiForm.baseUrl.trim()) {
      setError("OpenAI 兼容提供商需要 name 和 base-url");
      return;
    }
    const item = formToOpenAIProvider(openaiForm);
    const next =
      editingIndex === null
        ? [...openai, item]
        : openai.map((provider, index) => (index === editingIndex ? item : provider));
    await managementApi.putProviderList("/openai-compatibility", next);
    setMessage("OpenAI 兼容提供商已保存");
    resetEditor();
    await loadProviders();
  }

  async function deleteOpenAIProvider(index: number) {
    if (!window.confirm("删除这个 OpenAI 兼容提供商？")) {
      return;
    }
    const next = openai.filter((_, itemIndex) => itemIndex !== index);
    await managementApi.putProviderList("/openai-compatibility", next);
    setMessage("OpenAI 兼容提供商已删除");
    await loadProviders();
  }

  async function saveOauthExcluded() {
    const provider = oauthProvider.trim().toLowerCase();
    if (!provider) {
      setError("Provider 不能为空");
      return;
    }
    const models = uniqueClean(splitLines(oauthModels));
    const next = { ...oauthExcluded };
    if (models.length === 0) {
      delete next[provider];
    } else {
      next[provider] = models;
    }
    await managementApi.putOAuthExcludedModels(next);
    setOauthProvider("");
    setOauthModels("");
    setMessage("OAuth 排除模型已保存");
    await loadProviders();
  }

  async function deleteOauthProvider(provider: string) {
    await managementApi.deleteOAuthExcludedProvider(provider);
    setMessage("OAuth 排除模型已删除");
    await loadProviders();
  }

  const totalProviderKeys =
    gemini.length +
    claude.length +
    codex.length +
    openai.reduce((total, provider) => total + (provider["api-key-entries"]?.length ?? 0), 0);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>提供商配置</h2>
          <p>管理 Gemini、Claude、Codex 和 OpenAI 兼容提供商，变更会写回 YAML 并热重载。</p>
        </div>
        <div className="actions">
          <span className="badge ok">{totalProviderKeys} 个 Key</span>
          <button className="button" disabled={loading} type="button" onClick={loadProviders}>
            <Icon name="refresh" size={16} />
            刷新
          </button>
        </div>
      </div>

      {error && <div className="error-state">{error}</div>}
      {message && <div className="empty-state">{message}</div>}

      <div className="segmented">
        <button className={activeTab === "gemini" ? "active" : ""} type="button" onClick={() => setActiveTab("gemini")}>
          Gemini
        </button>
        <button className={activeTab === "claude" ? "active" : ""} type="button" onClick={() => setActiveTab("claude")}>
          Claude
        </button>
        <button className={activeTab === "codex" ? "active" : ""} type="button" onClick={() => setActiveTab("codex")}>
          Codex
        </button>
        <button className={activeTab === "openai" ? "active" : ""} type="button" onClick={() => setActiveTab("openai")}>
          OpenAI 兼容
        </button>
        <button className={activeTab === "oauth" ? "active" : ""} type="button" onClick={() => setActiveTab("oauth")}>
          OAuth 排除
        </button>
      </div>

      {activeTab !== "openai" && activeTab !== "oauth" && (
        <div className="grid sidebar-layout">
          <section className="panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <Icon name="layers" size={16} />
                {activeConfig.label} Key
              </h3>
              <span className="badge">{activeList.length} 条</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>base-url</th>
                    <th>proxy-url</th>
                    <th>Headers</th>
                    <th>排除模型</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {activeList.map((entry, index) => (
                    <tr key={`${entry["api-key"]}-${index}`}>
                      <td className="mono">{maskSecret(entry["api-key"])}</td>
                      <td className="mono">{entry["base-url"] || "-"}</td>
                      <td className="mono">{entry["proxy-url"] || "-"}</td>
                      <td>{objectSize(entry.headers)}</td>
                      <td>{(entry["excluded-models"] ?? []).length}</td>
                      <td>
                        <div className="actions">
                          <button
                            className="icon-button"
                            title="编辑"
                            type="button"
                            onClick={() => {
                              setEditingIndex(index);
                              setKeyForm(keyEntryToForm(entry));
                            }}
                          >
                            <Icon name="edit" />
                          </button>
                          <button className="icon-button" title="删除" type="button" onClick={() => deleteKeyProvider(index)}>
                            <Icon name="trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <Icon name={editingIndex === null ? "plus" : "edit"} size={16} />
                {editingIndex === null ? "新增 Key" : "编辑 Key"}
              </h3>
            </div>
            <div className="panel-body form-stack">
              <div className="field">
                <label htmlFor="provider-api-key">api-key</label>
                <input
                  id="provider-api-key"
                  value={keyForm.apiKey}
                  onChange={(event) => setKeyForm({ ...keyForm, apiKey: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="provider-base-url">base-url</label>
                <input
                  id="provider-base-url"
                  placeholder={activeConfig.baseUrlRequired ? "必填" : "可选"}
                  value={keyForm.baseUrl}
                  onChange={(event) => setKeyForm({ ...keyForm, baseUrl: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="provider-proxy-url">proxy-url</label>
                <input
                  id="provider-proxy-url"
                  value={keyForm.proxyUrl}
                  onChange={(event) => setKeyForm({ ...keyForm, proxyUrl: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="provider-headers">Headers，每行 Key: Value</label>
                <textarea
                  id="provider-headers"
                  value={keyForm.headers}
                  onChange={(event) => setKeyForm({ ...keyForm, headers: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="provider-models">模型别名，每行 name =&gt; alias</label>
                <textarea
                  id="provider-models"
                  value={keyForm.models}
                  onChange={(event) => setKeyForm({ ...keyForm, models: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="provider-excluded-models">排除模型，每行一个或逗号分隔</label>
                <textarea
                  id="provider-excluded-models"
                  value={keyForm.excludedModels}
                  onChange={(event) => setKeyForm({ ...keyForm, excludedModels: event.target.value })}
                />
              </div>
              <div className="actions">
                <button className="button subtle" type="button" onClick={resetEditor}>
                  取消
                </button>
                <button className="button primary" type="button" onClick={saveKeyProvider}>
                  <Icon name="save" size={16} />
                  保存
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === "openai" && (
        <div className="grid sidebar-layout">
          <section className="panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <Icon name="layers" size={16} />
                OpenAI 兼容提供商
              </h3>
              <span className="badge">{openai.length} 个</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>base-url</th>
                    <th>Keys</th>
                    <th>模型</th>
                    <th>Headers</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {openai.map((provider, index) => (
                    <tr key={`${provider.name}-${index}`}>
                      <td>{provider.name}</td>
                      <td className="mono">{provider["base-url"]}</td>
                      <td>{provider["api-key-entries"]?.length ?? 0}</td>
                      <td>{provider.models?.length ?? 0}</td>
                      <td>{objectSize(provider.headers)}</td>
                      <td>
                        <div className="actions">
                          <button
                            className="icon-button"
                            title="编辑"
                            type="button"
                            onClick={() => {
                              setEditingIndex(index);
                              setOpenaiForm(openAIProviderToForm(provider));
                            }}
                          >
                            <Icon name="edit" />
                          </button>
                          <button className="icon-button" title="删除" type="button" onClick={() => deleteOpenAIProvider(index)}>
                            <Icon name="trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <Icon name={editingIndex === null ? "plus" : "edit"} size={16} />
                {editingIndex === null ? "新增提供商" : "编辑提供商"}
              </h3>
            </div>
            <div className="panel-body form-stack">
              <div className="field-row">
                <div className="field">
                  <label htmlFor="openai-name">name</label>
                  <input
                    id="openai-name"
                    value={openaiForm.name}
                    onChange={(event) => setOpenaiForm({ ...openaiForm, name: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="openai-base-url">base-url</label>
                  <input
                    id="openai-base-url"
                    value={openaiForm.baseUrl}
                    onChange={(event) => setOpenaiForm({ ...openaiForm, baseUrl: event.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="openai-key-entries">api-key-entries，每行 api-key | proxy-url</label>
                <textarea
                  id="openai-key-entries"
                  value={openaiForm.keyEntries}
                  onChange={(event) => setOpenaiForm({ ...openaiForm, keyEntries: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="openai-headers">Headers，每行 Key: Value</label>
                <textarea
                  id="openai-headers"
                  value={openaiForm.headers}
                  onChange={(event) => setOpenaiForm({ ...openaiForm, headers: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="openai-models">模型别名，每行 name =&gt; alias</label>
                <textarea
                  id="openai-models"
                  value={openaiForm.models}
                  onChange={(event) => setOpenaiForm({ ...openaiForm, models: event.target.value })}
                />
              </div>
              <div className="actions">
                <button className="button subtle" type="button" onClick={resetEditor}>
                  取消
                </button>
                <button className="button primary" type="button" onClick={saveOpenAIProvider}>
                  <Icon name="save" size={16} />
                  保存
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === "oauth" && (
        <div className="grid sidebar-layout">
          <section className="panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <Icon name="shield" size={16} />
                OAuth 排除模型
              </h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>模型</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(oauthExcluded).map(([provider, models]) => (
                    <tr key={provider}>
                      <td>{provider}</td>
                      <td>
                        {models.map((model) => (
                          <span className="tag" key={model}>
                            {model}
                          </span>
                        ))}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="icon-button"
                            title="编辑"
                            type="button"
                            onClick={() => {
                              setOauthProvider(provider);
                              setOauthModels(models.join("\n"));
                            }}
                          >
                            <Icon name="edit" />
                          </button>
                          <button className="icon-button" title="删除" type="button" onClick={() => deleteOauthProvider(provider)}>
                            <Icon name="trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <Icon name="plus" size={16} />
                编辑排除模型
              </h3>
            </div>
            <div className="panel-body form-stack">
              <div className="field">
                <label htmlFor="oauth-provider">Provider</label>
                <input
                  id="oauth-provider"
                  placeholder="openai / claude / gemini"
                  value={oauthProvider}
                  onChange={(event) => setOauthProvider(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="oauth-models">模型，每行一个或逗号分隔；留空会删除 provider</label>
                <textarea
                  id="oauth-models"
                  value={oauthModels}
                  onChange={(event) => setOauthModels(event.target.value)}
                />
              </div>
              <button className="button primary" type="button" onClick={saveOauthExcluded}>
                <Icon name="save" size={16} />
                保存
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
