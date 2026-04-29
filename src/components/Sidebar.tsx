import { NavLink } from "react-router-dom";
import Icon, { IconName } from "./Icon";
import LogoMark from "./LogoMark";
import "./Sidebar.css";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const navItems: NavItem[] = [
  { to: "/", label: "仪表盘", icon: "activity" },
  { to: "/providers", label: "提供商", icon: "layers" },
  { to: "/ampcode", label: "AmpCode", icon: "code" },
  { to: "/keys", label: "API Key", icon: "key" },
  { to: "/auth-files", label: "认证文件", icon: "shield" },
  { to: "/models", label: "模型", icon: "layers" },
  { to: "/api-call", label: "API 调用", icon: "code" },
  { to: "/oauth", label: "OAuth 登录", icon: "shield" },
  { to: "/quota", label: "配额", icon: "activity" },
  { to: "/logs", label: "日志", icon: "logs" },
  { to: "/config", label: "YAML 配置", icon: "code" },
  { to: "/settings", label: "系统设置", icon: "settings" },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <LogoMark size={34} />
        </div>
        <div>
          <strong>CPAM</strong>
          <span>CLIProxyAPI</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
            end={item.to === "/"}
            to={item.to}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="footer-label">管理 API</span>
        <span className="footer-value">/v0/management</span>
      </div>
    </aside>
  );
}
