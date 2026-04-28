import { useParams } from "react-router-dom";

export default function ReleaseDetail() {
  const { id } = useParams();

  return (
    <div className="release-page">
      <div className="page-header">
        <h1>发布详情: {id}</h1>
      </div>
      <div className="card" style={{ padding: 48, textAlign: "center" }}>
        <p style={{ color: "var(--color-text-secondary)" }}>
          发布详情页 —— 待 API 文档确定后对接
        </p>
      </div>
    </div>
  );
}
