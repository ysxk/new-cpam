import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ReleaseCreate.css";

export default function ReleaseCreate() {
  const navigate = useNavigate();
  const [version, setVersion] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: 接入 API 后实现
    navigate("/releases");
  };

  return (
    <div className="release-page">
      <div className="page-header">
        <h1>新建发布</h1>
      </div>

      <form className="card release-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">版本号</label>
          <input
            className="form-input"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="例: v1.0.0"
          />
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/releases")}
          >
            取消
          </button>
          <button type="submit" className="btn-primary">
            创建发布
          </button>
        </div>
      </form>
    </div>
  );
}
