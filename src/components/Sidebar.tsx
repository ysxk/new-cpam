import { NavLink } from "react-router-dom";
import Icon, { IconName } from "./Icon";
import "./Sidebar.css";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const navItems: NavItem[] = [
  { to: "/", label: "仪表盘", icon: "activity" },
  { to: "/providers", label: "提供商", icon: "layers" },
  { to: "/keys", label: "下游接入点", icon: "key" },
  { to: "/auth-files", label: "认证文件", icon: "shield" },
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
        <div className="brand-mark">C</div>
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
