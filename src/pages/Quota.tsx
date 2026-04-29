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

interface FailureRow extends UsageDetail {
  api: string;
  model: string;
}

interface AuthQuotaRow {
  key: string;
  provider: string;
  name: string;
  scope: string;
  status: string;
  reason: string;
  nextRecover?: string;
}

function flattenFailures(apis: Record<string, UsageApiBucket> = {}): FailureRow[] {
  return Object.entries(apis)
    .flatMap(([api, bucket]) =>
      Object.entries(bucket.models ?? {}).flatMap(([model, modelBucket]) =>
        (modelBucket.details ?? [])
          .filter((detail) => detail.failed || detail.error)
          .map((detail) => ({ ...detail, api, model })),
      ),
    )
    .sort((left, right) => String(right.timestamp ?? "").localeCompare(String(left.timestamp ?? "")));
}

function isQuotaText(value: string | undefined): boolean {
  const text = String(value ?? "").toLowerCase();
  return /quota|配额|rate.?limit|429|resource_exhausted|insufficient_quota|exceeded|too many requests|billing/.test(text);
}

function authQuotaRows(files: AuthFile[]): AuthQuotaRow[] {
  return files.flatMap((file) => {
    const rows: AuthQuotaRow[] = [];
    const reason = file.quota?.reason ?? file.last_error?.message ?? file.status_message ?? "";
    if (file.quota?.exceeded || file.unavailable || isQuotaText(reason)) {
      rows.push({
        key: `${file.id ?? file.name}-auth`,
        provider: file.provider ?? file.type ?? "-",
        name: file.label ?? file.account ?? file.email ?? file.name,
        scope: "账号",
        status: file.unavailable ? "unavailable" : file.status ?? "ready",
        reason: reason || "quota exceeded",
        nextRecover: file.quota?.next_recover_at ?? file.next_retry_after,
      });
    }

    Object.entries(file.model_states ?? {}).forEach(([model, state]) => {
      const modelReason = state.quota?.reason ?? state.last_error?.message ?? state.status_message ?? "";
      if (state.quota?.exceeded || state.unavailable || isQuotaText(modelReason)) {
        rows.push({
          key: `${file.id ?? file.name}-${model}`,
          provider: file.provider ?? file.type ?? "-",
          name: file.label ?? file.account ?? file.email ?? file.name,
          scope: model,
          status: state.status ?? (state.unavailable ? "unavailable" : "ready"),
          reason: modelReason || "quota exceeded",
          nextRecover: state.quota?.next_recover_at ?? state.next_retry_after,
        });
      }
    });

    return rows;
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
  const failures = useMemo(() => flattenFailures(usage.apis), [usage.apis]);
  const quotaFailures = useMemo(
    () => failures.filter((row) => isQuotaText(row.error)).slice(0, 40),
    [failures],
  );
  const authRows = useMemo(() => authQuotaRows(authFiles), [authFiles]);
  const affectedProviders = useMemo(
    () => new Set([...quotaFailures.map((row) => row.api), ...authRows.map((row) => row.provider)]).size,
    [authRows, quotaFailures],
  );

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>配额</h2>
          <p>查看配额相关状态、失败请求，并控制配额耗尽时的自动切换策略。</p>
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
          <div className="stat-label">疑似配额失败</div>
          <div className="stat-value">{formatNumber(quotaFailures.length)}</div>
          <div className="stat-trend">来自请求统计的失败记录</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">认证限流状态</div>
          <div className="stat-value">{formatNumber(authRows.length)}</div>
          <div className="stat-trend">账号或模型级状态</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">受影响提供商</div>
          <div className="stat-value">{formatNumber(affectedProviders)}</div>
          <div className="stat-trend">按 API 与 Provider 去重</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">总失败</div>
          <div className="stat-value">{formatNumber(usage.failure_count ?? usageResponse.failed_requests ?? failures.length)}</div>
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
          <h3 className="panel-title">
            <Icon name="shield" size={16} />
            认证配额状态
          </h3>
          <span className="badge">{authRows.length} 条</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>提供商</th>
                <th>账号</th>
                <th>范围</th>
                <th>状态</th>
                <th>恢复时间</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              {authRows.map((row) => (
                <tr key={row.key}>
                  <td>{row.provider}</td>
                  <td>{row.name}</td>
                  <td className="mono">{row.scope}</td>
                  <td>
                    <span className={row.status === "ready" ? "badge ok" : "badge warn"}>{row.status}</span>
                  </td>
                  <td>{formatDate(row.nextRecover)}</td>
                  <td>{row.reason || "-"}</td>
                </tr>
              ))}
              {authRows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">暂无账号或模型级配额状态</div>
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
                <th>来源</th>
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
