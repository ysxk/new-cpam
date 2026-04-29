import { useEffect, useState } from "react";
import { managementApi, OAuthModelAliasEntry, OAuthProvider } from "../api/client";
import Icon from "../components/Icon";
import { splitLines, uniqueClean } from "../utils/format";

interface AuthFlow {
  provider: OAuthProvider;
  providerKey: string;
  label: string;
  state: string;
  url: string;
  status: string;
  startedAt: string;
  error?: string;
  callbackUrl?: string;
  callbackSubmitted?: boolean;
}

const oauthProviders: Array<{
  provider: OAuthProvider;
  providerKey: string;
  label: string;
  note: string;
}> = [
  { provider: "anthropic", providerKey: "anthropic", label: "Claude", note: "Anthropic OAuth" },
  { provider: "codex", providerKey: "codex", label: "Codex", note: "OpenAI Codex OAuth" },
  { provider: "gemini-cli", providerKey: "gemini", label: "Gemini", note: "Gemini CLI OAuth" },
  { provider: "antigravity", providerKey: "antigravity", label: "Antigravity", note: "Google OAuth" },
  { provider: "kimi", providerKey: "kimi", label: "Kimi", note: "Kimi OAuth" },
];

function flowStatusClass(status: string): string {
  if (status === "ok") {
    return "badge ok";
  }
  if (status === "error") {
    return "badge danger";
  }
  return "badge warn";
}

function needsCallback(flow: AuthFlow | null): boolean {
  return Boolean(flow && flow.provider !== "kimi");
}

function aliasEntriesToText(entries: OAuthModelAliasEntry[]): string {
  return entries
    .map((entry) => `${entry.name} => ${entry.alias}${entry.fork ? " | fork" : ""}`)
    .join("\n");
}

function textToAliasEntries(value: string): OAuthModelAliasEntry[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [mapping, flag = ""] = line.split("|").map((item) => item.trim());
      const [name, alias] = mapping.split(/=>|,/).map((item) => item.trim());
      return {
        name,
        alias,
        fork: /\bfork\b|true|1|yes/i.test(flag) || undefined,
      };
    })
    .filter((entry) => entry.name && entry.alias);
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back for non-HTTPS management pages.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export default function OAuthLogin() {
  const [flows, setFlows] = useState<AuthFlow[]>([]);
  const [activeFlow, setActiveFlow] = useState<AuthFlow | null>(null);
  const [geminiProjectId, setGeminiProjectId] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [submittingCallback, setSubmittingCallback] = useState(false);
  const [oauthExcluded, setOauthExcluded] = useState<Record<string, string[]>>({});
  const [oauthAliases, setOauthAliases] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [oauthProvider, setOauthProvider] = useState("");
  const [oauthModels, setOauthModels] = useState("");
  const [aliasChannel, setAliasChannel] = useState("");
  const [aliasText, setAliasText] = useState("");
  const [excludedModalOpen, setExcludedModalOpen] = useState(false);
  const [aliasModalOpen, setAliasModalOpen] = useState(false);
  const [loadingExcluded, setLoadingExcluded] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadExcludedModels() {
    setLoadingExcluded(true);
    setError("");
    try {
      const [excluded, aliases] = await Promise.all([
        managementApi.getOAuthExcludedModels(),
        managementApi.getOAuthModelAlias(),
      ]);
      setOauthExcluded(excluded);
      setOauthAliases(aliases);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载 OAuth 配置失败");
    } finally {
      setLoadingExcluded(false);
    }
  }

  useEffect(() => {
    void loadExcludedModels();
    const refresh = () => void loadExcludedModels();
    window.addEventListener("cpam-refresh", refresh);
    return () => window.removeEventListener("cpam-refresh", refresh);
  }, []);

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
        startedAt: new Date().toISOString(),
      };
      setActiveFlow(nextFlow);
      setFlows((items) => [nextFlow, ...items.filter((item) => item.state !== response.state)].slice(0, 10));
      setMessage("授权地址已生成，请在弹窗中复制后打开");
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
        setMessage("OAuth 登录已完成，认证文件已由后端保存");
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
    if (await copyText(activeFlow.url)) {
      setMessage("授权地址已复制");
    } else {
      setError("浏览器不允许自动复制，请手动选中授权地址复制");
    }
  }

  function openExcludedEditor(provider = "", models: string[] = []) {
    setOauthProvider(provider);
    setOauthModels(models.join("\n"));
    setExcludedModalOpen(true);
    setError("");
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
    setExcludedModalOpen(false);
    setOauthProvider("");
    setOauthModels("");
    setMessage("OAuth 排除模型已保存");
    await loadExcludedModels();
  }

  async function deleteOauthProvider(provider: string) {
    await managementApi.deleteOAuthExcludedProvider(provider);
    setMessage("OAuth 排除模型已删除");
    await loadExcludedModels();
  }

  function openAliasEditor(channel = "", entries: OAuthModelAliasEntry[] = []) {
    setAliasChannel(channel);
    setAliasText(aliasEntriesToText(entries));
    setAliasModalOpen(true);
    setError("");
  }

  async function saveOauthAlias() {
    const channel = aliasChannel.trim().toLowerCase();
    if (!channel) {
      setError("Channel 不能为空");
      return;
    }
    const entries = textToAliasEntries(aliasText);
    const next = { ...oauthAliases };
    if (entries.length === 0) {
      delete next[channel];
    } else {
      next[channel] = entries;
    }
    await managementApi.putOAuthModelAlias(next);
    setAliasModalOpen(false);
    setAliasChannel("");
    setAliasText("");
    setMessage("OAuth 模型别名已保存");
    await loadExcludedModels();
  }

  async function deleteOauthAliasChannel(channel: string) {
    await managementApi.deleteOAuthModelAliasChannel(channel);
    setMessage("OAuth 模型别名已删除");
    await loadExcludedModels();
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
          <h2>OAuth 登录</h2>
          <p>单独发起 OAuth 授权、提交回调 URL，并管理 OAuth 排除模型。</p>
        </div>
        <button className="button" disabled={loadingExcluded} type="button" onClick={loadExcludedModels}>
          <Icon name="refresh" size={16} />
          刷新
        </button>
      </div>

      {error && <div className="error-state">{error}</div>}
      {message && <div className="empty-state">{message}</div>}

      <div className="grid two">
        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="shield" size={16} />
              登录入口
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
                <button className="button subtle oauth-provider-button" key={item.provider} type="button" onClick={() => startOAuth(item.provider)}>
                  <span>{item.label}</span>
                  <span className="faint">{item.note}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="settings" size={16} />
              OAuth 排除模型
            </h3>
            <button className="button primary" type="button" onClick={() => openExcludedEditor()}>
              <Icon name="plus" size={16} />
              新增
            </button>
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
                          onClick={() => openExcludedEditor(provider, models)}
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
                {Object.keys(oauthExcluded).length === 0 && (
                  <tr>
                    <td colSpan={3}>
                      <div className="empty-state">暂无 OAuth 排除模型</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Icon name="layers" size={16} />
            OAuth 模型别名
          </h3>
          <button className="button primary" type="button" onClick={() => openAliasEditor()}>
            <Icon name="plus" size={16} />
            新增
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>别名</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(oauthAliases).map(([channel, entries]) => (
                <tr key={channel}>
                  <td>{channel}</td>
                  <td>
                    {entries.map((entry) => (
                      <span className="tag" key={`${entry.name}-${entry.alias}`}>
                        {entry.name} =&gt; {entry.alias}{entry.fork ? " +fork" : ""}
                      </span>
                    ))}
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        className="icon-button"
                        title="编辑"
                        type="button"
                        onClick={() => openAliasEditor(channel, entries)}
                      >
                        <Icon name="edit" />
                      </button>
                      <button className="icon-button" title="删除" type="button" onClick={() => deleteOauthAliasChannel(channel)}>
                        <Icon name="trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {Object.keys(oauthAliases).length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state">暂无 OAuth 模型别名</div>
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
                <h3 id="oauth-modal-title">{activeFlow.label} 登录</h3>
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
              {needsCallback(activeFlow) ? (
                <div className={activeFlow.callbackSubmitted ? "oauth-step done" : "oauth-step active"}>
                  <span>2</span>
                  <strong>回调 URL</strong>
                </div>
              ) : (
                <div className="oauth-step done">
                  <span>2</span>
                  <strong>设备授权</strong>
                </div>
              )}
              <div className={activeFlow.status === "ok" ? "oauth-step done" : "oauth-step active"}>
                <span>3</span>
                <strong>保存认证</strong>
              </div>
            </div>

            <div className="form-stack modal-body">
              <div className="field">
                <label htmlFor="oauth-auth-url">授权地址</label>
                <textarea id="oauth-auth-url" className="compact-textarea mono" readOnly value={activeFlow.url} />
              </div>
              <div className="actions">
                <button className="button subtle" type="button" onClick={copyAuthUrl}>
                  <Icon name="copy" size={16} />
                  复制授权地址
                </button>
                <button className="button subtle" type="button" onClick={() => pollFlow(activeFlow.state)}>
                  <Icon name="refresh" size={16} />
                  检查状态
                </button>
              </div>

              {needsCallback(activeFlow) ? (
                <div className="field">
                  <label htmlFor="oauth-callback-url">回调 URL</label>
                  <textarea
                    id="oauth-callback-url"
                    className="callback-textarea mono"
                    placeholder="http://localhost:.../oauth-callback?code=...&state=..."
                    value={callbackUrl}
                    onChange={(event) => setCallbackUrl(event.target.value)}
                  />
                </div>
              ) : (
                <div className="empty-state">
                  Kimi 使用设备授权流程，完成授权页操作后等待状态变为 ok，无需回填 URL。
                </div>
              )}

              <div className="modal-status-row">
                <span className={flowStatusClass(activeFlow.status)}>{activeFlow.status}</span>
                {activeFlow.callbackSubmitted && <span className="badge ok">回调已提交</span>}
                {activeFlow.error && <span className="badge danger">{activeFlow.error}</span>}
              </div>

              <div className="modal-actions">
                <button className="button subtle" type="button" onClick={() => setActiveFlow(null)}>
                  关闭
                </button>
                {needsCallback(activeFlow) ? (
                  <button
                    className="button primary"
                    disabled={!callbackUrl.trim() || submittingCallback}
                    type="button"
                    onClick={submitCallback}
                  >
                    <Icon name="save" size={16} />
                    提交回调 URL
                  </button>
                ) : (
                  <button className="button primary" type="button" onClick={() => pollFlow(activeFlow.state)}>
                    <Icon name="refresh" size={16} />
                    检查状态
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {excludedModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="oauth-excluded-modal-title">
            <div className="modal-header">
              <div>
                <h3 id="oauth-excluded-modal-title">编辑 OAuth 排除模型</h3>
                <p className="panel-subtitle">模型留空时会删除该 Provider 配置。</p>
              </div>
              <button className="icon-button" title="关闭" type="button" onClick={() => setExcludedModalOpen(false)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal-body form-stack">
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
                <label htmlFor="oauth-models">模型，每行一个或逗号分隔</label>
                <textarea
                  id="oauth-models"
                  value={oauthModels}
                  onChange={(event) => setOauthModels(event.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button className="button subtle" type="button" onClick={() => setExcludedModalOpen(false)}>
                  取消
                </button>
                <button className="button primary" type="button" onClick={saveOauthExcluded}>
                  <Icon name="save" size={16} />
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {aliasModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="oauth-alias-modal-title">
            <div className="modal-header">
              <div>
                <h3 id="oauth-alias-modal-title">编辑 OAuth 模型别名</h3>
                <p className="panel-subtitle">每行填写 name =&gt; alias；追加 | fork 可保留原模型并额外暴露别名。</p>
              </div>
              <button className="icon-button" title="关闭" type="button" onClick={() => setAliasModalOpen(false)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal-body form-stack">
              <div className="field">
                <label htmlFor="oauth-alias-channel">Channel</label>
                <input
                  id="oauth-alias-channel"
                  placeholder="gemini-cli / vertex / aistudio / antigravity / claude / codex / kimi"
                  value={aliasChannel}
                  onChange={(event) => setAliasChannel(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="oauth-alias-lines">别名，每行 name =&gt; alias | fork</label>
                <textarea
                  id="oauth-alias-lines"
                  value={aliasText}
                  onChange={(event) => setAliasText(event.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button className="button subtle" type="button" onClick={() => setAliasModalOpen(false)}>
                  取消
                </button>
                <button className="button primary" type="button" onClick={saveOauthAlias}>
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
