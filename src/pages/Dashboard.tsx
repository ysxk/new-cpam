import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  downloadJson,
  managementApi,
  UsageApiBucket,
  UsageDetail,
  UsageResponse,
} from "../api/client";
import Icon from "../components/Icon";
import { formatDate, formatNumber, formatPercent, maskSecret, objectSize } from "../utils/format";

interface RequestRow extends UsageDetail {
  api: string;
  model: string;
}

function useRefreshEvent(callback: () => void) {
  useEffect(() => {
    window.addEventListener("cpam-refresh", callback);
    return () => window.removeEventListener("cpam-refresh", callback);
  }, [callback]);
}

function flattenRequests(apis: Record<string, UsageApiBucket> = {}): RequestRow[] {
  return Object.entries(apis)
    .flatMap(([api, bucket]) =>
      Object.entries(bucket.models ?? {}).flatMap(([model, modelBucket]) =>
        (modelBucket.details ?? []).map((detail) => ({ ...detail, api, model })),
      ),
    )
    .sort((left, right) => String(right.timestamp ?? "").localeCompare(String(left.timestamp ?? "")))
    .slice(0, 12);
}

function topApiRows(apis: Record<string, UsageApiBucket> = {}) {
  return Object.entries(apis)
    .map(([api, bucket]) => ({
      api,
      requests: bucket.total_requests ?? 0,
      tokens: bucket.total_tokens ?? 0,
      models: objectSize(bucket.models),
    }))
    .sort((left, right) => right.requests - left.requests)
    .slice(0, 8);
}

function chartValues(values: Record<string, number> | undefined, hours = false) {
  if (!values) {
    return [];
  }

  if (hours) {
    return Array.from({ length: 24 }, (_, index) => {
      const key = String(index).padStart(2, "0");
      return { label: key, value: Number(values[key] ?? 0) };
    });
  }

  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-14)
    .map(([label, value]) => ({ label, value: Number(value) }));
}

export default function Dashboard() {
  const [usageResponse, setUsageResponse] = useState<UsageResponse>({});
  const [latestVersion, setLatestVersion] = useState("-");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const [usageResult, configResult, versionResult] = await Promise.allSettled([
        managementApi.getUsage(),
        managementApi.getConfig(),
        managementApi.getLatestVersion(),
      ]);

      if (usageResult.status === "fulfilled") {
        setUsageResponse(usageResult.value);
      }
      if (configResult.status === "fulfilled") {
        setConfig(configResult.value);
      }
      if (versionResult.status === "fulfilled") {
        setLatestVersion(versionResult.value["latest-version"] ?? "-");
      }

      const rejected = [usageResult, configResult, versionResult].find(
        (result) => result.status === "rejected",
      );
      if (rejected?.status === "rejected") {
        setError(rejected.reason instanceof Error ? rejected.reason.message : "加载失败");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  useRefreshEvent(() => {
    void loadDashboard();
  });

  const usage = usageResponse.usage ?? {};
  const totalRequests = usage.total_requests ?? 0;
  const success = usage.success_count ?? 0;
  const failed = usage.failure_count ?? usageResponse.failed_requests ?? 0;
  const successRate = totalRequests > 0 ? success / totalRequests : 0;
  const requestRows = useMemo(() => flattenRequests(usage.apis), [usage.apis]);
  const apiRows = useMemo(() => topApiRows(usage.apis), [usage.apis]);
  const hourlyRequests = chartValues(usage.requests_by_hour, true);
  const dailyTokens = chartValues(usage.tokens_by_day);
  const maxHourly = Math.max(1, ...hourlyRequests.map((item) => item.value));
  const maxDailyTokens = Math.max(1, ...dailyTokens.map((item) => item.value));

  async function exportUsage() {
    const snapshot = await managementApi.exportUsage();
    downloadJson(snapshot, `cpam-usage-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function importUsage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    const payload = JSON.parse(text) as unknown;
    await managementApi.importUsage(payload);
    event.target.value = "";
    await loadDashboard();
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>运行概览</h2>
          <p>请求统计保存在内存中，服务重启后会清空；可通过导入导出做迁移。</p>
        </div>
        <div className="actions">
          <label className="button subtle" htmlFor="usage-import">
            <Icon name="upload" size={16} />
            导入统计
          </label>
          <input id="usage-import" hidden type="file" accept="application/json" onChange={importUsage} />
          <button className="button" type="button" onClick={exportUsage}>
            <Icon name="download" size={16} />
            导出统计
          </button>
          <button className="button primary" disabled={loading} type="button" onClick={loadDashboard}>
            <Icon name="refresh" size={16} />
            刷新
          </button>
        </div>
      </div>

      {error && <div className="error-state">{error}</div>}

      <div className="grid four">
        <div className="stat-card">
          <div className="stat-label">总请求</div>
          <div className="stat-value">{formatNumber(totalRequests)}</div>
          <div className="stat-trend">失败 {formatNumber(failed)} 次</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">成功率</div>
          <div className="stat-value">{formatPercent(successRate)}</div>
          <div className="stat-trend">成功 {formatNumber(success)} 次</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Token 用量</div>
          <div className="stat-value">{formatNumber(usage.total_tokens, true)}</div>
          <div className="stat-trend">按请求返回 token 统计</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">最新版本</div>
          <div className="stat-value">{latestVersion}</div>
          <div className="stat-trend">配置项 {formatNumber(Object.keys(config).length)} 个</div>
        </div>
      </div>

      <div className="grid two">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">
                <Icon name="activity" size={16} />
                按小时请求
              </h3>
              <p className="panel-subtitle">00-23 小时桶，跨日期聚合</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="chart-bars">
              {hourlyRequests.map((item) => (
                <div
                  key={item.label}
                  className="bar"
                  title={`${item.label}:00 ${item.value}`}
                  style={{ height: `${Math.max(3, (item.value / maxHourly) * 100)}%` }}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">
                <Icon name="activity" size={16} />
                按日 Token
              </h3>
              <p className="panel-subtitle">最近 14 个有数据日期</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="chart-bars">
              {dailyTokens.length === 0 ? (
                <div className="empty-state">暂无 token 统计</div>
              ) : (
                dailyTokens.map((item) => (
                  <div
                    key={item.label}
                    className="bar"
                    title={`${item.label} ${item.value}`}
                    style={{ height: `${Math.max(3, (item.value / maxDailyTokens) * 100)}%` }}
                  />
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="grid two">
        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="logs" size={16} />
              API 分布
            </h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>端点</th>
                  <th>请求</th>
                  <th>Token</th>
                  <th>模型</th>
                </tr>
              </thead>
              <tbody>
                {apiRows.map((row) => (
                  <tr key={row.api}>
                    <td className="mono">{row.api}</td>
                    <td>{formatNumber(row.requests)}</td>
                    <td>{formatNumber(row.tokens, true)}</td>
                    <td>{row.models}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="logs" size={16} />
              最近请求
            </h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>模型</th>
                  <th>来源</th>
                  <th>Token</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {requestRows.map((row, index) => (
                  <tr key={`${row.timestamp}-${row.model}-${index}`}>
                    <td>{formatDate(row.timestamp)}</td>
                    <td className="mono">{row.model}</td>
                    <td>{row.source ?? "-"}</td>
                    <td>{formatNumber(row.tokens?.total_tokens, true)}</td>
                    <td>
                      <span className={row.failed ? "badge danger" : "badge ok"}>
                        {row.failed ? "失败" : "成功"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Icon name="settings" size={16} />
            配置摘要
          </h3>
        </div>
        <div className="panel-body grid four">
          <div>
            <div className="stat-label">代理地址</div>
            <div className="mono">{String(config["proxy-url"] ?? "-")}</div>
          </div>
          <div>
            <div className="stat-label">服务 API Keys</div>
            <div>{formatNumber(Array.isArray(config["api-keys"]) ? config["api-keys"].length : 0)}</div>
          </div>
          <div>
            <div className="stat-label">调试模式</div>
            <span className={config.debug ? "badge warn" : "badge ok"}>
              {config.debug ? "已开启" : "未开启"}
            </span>
          </div>
          <div>
            <div className="stat-label">示例 Key</div>
            <div className="mono">
              {maskSecret(Array.isArray(config["api-keys"]) ? String(config["api-keys"][0] ?? "") : "")}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
