import { useEffect, useMemo, useState } from "react";
import {
  managementApi,
  ModelAlias,
  OpenAICompatibilityProvider,
  ProviderApiKeyEntry,
} from "../api/client";
import Icon from "../components/Icon";
import { maskSecret, objectSize, splitLines, uniqueClean } from "../utils/format";

type ProviderKind = "gemini" | "claude" | "codex" | "vertex";
type TabKey = ProviderKind | "openai";

interface ProviderConfig {
  label: string;
  path: string;
  key: string;
  baseUrlRequired: boolean;
}

interface KeyProviderForm {
  apiKey: string;
  prefix: string;
  priority: string;
  baseUrl: string;
  proxyUrl: string;
  headers: string;
  excludedModels: string;
  models: string;
  websockets: boolean;
}

interface OpenAIProviderForm {
  name: string;
  disabled: boolean;
  prefix: string;
  priority: string;
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
  vertex: {
    label: "Vertex",
    path: "/vertex-api-key",
    key: "vertex-api-key",
    baseUrlRequired: false,
  },
};

const emptyKeyForm: KeyProviderForm = {
  apiKey: "",
  prefix: "",
  priority: "0",
  baseUrl: "",
  proxyUrl: "",
  headers: "",
  excludedModels: "",
  models: "",
  websockets: false,
};

const emptyOpenAIForm: OpenAIProviderForm = {
  name: "",
  disabled: false,
  prefix: "",
  priority: "0",
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
  };
  if (form.prefix.trim()) {
    item.prefix = form.prefix.trim();
  }
  const priority = Number(form.priority);
  if (Number.isFinite(priority) && priority !== 0) {
    item.priority = priority;
  }
  if (form.baseUrl.trim()) {
    item["base-url"] = form.baseUrl.trim();
  }
  if (form.proxyUrl.trim()) {
    item["proxy-url"] = form.proxyUrl.trim();
  }
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
  if (form.websockets) {
    item.websockets = true;
  }
  return item;
}

function keyEntryToForm(entry: ProviderApiKeyEntry): KeyProviderForm {
  return {
    apiKey: entry["api-key"] ?? "",
    prefix: entry.prefix ?? "",
    priority: String(entry.priority ?? 0),
    baseUrl: entry["base-url"] ?? "",
    proxyUrl: entry["proxy-url"] ?? "",
    headers: headersToText(entry.headers),
    excludedModels: (entry["excluded-models"] ?? []).join("\n"),
    models: modelsToText(entry.models),
    websockets: Boolean(entry.websockets),
  };
}

function formToOpenAIProvider(form: OpenAIProviderForm): OpenAICompatibilityProvider {
  const keyEntries = form.keyEntries
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [apiKey, proxyUrl = ""] = line.split("|").map((item) => item.trim());
      return proxyUrl ? { "api-key": apiKey, "proxy-url": proxyUrl } : { "api-key": apiKey };
    })
    .filter((entry) => entry["api-key"]);

  const item: OpenAICompatibilityProvider = {
    name: form.name.trim(),
    "base-url": form.baseUrl.trim(),
    "api-key-entries": keyEntries,
  };
  if (form.disabled) {
    item.disabled = true;
  }
  if (form.prefix.trim()) {
    item.prefix = form.prefix.trim();
  }
  const priority = Number(form.priority);
  if (Number.isFinite(priority) && priority !== 0) {
    item.priority = priority;
  }
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
    disabled: Boolean(provider.disabled),
    prefix: provider.prefix ?? "",
    priority: String(provider.priority ?? 0),
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
  const [vertex, setVertex] = useState<ProviderApiKeyEntry[]>([]);
  const [openai, setOpenai] = useState<OpenAICompatibilityProvider[]>([]);
  const [keyForm, setKeyForm] = useState<KeyProviderForm>(emptyKeyForm);
  const [openaiForm, setOpenaiForm] = useState<OpenAIProviderForm>(emptyOpenAIForm);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [openaiModalOpen, setOpenaiModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadProviders() {
    setLoading(true);
    setError("");
    try {
      const [geminiItems, claudeItems, codexItems, vertexItems, openaiItems] = await Promise.all([
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
        managementApi.getProviderList<ProviderApiKeyEntry>(
          providerConfigs.vertex.path,
          providerConfigs.vertex.key,
        ),
        managementApi.getProviderList<OpenAICompatibilityProvider>(
          "/openai-compatibility",
          "openai-compatibility",
        ),
      ]);
      setGemini(geminiItems);
      setClaude(claudeItems);
      setCodex(codexItems);
      setVertex(vertexItems);
      setOpenai(openaiItems);
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

  const activeConfig = activeTab === "gemini" || activeTab === "claude" || activeTab === "codex" || activeTab === "vertex"
    ? providerConfigs[activeTab]
    : providerConfigs.gemini;

  const activeList = useMemo(() => {
    if (activeTab === "claude") {
      return claude;
    }
    if (activeTab === "codex") {
      return codex;
    }
    if (activeTab === "vertex") {
      return vertex;
    }
    return gemini;
  }, [activeTab, claude, codex, gemini, vertex]);

  function resetEditor() {
    setEditingIndex(null);
    setKeyForm(emptyKeyForm);
    setOpenaiForm(emptyOpenAIForm);
  }

  function switchTab(tab: TabKey) {
    setActiveTab(tab);
    setKeyModalOpen(false);
    setOpenaiModalOpen(false);
    resetEditor();
    setError("");
  }

  function openKeyEditor(index: number | null = null) {
    setEditingIndex(index);
    setKeyForm(index === null ? emptyKeyForm : keyEntryToForm(activeList[index]));
    setError("");
    setKeyModalOpen(true);
  }

  function closeKeyEditor() {
    setKeyModalOpen(false);
    resetEditor();
  }

  function openOpenAIEditor(index: number | null = null) {
    setEditingIndex(index);
    setOpenaiForm(index === null ? emptyOpenAIForm : openAIProviderToForm(openai[index]));
    setError("");
    setOpenaiModalOpen(true);
  }

  function closeOpenAIEditor() {
    setOpenaiModalOpen(false);
    resetEditor();
  }

  async function saveKeyProvider() {
    if (activeTab !== "gemini" && activeTab !== "claude" && activeTab !== "codex" && activeTab !== "vertex") {
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
    setMessage("提供商 Key 已保存");
    closeKeyEditor();
    await loadProviders();
  }

  async function deleteKeyProvider(index: number) {
    if (activeTab !== "gemini" && activeTab !== "claude" && activeTab !== "codex" && activeTab !== "vertex") {
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
    closeOpenAIEditor();
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

  const totalProviderKeys =
    gemini.length +
    claude.length +
    codex.length +
    vertex.length +
    openai.reduce((total, provider) => total + (provider["api-key-entries"]?.length ?? 0), 0);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>提供商配置</h2>
          <p>管理 Gemini、Claude、Codex 和 OpenAI 兼容提供商，Key 配置通过弹窗编辑。</p>
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
        <button className={activeTab === "gemini" ? "active" : ""} type="button" onClick={() => switchTab("gemini")}>
          Gemini
        </button>
        <button className={activeTab === "claude" ? "active" : ""} type="button" onClick={() => switchTab("claude")}>
          Claude
        </button>
        <button className={activeTab === "codex" ? "active" : ""} type="button" onClick={() => switchTab("codex")}>
          Codex
        </button>
        <button className={activeTab === "vertex" ? "active" : ""} type="button" onClick={() => switchTab("vertex")}>
          Vertex
        </button>
        <button className={activeTab === "openai" ? "active" : ""} type="button" onClick={() => switchTab("openai")}>
          OpenAI 兼容
        </button>
      </div>

      {activeTab !== "openai" && (
        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="layers" size={16} />
              {activeConfig.label} Key
            </h3>
            <div className="actions">
              <span className="badge">{activeList.length} 条</span>
              <button className="button primary" type="button" onClick={() => openKeyEditor()}>
                <Icon name="plus" size={16} />
                新增 Key
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>prefix</th>
                  <th>priority</th>
                  <th>base-url</th>
                  <th>proxy-url</th>
                  <th>Headers</th>
                  <th>模型</th>
                  <th>排除模型</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {activeList.map((entry, index) => (
                  <tr key={`${entry["api-key"]}-${index}`}>
                    <td className="mono">{maskSecret(entry["api-key"])}</td>
                    <td className="mono">{entry.prefix || "-"}</td>
                    <td>{entry.priority ?? 0}</td>
                    <td className="mono">{entry["base-url"] || "-"}</td>
                    <td className="mono">{entry["proxy-url"] || "-"}</td>
                    <td>{objectSize(entry.headers)}</td>
                    <td>{entry.models?.length ?? 0}</td>
                    <td>{(entry["excluded-models"] ?? []).length}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="icon-button"
                          title="编辑"
                          type="button"
                          onClick={() => openKeyEditor(index)}
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
                {activeList.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">暂无 {activeConfig.label} Key</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "openai" && (
        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="layers" size={16} />
              OpenAI 兼容提供商
            </h3>
            <div className="actions">
              <span className="badge">{openai.length} 个</span>
              <button className="button primary" type="button" onClick={() => openOpenAIEditor()}>
                <Icon name="plus" size={16} />
                新增提供商
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>状态</th>
                  <th>prefix</th>
                  <th>priority</th>
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
                    <td>
                      <span className={provider.disabled ? "badge danger" : "badge ok"}>
                        {provider.disabled ? "禁用" : "启用"}
                      </span>
                    </td>
                    <td className="mono">{provider.prefix || "-"}</td>
                    <td>{provider.priority ?? 0}</td>
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
                          onClick={() => openOpenAIEditor(index)}
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
                {openai.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">暂无 OpenAI 兼容提供商</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {keyModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel provider-modal" role="dialog" aria-modal="true" aria-labelledby="provider-key-modal-title">
            <div className="modal-header">
              <div>
                <h3 id="provider-key-modal-title">
                  {editingIndex === null ? "新增" : "编辑"} {activeConfig.label} Key
                </h3>
                <p className="panel-subtitle">保存后立即写回当前提供商配置。</p>
              </div>
              <button className="icon-button" title="关闭" type="button" onClick={closeKeyEditor}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal-body form-stack">
              <div className="field">
                <label htmlFor="provider-api-key">api-key</label>
                <input
                  id="provider-api-key"
                  autoFocus
                  value={keyForm.apiKey}
                  onChange={(event) => setKeyForm({ ...keyForm, apiKey: event.target.value })}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="provider-prefix">prefix</label>
                  <input
                    id="provider-prefix"
                    placeholder="可选，形如 teamA"
                    value={keyForm.prefix}
                    onChange={(event) => setKeyForm({ ...keyForm, prefix: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="provider-priority">priority</label>
                  <input
                    id="provider-priority"
                    type="number"
                    value={keyForm.priority}
                    onChange={(event) => setKeyForm({ ...keyForm, priority: event.target.value })}
                  />
                </div>
              </div>
              <div className="field-row">
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
              </div>
              {activeTab === "codex" && (
                <div className="toggle-line">
                  <div>
                    <strong>启用 WebSocket transport</strong>
                    <div className="faint">codex-api-key.websockets</div>
                  </div>
                  <button
                    className={keyForm.websockets ? "switch on" : "switch"}
                    type="button"
                    onClick={() => setKeyForm({ ...keyForm, websockets: !keyForm.websockets })}
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="provider-headers">Headers，每行 Key: Value</label>
                <textarea
                  id="provider-headers"
                  value={keyForm.headers}
                  onChange={(event) => setKeyForm({ ...keyForm, headers: event.target.value })}
                />
              </div>
              <div className="field-row">
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
              </div>
              <div className="modal-actions">
                <button className="button subtle" type="button" onClick={closeKeyEditor}>
                  取消
                </button>
                <button className="button primary" type="button" onClick={saveKeyProvider}>
                  <Icon name="save" size={16} />
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {openaiModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel provider-modal" role="dialog" aria-modal="true" aria-labelledby="openai-provider-modal-title">
            <div className="modal-header">
              <div>
                <h3 id="openai-provider-modal-title">
                  {editingIndex === null ? "新增" : "编辑"} OpenAI 兼容提供商
                </h3>
                <p className="panel-subtitle">每行填写一个 api-key，可用竖线追加 proxy-url。</p>
              </div>
              <button className="icon-button" title="关闭" type="button" onClick={closeOpenAIEditor}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal-body form-stack">
              <div className="field-row">
                <div className="field">
                  <label htmlFor="openai-name">name</label>
                  <input
                    id="openai-name"
                    autoFocus
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
              <div className="field-row">
                <div className="field">
                  <label htmlFor="openai-prefix">prefix</label>
                  <input
                    id="openai-prefix"
                    value={openaiForm.prefix}
                    onChange={(event) => setOpenaiForm({ ...openaiForm, prefix: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="openai-priority">priority</label>
                  <input
                    id="openai-priority"
                    type="number"
                    value={openaiForm.priority}
                    onChange={(event) => setOpenaiForm({ ...openaiForm, priority: event.target.value })}
                  />
                </div>
              </div>
              <div className="toggle-line">
                <div>
                  <strong>禁用这个提供商</strong>
                  <div className="faint">openai-compatibility.disabled</div>
                </div>
                <button
                  className={openaiForm.disabled ? "switch on" : "switch"}
                  type="button"
                  onClick={() => setOpenaiForm({ ...openaiForm, disabled: !openaiForm.disabled })}
                />
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
              <div className="modal-actions">
                <button className="button subtle" type="button" onClick={closeOpenAIEditor}>
                  取消
                </button>
                <button className="button primary" type="button" onClick={saveOpenAIProvider}>
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
