import "./Dashboard.css";

export default function Dashboard() {
  return (
    <div className="dashboard">
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">--</div>
          <div className="stat-label">运行中版本</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">--</div>
          <div className="stat-label">发布总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">--</div>
          <div className="stat-label">待审核</div>
        </div>
      </div>
    </div>
  );
}
