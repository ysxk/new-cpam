import { useEffect, useMemo, useState } from "react";
import {
  AuthFile,
  managementApi,
  UsageApiBucket,
  UsageDetail,
  UsageResponse,
} from "../api/client";
import Icon from "../components/Icon";
import { formatDate, formatNumber } from "../utils/format";

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
  provider: string;
  account: string;
  fileName: string;
  authIndex: string;
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
    return {
      key: file.id ?? file.name,
      provider: providerName(file),
      account: accountName(file),
      fileName: file.name,
      authIndex,
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
      provider: "-",
      account: source,
      fileName: "-",
      authIndex: "-",
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
      provider: "-",
      account: "-",
      fileName: "-",
      authIndex,
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

export default function Quota() {
  const [usageResponse, setUsageResponse] = useState<UsageResponse>({});
  const [authFiles, setAuthFiles] = useState<AuthFile[]>([]);
  const [switchProject, setSwitchProject] = useState(false);
  const [switchPreviewModel, setSwitchPreviewModel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
  const quotaFailures = useMemo(
    () => requestRows.filter((row) => row.failed && isQuotaText(row.error)).slice(0, 40),
    [requestRows],
  );
  const quotaAccountCount = accountRows.filter((row) => row.quotaFailures > 0 || row.quotaStatus === "疑似耗尽").length;
  const okAccountCount = accountRows.filter((row) => row.quotaClass === "ok").length;

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>配额</h2>
          <p>按账号查看配额状态、命中统计、疑似配额失败，并控制配额耗尽时的自动切换策略。</p>
        </div>
        <button className="button" disabled={loading} type="button" onClick={loadQuota}>
          <Icon name="refresh" size={16} />
          刷新
        </button>
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
          <div className="stat-label">正常</div>
          <div className="stat-value">{formatNumber(okAccountCount)}</div>
          <div className="stat-trend">未发现配额异常</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">疑似配额账号</div>
          <div className="stat-value">{formatNumber(quotaAccountCount)}</div>
          <div className="stat-trend">账号级或请求级命中</div>
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
              当前管理 API 未提供剩余额度数值；这里展示账号状态、命中统计和疑似配额耗尽信号。
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
                <th>运行状态</th>
                <th>请求</th>
                <th>失败</th>
                <th>配额失败</th>
                <th>Token</th>
                <th>模型</th>
                <th>最近命中</th>
                <th>恢复时间</th>
                <th>认证</th>
              </tr>
            </thead>
            <tbody>
              {accountRows.map((row) => (
                <tr key={row.key}>
                  <td>{row.provider}</td>
                  <td>
                    <div>{row.account}</div>
                    <div className="faint mono">{row.fileName}</div>
                    {row.reason && <div className="faint">{row.reason}</div>}
                  </td>
                  <td>
                    <span className={`badge ${row.quotaClass}`}>{row.quotaStatus}</span>
                  </td>
                  <td>{row.runtimeStatus}</td>
                  <td>{formatNumber(row.requests)}</td>
                  <td>{formatNumber(row.failed)}</td>
                  <td>{formatNumber(row.quotaFailures)}</td>
                  <td>{formatNumber(row.tokens, true)}</td>
                  <td>{formatNumber(row.models)}</td>
                  <td>{formatDate(row.lastSeen)}</td>
                  <td>{formatDate(row.nextRecover)}</td>
                  <td className="mono">{row.authIndex || "-"}</td>
                </tr>
              ))}
              {accountRows.length === 0 && (
                <tr>
                  <td colSpan={12}>
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
