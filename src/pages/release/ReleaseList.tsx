import { Link } from "react-router-dom";
import "./ReleaseList.css";

export default function ReleaseList() {
  return (
    <div className="release-page">
      <div className="page-header">
        <h1>发布管理</h1>
        <Link to="/releases/create" className="btn-primary">
          新建发布
        </Link>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>版本</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="table-empty">
                暂无发布记录，API 接入后即可查看
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
