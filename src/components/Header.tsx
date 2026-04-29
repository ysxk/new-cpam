import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  managementApi,
  onManagementSettingsChange,
  readManagementSettings,
  saveManagementSettings,
} from "../api/client";
import Icon from "./Icon";
import "./Header.css";

const titles: Record<string, string> = {
  "/": "仪表盘",
  "/keys": "API Keys",
  "/providers": "提供商",
  "/auth-files": "认证文件",
  "/logs": "日志",
  "/config": "YAML 配置",
  "/settings": "系统设置",
};

export default function Header() {
  const location = useLocation();
  const [settings, setSettings] = useState(readManagementSettings);
  const [draft, setDraft] = useState(settings);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    return onManagementSettingsChange(() => {
      const next = readManagementSettings();
      setSettings(next);
      setDraft(next);
    });
  }, []);

  const pageTitle = useMemo(
    () => titles[location.pathname] ?? "CPAM 管理面板",
    [location.pathname],
  );

  function save(event: FormEvent) {
    event.preventDefault();
    saveManagementSettings(draft);
    setSettings(draft);
    setStatus("已保存");
  }

  async function testConnection() {
    saveManagementSettings(draft);
    setTesting(true);
    setStatus("连接中");
    try {
      await managementApi.getConfig();
      setStatus("连接正常");
      setSettings(draft);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "连接失败");
    } finally {
      setTesting(false);
    }
  }

  function refreshPage() {
    window.dispatchEvent(new Event("cpam-refresh"));
  }

  return (
    <header className="header">
      <div className="header-title-group">
        <h1 className="header-title">{pageTitle}</h1>
        <span className="header-subtitle">CPAM 管理面板</span>
      </div>

      <div className="header-actions">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input placeholder="搜索模型、Key、日志" />
        </div>

        <button className="icon-button" title="刷新当前页" type="button" onClick={refreshPage}>
          <Icon name="refresh" />
        </button>

        <button className="connection-pill" type="button" onClick={() => setOpen((value) => !value)}>
          <span className="status-dot" />
          <span>{settings.baseUrl.replace(/^https?:\/\//, "")}</span>
          <span className={settings.managementKey ? "key-state ready" : "key-state"}>
            {settings.managementKey ? "已配置密钥" : "未配置密钥"}
          </span>
        </button>

        <button className="icon-button" title="通知" type="button">
          <Icon name="bell" />
        </button>
      </div>

      {open && (
        <form className="connection-panel" onSubmit={save}>
          <div className="field">
            <label htmlFor="management-base-url">管理 API 地址</label>
            <input
              id="management-base-url"
              value={draft.baseUrl}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="management-key">管理密钥</label>
            <input
              id="management-key"
              type="password"
              value={draft.managementKey}
              onChange={(event) => setDraft({ ...draft, managementKey: event.target.value })}
            />
          </div>
          <div className="panel-actions">
            <span className="panel-status">{status}</span>
            <button className="button subtle" type="button" onClick={() => setOpen(false)}>
              关闭
            </button>
            <button className="button subtle" disabled={testing} type="button" onClick={testConnection}>
              测试
            </button>
            <button className="button primary" type="submit">
              保存
            </button>
          </div>
        </form>
      )}
    </header>
  );
}
