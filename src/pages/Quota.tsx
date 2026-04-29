import { useEffect, useMemo, useRef, useState } from "react";
import {
  AuthFile,
  managementApi,
  UsageApiBucket,
  UsageDetail,
  UsageResponse,
} from "../api/client";
import Icon from "../components/Icon";
import { formatDate, formatNumber } from "../utils/format";
import {
  buildLoadingQuota,
  buildQuotaError,
  fetchRealQuota,
  quotaLookupKey,
  supportsRealQuota,
} from "../utils/quotaLookup";
import type { RealQuotaResult } from "../utils/quotaLookup";

interface RequestRow extends UsageDetail {
  api: string;
  model: string;
}

interface UsageAggregate {
  requests: number;
  failed: number;
  tokens: number;
  quotaFailures: number;
  models: Set<string>;
  lastSeen?: string;
  lastError?: string;
}

interface AccountQuotaRow {
  key: string;
  fileKey: string;
  provider: string;
  account: string;
  fileName: string;
  authIndex: string;
  canQueryRealQuota: boolean;
  runtimeStatus: string;
  quotaStatus: string;
  quotaClass: "ok" | "warn" | "danger";
  requests: number;
  failed: number;
  tokens: number;
  quotaFailures: number;
  models: number;
  lastSeen?: string;
  nextRecover?: string;
  reason: string;
}

function flattenRequests(apis: Record<string, UsageApiBucket> = {}): RequestRow[] {
  return Object.entries(apis)
    .flatMap(([api, bucket]) =>
      Object.entries(bucket.models ?? {}).flatMap(([model, modelBucket]) =>
        (modelBucket.details ?? []).map((detail) => ({ ...detail, api, model })),
      ),
    )
    .sort((left, right) => String(right.timestamp ?? "").localeCompare(String(left.timestamp ?? "")));
}

function isQuotaText(value: string | undefined): boolean {
  const text = String(value ?? "").toLowerCase();
  return /quota|配额|rate.?limit|429|resource_exhausted|insufficient_quota|exceeded|too many requests|billing/.test(text);
}

function providerName(file: AuthFile): string {
  return file.provider ?? file.type ?? "-";
}

function accountName(file: AuthFile): string {
  return file.email ?? file.account ?? file.label ?? file.name;
}

function runtimeStatus(file: AuthFile): string {
  if (file.disabled) {
    return "disabled";
  }
  if (file.unavailable) {
    return "unavailable";
  }
  if (file.status) {
    return file.status;
  }
  if (file.runtime_only) {
    return "runtime";
  }
  return "ready";
}

function tokenTotal(detail: UsageDetail): number {
  const tokens = detail.tokens;
  if (!tokens) {
    return 0;
  }
  return Number(
    tokens.total_tokens ??
      (Number(tokens.input_tokens ?? 0) +
        Number(tokens.output_tokens ?? 0) +
        Number(tokens.reasoning_tokens ?? 0)),
  );
}

function emptyAggregate(): UsageAggregate {
  return {
    requests: 0,
    failed: 0,
    tokens: 0,
    quotaFailures: 0,
    models: new Set<string>(),
  };
}

function addUsage(map: Map<string, UsageAggregate>, key: string, row: RequestRow) {
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    return;
  }
  const current = map.get(trimmedKey) ?? emptyAggregate();
  current.requests += 1;
  current.failed += row.failed ? 1 : 0;
  current.tokens += tokenTotal(row);
  current.models.add(row.model);
  if (isQuotaText(row.error)) {
    current.quotaFailures += 1;
    current.lastError = row.error;
  } else if (row.error) {
    current.lastError = row.error;
  }
  if (!current.lastSeen || String(row.timestamp ?? "").localeCompare(String(current.lastSeen)) > 0) {
    current.lastSeen = row.timestamp;
  }
  map.set(trimmedKey, current);
}

function aggregateUsage(rows: RequestRow[]) {
  const byAuthIndex = new Map<string, UsageAggregate>();
  const bySource = new Map<string, UsageAggregate>();

  rows.forEach((row) => {
    if (row.auth_index) {
      addUsage(byAuthIndex, row.auth_index, row);
    }
    if (row.source) {
      addUsage(bySource, row.source.toLowerCase(), row);
    }
  });

  return { byAuthIndex, bySource };
}

function mergeAggregate(primary?: UsageAggregate, fallback?: UsageAggregate): UsageAggregate {
  if (primary) {
    return primary;
  }
  if (fallback) {
    return fallback;
  }
  return emptyAggregate();
}

function quotaState(file: AuthFile, usage: UsageAggregate): Pick<AccountQuotaRow, "quotaClass" | "quotaStatus" | "reason" | "nextRecover"> {
  const reason = file.quota?.reason ?? file.last_error?.message ?? usage.lastError ?? file.status_message ?? "";
  const nextRecover = file.quota?.next_recover_at ?? file.next_retry_after;

  if (file.quota?.exceeded || usage.quotaFailures > 0 || isQuotaText(reason)) {
    return {
      quotaClass: "danger",
      quotaStatus: "疑似耗尽",
      reason: reason || "命中配额或限流错误",
      nextRecover,
    };
  }
  if (file.disabled || file.unavailable || file.status === "error") {
    return {
      quotaClass: "danger",
      quotaStatus: "不可用",
      reason: reason || file.status_message || "账号不可用",
      nextRecover,
    };
  }
  if (file.runtime_only || file.status === "wait") {
    return {
      quotaClass: "warn",
      quotaStatus: "等待",
      reason: reason || "等待刷新或运行时账号",
      nextRecover,
    };
  }
  return {
    quotaClass: "ok",
    quotaStatus: "正常",
    reason,
    nextRecover,
  };
}

function buildAccountRows(files: AuthFile[], rows: RequestRow[]): AccountQuotaRow[] {
  const usage = aggregateUsage(rows);
  const matchedAuthIndexes = new Set<string>();
  const matchedSources = new Set<string>();

  const accountRows = files.map((file) => {
    const authIndex = file.auth_index ?? "";
    const sourceKey = accountName(file).toLowerCase();
    const usageStats = mergeAggregate(
      authIndex ? usage.byAuthIndex.get(authIndex) : undefined,
      usage.bySource.get(sourceKey),
    );
    if (authIndex) {
      matchedAuthIndexes.add(authIndex);
    }
    if (sourceKey) {
      matchedSources.add(sourceKey);
    }

    const quota = quotaState(file, usageStats);
    const key = file.id ?? file.name;
    return {
      key,
      fileKey: key,
      provider: providerName(file),
      account: accountName(file),
      fileName: file.name,
      authIndex,
      canQueryRealQuota: supportsRealQuota(file),
      runtimeStatus: runtimeStatus(file),
      quotaStatus: quota.quotaStatus,
      quotaClass: quota.quotaClass,
      requests: usageStats.requests,
      failed: usageStats.failed,
      tokens: usageStats.tokens,
      quotaFailures: usageStats.quotaFailures,
      models: usageStats.models.size,
      lastSeen: usageStats.lastSeen,
      nextRecover: quota.nextRecover,
      reason: quota.reason,
    };
  });

  const sourceOnlyRows = Array.from(usage.bySource.entries())
    .filter(([source]) => source && !matchedSources.has(source))
    .map(([source, usageStats]) => ({
      key: `usage-source-${source}`,
      fileKey: `usage-source-${source}`,
      provider: "-",
      account: source,
      fileName: "-",
      authIndex: "-",
      canQueryRealQuota: false,
      runtimeStatus: "usage-only",
      quotaStatus: usageStats.quotaFailures > 0 ? "疑似耗尽" : "统计记录",
      quotaClass: usageStats.quotaFailures > 0 ? "danger" as const : "warn" as const,
      requests: usageStats.requests,
      failed: usageStats.failed,
      tokens: usageStats.tokens,
      quotaFailures: usageStats.quotaFailures,
      models: usageStats.models.size,
      lastSeen: usageStats.lastSeen,
      reason: usageStats.lastError ?? "",
    }));

  const authOnlyRows = Array.from(usage.byAuthIndex.entries())
    .filter(([authIndex]) => authIndex && !matchedAuthIndexes.has(authIndex))
    .map(([authIndex, usageStats]) => ({
      key: `usage-auth-${authIndex}`,
      fileKey: `usage-auth-${authIndex}`,
      provider: "-",
      account: "-",
      fileName: "-",
      authIndex,
      canQueryRealQuota: false,
      runtimeStatus: "usage-only",
      quotaStatus: usageStats.quotaFailures > 0 ? "疑似耗尽" : "统计记录",
      quotaClass: usageStats.quotaFailures > 0 ? "danger" as const : "warn" as const,
      requests: usageStats.requests,
      failed: usageStats.failed,
      tokens: usageStats.tokens,
      quotaFailures: usageStats.quotaFailures,
      models: usageStats.models.size,
      lastSeen: usageStats.lastSeen,
      reason: usageStats.lastError ?? "",
    }));

  return [...accountRows, ...sourceOnlyRows, ...authOnlyRows].sort((left, right) => {
    if (left.quotaFailures !== right.quotaFailures) {
      return right.quotaFailures - left.quotaFailures;
    }
    return left.provider.localeCompare(right.provider) || left.account.localeCompare(right.account);
  });
}

function realQuotaTone(percent: number | null): "ok" | "warn" | "danger" {
  if (percent === null) {
    return "warn";
  }
  if (percent <= 10) {
    return "danger";
  }
  if (percent <= 30) {
    return "warn";
  }
  return "ok";
}

function realQuotaHasLowValue(result: RealQuotaResult | undefined): boolean {
  return result?.status === "success" && result.metrics.some((metric) => metric.percent !== null && metric.percent <= 30);
}

function realQuotaBadge(result: RealQuotaResult | undefined) {
  if (!result) {
    return <span className="badge warn">未查询</span>;
  }
  if (result.status === "loading") {
    return <span className="badge warn">查询中</span>;
  }
  if (result.status === "error") {
    return <span className="badge danger">查询失败</span>;
  }
  if (result.status === "unsupported") {
    return <span className="badge warn">不可查询</span>;
  }
  const low = realQuotaHasLowValue(result);
  return <span className={`badge ${low ? "warn" : "ok"}`}>{low ? "低额度" : "已查询"}</span>;
}

function renderRealQuota(result: RealQuotaResult | undefined) {
  if (!result) {
    return <div className="quota-inline-message">点击查询实际配额</div>;
  }

  if (result.status === "loading") {
    return <div className="quota-inline-message">正在通过 api-call 查询上游配额...</div>;
  }

  if (result.status === "error" || result.status === "unsupported") {
    return (
      <div className="quota-inline-message danger">
        {result.statusCode ? `${result.statusCode} ` : ""}
        {result.message ?? "无法查询实际配额"}
      </div>
    );
  }

  return (
    <div className="quota-live">
      <div className="quota-live-head">
        {result.plan && <span className="quota-plan">{result.plan}</span>}
        <span className="faint">查询 {formatDate(result.checkedAt)}</span>
      </div>
      {result.metrics.length === 0 && (
        <div className="quota-inline-message">{result.message ?? "上游未返回可展示的配额窗口"}</div>
      )}
      {result.metrics.length > 0 && (
        <div className="quota-metrics">
          {result.metrics.slice(0, 6).map((metric) => {
            const tone = realQuotaTone(metric.percent);
            return (
              <div className="quota-metric" key={metric.id}>
                <div className="quota-meter-meta">
                  <span className="quota-meter-label" title={metric.note}>
                    {metric.label}
                  </span>
                  <span className={`quota-meter-value ${tone}`}>
                    {metric.percent === null ? "--" : `${Math.round(metric.percent)}%`}
                  </span>
                </div>
                <div className="quota-meter">
                  <div
                    className={`quota-meter-fill ${tone}`}
                    style={{ width: `${metric.percent === null ? 0 : Math.max(4, metric.percent)}%` }}
                  />
                </div>
                {(metric.amount || metric.reset) && (
                  <div className="quota-meter-sub">
                    {metric.amount && <span>{metric.amount}</span>}
                    {metric.reset && <span>重置 {metric.reset}</span>}
                  </div>
                )}
              </div>
            );
          })}
          {result.metrics.length > 6 && (
            <div className="quota-inline-message">还有 {result.metrics.length - 6} 个配额窗口</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Quota() {
  const [usageResponse, setUsageResponse] = useState<UsageResponse>({});
  const [authFiles, setAuthFiles] = useState<AuthFile[]>([]);
  const [realQuotas, setRealQuotas] = useState<Record<string, RealQuotaResult>>({});
  const [switchProject, setSwitchProject] = useState(false);
  const [switchPreviewModel, setSwitchPreviewModel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [realQuotaLoading, setRealQuotaLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const autoQuotaStartedRef = useRef(false);

  async function refreshOneRealQuota(file: AuthFile) {
    const key = quotaLookupKey(file);
    setRealQuotas((prev) => ({ ...prev, [key]: buildLoadingQuota(file) }));
    try {
      const result = await fetchRealQuota(file);
      setRealQuotas((prev) => ({ ...prev, [key]: result }));
    } catch (err) {
      setRealQuotas((prev) => ({ ...prev, [key]: buildQuotaError(file, err) }));
    }
  }

  async function refreshAllRealQuotas(files = authFiles, showMessage = true) {
    const targets = files.filter(supportsRealQuota);
    if (targets.length === 0) {
      if (showMessage) {
        setMessage("没有可查询实际配额的账号");
      }
      return;
    }

    setRealQuotaLoading(true);
    if (showMessage) {
      setMessage("");
    }
    try {
      let nextIndex = 0;
      const workerCount = Math.min(3, targets.length);
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (nextIndex < targets.length) {
            const target = targets[nextIndex];
            nextIndex += 1;
            await refreshOneRealQuota(target);
          }
        }),
      );
      if (showMessage) {
        setMessage(`已查询 ${targets.length} 个账号的实际配额`);
      }
    } finally {
      setRealQuotaLoading(false);
    }
  }

  async function loadQuota() {
    setLoading(true);
    setError("");
    try {
      const [usage, auths, project, preview] = await Promise.allSettled([
        managementApi.getUsage(),
        managementApi.getAuthFiles(),
        managementApi.getBooleanSetting("/quota-exceeded/switch-project", "switch-project"),
        managementApi.getBooleanSetting(
          "/quota-exceeded/switch-preview-model",
          "switch-preview-model",
        ),
      ]);

      if (usage.status === "fulfilled") {
        setUsageResponse(usage.value);
      }
      if (auths.status === "fulfilled") {
        setAuthFiles(auths.value);
        if (!autoQuotaStartedRef.current) {
          autoQuotaStartedRef.current = true;
          void refreshAllRealQuotas(auths.value, false);
        }
      }
      if (project.status === "fulfilled") {
        setSwitchProject(project.value);
      }
      if (preview.status === "fulfilled") {
        setSwitchPreviewModel(preview.value);
      }

      const rejected = [usage, auths, project, preview].find(
        (result) => result.status === "rejected",
      );
      if (rejected?.status === "rejected") {
        setError(rejected.reason instanceof Error ? rejected.reason.message : "加载配额信息失败");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQuota();
    const refresh = () => void loadQuota();
    window.addEventListener("cpam-refresh", refresh);
    return () => window.removeEventListener("cpam-refresh", refresh);
  }, []);

  async function toggleProject() {
    const next = !switchProject;
    await managementApi.setValue("/quota-exceeded/switch-project", next);
    setSwitchProject(next);
    setMessage("配额切换项目策略已保存");
  }

  async function togglePreviewModel() {
    const next = !switchPreviewModel;
    await managementApi.setValue("/quota-exceeded/switch-preview-model", next);
    setSwitchPreviewModel(next);
    setMessage("配额切换预览模型策略已保存");
  }

  const usage = usageResponse.usage ?? {};
  const requestRows = useMemo(() => flattenRequests(usage.apis), [usage.apis]);
  const accountRows = useMemo(() => buildAccountRows(authFiles, requestRows), [authFiles, requestRows]);
  const authFileByKey = useMemo(() => {
    const map = new Map<string, AuthFile>();
    authFiles.forEach((file) => map.set(quotaLookupKey(file), file));
    return map;
  }, [authFiles]);
  const quotaFailures = useMemo(
    () => requestRows.filter((row) => row.failed && isQuotaText(row.error)).slice(0, 40),
    [requestRows],
  );
  const quotaAccountCount = accountRows.filter((row) => row.quotaFailures > 0 || row.quotaStatus === "疑似耗尽").length;
  const realQuotaResults = Object.values(realQuotas);
  const realQuotaSuccessCount = realQuotaResults.filter((row) => row.status === "success").length;
  const lowRealQuotaCount = realQuotaResults.filter(realQuotaHasLowValue).length;
  const realQuotaSupportedCount = authFiles.filter(supportsRealQuota).length;

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>配额</h2>
          <p>按账号查看真实上游配额、命中统计、疑似配额失败，并控制配额耗尽时的自动切换策略。</p>
        </div>
        <div className="actions">
          <button
            className="button primary"
            disabled={realQuotaLoading || realQuotaSupportedCount === 0}
            type="button"
            onClick={() => void refreshAllRealQuotas()}
          >
            <Icon name="activity" size={16} />
            查询实际配额
          </button>
          <button className="button" disabled={loading} type="button" onClick={loadQuota}>
            <Icon name="refresh" size={16} />
            刷新
          </button>
        </div>
      </div>

      {error && <div className="error-state">{error}</div>}
      {message && <div className="empty-state">{message}</div>}

      <div className="grid four">
        <div className="stat-card">
          <div className="stat-label">账号</div>
          <div className="stat-value">{formatNumber(accountRows.length)}</div>
          <div className="stat-trend">认证文件与统计命中账号</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">已查询配额</div>
          <div className="stat-value">{formatNumber(realQuotaSuccessCount)}</div>
          <div className="stat-trend">可查询账号 {formatNumber(realQuotaSupportedCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">低配额 / 疑似耗尽</div>
          <div className="stat-value">{formatNumber(lowRealQuotaCount + quotaAccountCount)}</div>
          <div className="stat-trend">实际配额与请求错误合并</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">总失败</div>
          <div className="stat-value">{formatNumber(usage.failure_count ?? usageResponse.failed_requests ?? 0)}</div>
          <div className="stat-trend">总请求 {formatNumber(usage.total_requests)}</div>
        </div>
      </div>

      <div className="grid two">
        <div className="toggle-line">
          <div>
            <strong>配额耗尽时切换项目</strong>
            <div className="faint">quota-exceeded/switch-project</div>
          </div>
          <button className={switchProject ? "switch on" : "switch"} type="button" onClick={toggleProject} />
        </div>
        <div className="toggle-line">
          <div>
            <strong>配额耗尽时切换预览模型</strong>
            <div className="faint">quota-exceeded/switch-preview-model</div>
          </div>
          <button className={switchPreviewModel ? "switch on" : "switch"} type="button" onClick={togglePreviewModel} />
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">
              <Icon name="shield" size={16} />
              账号配额概览
            </h3>
            <p className="panel-subtitle">
              通过 /v0/management/api-call 使用账号 token 查询上游配额；失败请求仍作为辅助判断。
            </p>
          </div>
          <span className="badge">{accountRows.length} 个账号</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>提供商</th>
                <th>账号</th>
                <th>配额</th>
                <th>实际配额</th>
                <th>运行状态</th>
                <th>请求</th>
                <th>失败</th>
                <th>配额失败</th>
                <th>Token</th>
                <th>模型</th>
                <th>最近命中</th>
                <th>恢复时间</th>
                <th>认证</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {accountRows.map((row) => {
                const realQuota = realQuotas[row.fileKey];
                const file = authFileByKey.get(row.fileKey);
                return (
                  <tr key={row.key}>
                    <td>{row.provider}</td>
                    <td>
                      <div>{row.account}</div>
                      <div className="faint mono">{row.fileName}</div>
                      {row.reason && <div className="faint">{row.reason}</div>}
                    </td>
                    <td>
                      <div className="quota-status-stack">
                        <span className={`badge ${row.quotaClass}`}>{row.quotaStatus}</span>
                        {realQuotaBadge(realQuota)}
                      </div>
                    </td>
                    <td className="quota-cell">{renderRealQuota(realQuota)}</td>
                    <td>{row.runtimeStatus}</td>
                    <td>{formatNumber(row.requests)}</td>
                    <td>{formatNumber(row.failed)}</td>
                    <td>{formatNumber(row.quotaFailures)}</td>
                    <td>{formatNumber(row.tokens, true)}</td>
                    <td>{formatNumber(row.models)}</td>
                    <td>{formatDate(row.lastSeen)}</td>
                    <td>{formatDate(row.nextRecover)}</td>
                    <td className="mono">{row.authIndex || "-"}</td>
                    <td>
                      {row.canQueryRealQuota && file ? (
                        <button
                          className="button subtle"
                          disabled={realQuota?.status === "loading"}
                          type="button"
                          onClick={() => void refreshOneRealQuota(file)}
                        >
                          <Icon name="refresh" size={15} />
                          查询
                        </button>
                      ) : (
                        <span className="faint">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {accountRows.length === 0 && (
                <tr>
                  <td colSpan={14}>
                    <div className="empty-state">暂无账号。请先在认证文件或 OAuth 登录中添加账号。</div>
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
            <Icon name="logs" size={16} />
            疑似配额失败请求
          </h3>
          <span className="badge">{quotaFailures.length} 条</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>API</th>
                <th>模型</th>
                <th>命中账号</th>
                <th>认证</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              {quotaFailures.map((row, index) => (
                <tr key={`${row.timestamp}-${row.api}-${row.model}-${index}`}>
                  <td>{formatDate(row.timestamp)}</td>
                  <td className="mono">{row.api}</td>
                  <td className="mono">{row.model}</td>
                  <td>{row.source ?? "-"}</td>
                  <td className="mono">{row.auth_index ?? "-"}</td>
                  <td>{row.error ?? "-"}</td>
                </tr>
              ))}
              {quotaFailures.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">暂无疑似配额失败请求</div>
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
