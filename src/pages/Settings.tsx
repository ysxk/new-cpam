import { useEffect, useState } from "react";
import { managementApi } from "../api/client";
import Icon from "../components/Icon";

interface SettingsState {
  debug: boolean;
  usageStats: boolean;
  loggingToFile: boolean;
  requestLog: boolean;
  wsAuth: boolean;
  switchProject: boolean;
  switchPreviewModel: boolean;
  forceModelPrefix: boolean;
  proxyUrl: string;
  requestRetry: number;
  maxRetryInterval: number;
  logsMaxTotalSizeMb: number;
  errorLogsMaxFiles: number;
  routingStrategy: string;
  latestVersion: string;
}

const emptySettings: SettingsState = {
  debug: false,
  usageStats: false,
  loggingToFile: false,
  requestLog: false,
  wsAuth: false,
  switchProject: false,
  switchPreviewModel: false,
  forceModelPrefix: false,
  proxyUrl: "",
  requestRetry: 0,
  maxRetryInterval: 0,
  logsMaxTotalSizeMb: 0,
  errorLogsMaxFiles: 0,
  routingStrategy: "round-robin",
  latestVersion: "-",
};

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadSettings() {
    setLoading(true);
    setError("");
    try {
      const [
        debug,
        usageStats,
        loggingToFile,
        requestLog,
        wsAuth,
        switchProject,
        switchPreviewModel,
        forceModelPrefix,
        proxyUrl,
        requestRetry,
        maxRetryInterval,
        logsMaxTotalSizeMb,
        errorLogsMaxFiles,
        routingStrategy,
        latestVersion,
      ] = await Promise.all([
        managementApi.getBooleanSetting("/debug", "debug"),
        managementApi.getBooleanSetting("/usage-statistics-enabled", "usage-statistics-enabled"),
        managementApi.getBooleanSetting("/logging-to-file", "logging-to-file"),
        managementApi.getBooleanSetting("/request-log", "request-log"),
        managementApi.getBooleanSetting("/ws-auth", "ws-auth"),
        managementApi.getBooleanSetting("/quota-exceeded/switch-project", "switch-project"),
        managementApi.getBooleanSetting(
          "/quota-exceeded/switch-preview-model",
          "switch-preview-model",
        ),
        managementApi.getBooleanSetting("/force-model-prefix", "force-model-prefix"),
        managementApi.getProxyUrl(),
        managementApi.getNumberSetting("/request-retry", "request-retry"),
        managementApi.getNumberSetting("/max-retry-interval", "max-retry-interval"),
        managementApi.getNumberSetting("/logs-max-total-size-mb", "logs-max-total-size-mb"),
        managementApi.getNumberSetting("/error-logs-max-files", "error-logs-max-files"),
        managementApi.getRoutingStrategy(),
        managementApi.getLatestVersion(),
      ]);
      setSettings({
        debug,
        usageStats,
        loggingToFile,
        requestLog,
        wsAuth,
        switchProject,
        switchPreviewModel,
        forceModelPrefix,
        proxyUrl,
        requestRetry,
        maxRetryInterval,
        logsMaxTotalSizeMb,
        errorLogsMaxFiles,
        routingStrategy,
        latestVersion: latestVersion["latest-version"] ?? "-",
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载系统设置失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    const refresh = () => void loadSettings();
    window.addEventListener("cpam-refresh", refresh);
    return () => window.removeEventListener("cpam-refresh", refresh);
  }, []);

  async function toggleSetting(
    key: keyof SettingsState,
    path: string,
    value: boolean,
  ) {
    await managementApi.setValue(path, value);
    setSettings((items) => ({ ...items, [key]: value }));
    setMessage("设置已保存");
  }

  async function saveNumber(
    path: string,
    key: "requestRetry" | "maxRetryInterval" | "logsMaxTotalSizeMb" | "errorLogsMaxFiles",
  ) {
    await managementApi.setValue(path, Number(settings[key]));
    setMessage("数值设置已保存");
  }

  async function saveRoutingStrategy() {
    await managementApi.putRoutingStrategy(settings.routingStrategy);
    setMessage("路由策略已保存");
    await loadSettings();
  }

  async function saveProxyUrl() {
    if (settings.proxyUrl.trim()) {
      await managementApi.setValue("/proxy-url", settings.proxyUrl.trim(), "PUT");
      setMessage("代理地址已保存");
    } else {
      await managementApi.deletePath("/proxy-url");
      setMessage("代理地址已清空");
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>系统设置</h2>
          <p>管理运行时开关、代理地址、重试策略、WebSocket 认证和版本检查。</p>
        </div>
        <button className="button" disabled={loading} type="button" onClick={loadSettings}>
          <Icon name="refresh" size={16} />
          刷新
        </button>
      </div>

      {error && <div className="error-state">{error}</div>}
      {message && <div className="empty-state">{message}</div>}

      <div className="grid four">
        <div className="stat-card">
          <div className="stat-label">最新版本</div>
          <div className="stat-value">{settings.latestVersion}</div>
          <div className="stat-trend">GitHub Releases latest</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">请求重试</div>
          <div className="stat-value">{settings.requestRetry}</div>
          <div className="stat-trend">失败后最多重试次数</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">最大间隔</div>
          <div className="stat-value">{settings.maxRetryInterval}s</div>
          <div className="stat-trend">重试最大等待时间</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">WebSocket 认证</div>
          <div className="stat-value">{settings.wsAuth ? "ON" : "OFF"}</div>
          <div className="stat-trend">/ws/* 接入认证</div>
        </div>
      </div>

      <div className="grid two">
        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="settings" size={16} />
              运行开关
            </h3>
          </div>
          <div className="panel-body form-stack">
            <ToggleRow
              active={settings.debug}
              label="Debug"
              note="输出更详细的运行信息"
              onClick={() => toggleSetting("debug", "/debug", !settings.debug)}
            />
            <ToggleRow
              active={settings.usageStats}
              label="请求统计"
              note="收集 token 和请求分布"
              onClick={() =>
                toggleSetting(
                  "usageStats",
                  "/usage-statistics-enabled",
                  !settings.usageStats,
                )
              }
            />
            <ToggleRow
              active={settings.loggingToFile}
              label="文件日志"
              note="开启后可读取 /logs"
              onClick={() =>
                toggleSetting("loggingToFile", "/logging-to-file", !settings.loggingToFile)
              }
            />
            <ToggleRow
              active={settings.requestLog}
              label="请求日志"
              note="记录请求日志；关闭后可查看错误请求日志"
              onClick={() => toggleSetting("requestLog", "/request-log", !settings.requestLog)}
            />
            <ToggleRow
              active={settings.wsAuth}
              label="WebSocket 认证"
              note="开启时会断开已有 WebSocket 会话"
              onClick={() => toggleSetting("wsAuth", "/ws-auth", !settings.wsAuth)}
            />
            <ToggleRow
              active={settings.forceModelPrefix}
              label="强制模型前缀"
              note="只使用带 prefix 的凭证匹配无前缀请求"
              onClick={() =>
                toggleSetting("forceModelPrefix", "/force-model-prefix", !settings.forceModelPrefix)
              }
            />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="activity" size={16} />
              配额行为
            </h3>
          </div>
          <div className="panel-body form-stack">
            <ToggleRow
              active={settings.switchProject}
              label="配额耗尽时切换项目"
              note="quota-exceeded/switch-project"
              onClick={() =>
                toggleSetting(
                  "switchProject",
                  "/quota-exceeded/switch-project",
                  !settings.switchProject,
                )
              }
            />
            <ToggleRow
              active={settings.switchPreviewModel}
              label="配额耗尽时切换预览模型"
              note="quota-exceeded/switch-preview-model"
              onClick={() =>
                toggleSetting(
                  "switchPreviewModel",
                  "/quota-exceeded/switch-preview-model",
                  !settings.switchPreviewModel,
                )
              }
            />
            <div className="field">
              <label htmlFor="proxy-url">proxy-url</label>
              <input
                id="proxy-url"
                placeholder="socks5://127.0.0.1:1080"
                value={settings.proxyUrl}
                onChange={(event) =>
                  setSettings((items) => ({ ...items, proxyUrl: event.target.value }))
                }
              />
            </div>
            <button className="button primary" type="button" onClick={saveProxyUrl}>
              <Icon name="save" size={16} />
              保存代理地址
            </button>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Icon name="refresh" size={16} />
            重试策略
          </h3>
        </div>
        <div className="panel-body grid two">
          <div className="field">
            <label htmlFor="request-retry">request-retry</label>
            <input
              id="request-retry"
              min={0}
              type="number"
              value={settings.requestRetry}
              onChange={(event) =>
                setSettings((items) => ({
                  ...items,
                  requestRetry: Number(event.target.value),
                }))
              }
            />
            <button className="button subtle" type="button" onClick={() => saveNumber("/request-retry", "requestRetry")}>
              保存
            </button>
          </div>
          <div className="field">
            <label htmlFor="max-retry-interval">max-retry-interval</label>
            <input
              id="max-retry-interval"
              min={0}
              type="number"
              value={settings.maxRetryInterval}
              onChange={(event) =>
                setSettings((items) => ({
                  ...items,
                  maxRetryInterval: Number(event.target.value),
                }))
              }
            />
            <button
              className="button subtle"
              type="button"
              onClick={() => saveNumber("/max-retry-interval", "maxRetryInterval")}
            >
              保存
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Icon name="logs" size={16} />
            日志保留
          </h3>
        </div>
        <div className="panel-body grid two">
          <div className="field">
            <label htmlFor="logs-max-total-size-mb">logs-max-total-size-mb</label>
            <input
              id="logs-max-total-size-mb"
              min={0}
              type="number"
              value={settings.logsMaxTotalSizeMb}
              onChange={(event) =>
                setSettings((items) => ({
                  ...items,
                  logsMaxTotalSizeMb: Number(event.target.value),
                }))
              }
            />
            <button className="button subtle" type="button" onClick={() => saveNumber("/logs-max-total-size-mb", "logsMaxTotalSizeMb")}>
              保存
            </button>
          </div>
          <div className="field">
            <label htmlFor="error-logs-max-files">error-logs-max-files</label>
            <input
              id="error-logs-max-files"
              min={0}
              type="number"
              value={settings.errorLogsMaxFiles}
              onChange={(event) =>
                setSettings((items) => ({
                  ...items,
                  errorLogsMaxFiles: Number(event.target.value),
                }))
              }
            />
            <button className="button subtle" type="button" onClick={() => saveNumber("/error-logs-max-files", "errorLogsMaxFiles")}>
              保存
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Icon name="layers" size={16} />
            路由策略
          </h3>
        </div>
        <div className="panel-body form-stack">
          <div className="field">
            <label htmlFor="routing-strategy">routing/strategy</label>
            <select
              id="routing-strategy"
              value={settings.routingStrategy}
              onChange={(event) =>
                setSettings((items) => ({ ...items, routingStrategy: event.target.value }))
              }
            >
              <option value="round-robin">round-robin</option>
              <option value="fill-first">fill-first</option>
            </select>
          </div>
          <button className="button primary" type="button" onClick={saveRoutingStrategy}>
            <Icon name="save" size={16} />
            保存路由策略
          </button>
        </div>
      </section>
    </div>
  );
}

interface ToggleRowProps {
  active: boolean;
  label: string;
  note: string;
  onClick: () => void;
}

function ToggleRow({ active, label, note, onClick }: ToggleRowProps) {
  return (
    <div className="toggle-line">
      <div>
        <strong>{label}</strong>
        <div className="faint">{note}</div>
      </div>
      <button className={active ? "switch on" : "switch"} type="button" onClick={onClick} />
    </div>
  );
}
