import { useEffect, useState } from "react";
import { managementApi } from "../api/client";
import Icon from "../components/Icon";
import { maskSecret } from "../utils/format";

export default function ApiKeys() {
  const [keys, setKeys] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadKeys() {
    setLoading(true);
    setError("");
    try {
      setKeys(await managementApi.getApiKeys());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载下游接入点失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadKeys();
    const refresh = () => void loadKeys();
    window.addEventListener("cpam-refresh", refresh);
    return () => window.removeEventListener("cpam-refresh", refresh);
  }, []);

  async function addKey() {
    const value = draft.trim();
    if (!value) {
      return;
    }
    const next = [...keys, value];
    await managementApi.putApiKeys(next);
    setDraft("");
    setMessage("已新增下游接入点");
    await loadKeys();
  }

  async function saveEdit(index: number) {
    const value = editingValue.trim();
    if (!value) {
      return;
    }
    await managementApi.patchApiKey(index, value);
    setEditingIndex(null);
    setEditingValue("");
    setMessage("已更新下游接入点");
    await loadKeys();
  }

  async function removeKey(index: number) {
    if (!window.confirm("删除这个下游接入点？")) {
      return;
    }
    await managementApi.deleteApiKey(index);
    setMessage("已删除下游接入点");
    await loadKeys();
  }

  async function replaceAll() {
    await managementApi.putApiKeys(keys.map((item) => item.trim()).filter(Boolean));
    setMessage("已保存完整列表");
    await loadKeys();
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>下游接入点</h2>
          <p>这些 Key 用于下游客户端接入 CPAM 代理服务。</p>
        </div>
        <div className="actions">
          <button className="button" disabled={loading} type="button" onClick={loadKeys}>
            <Icon name="refresh" size={16} />
            刷新
          </button>
          <button className="button primary" type="button" onClick={replaceAll}>
            <Icon name="save" size={16} />
            保存列表
          </button>
        </div>
      </div>

      {error && <div className="error-state">{error}</div>}
      {message && <div className="empty-state">{message}</div>}

      <div className="grid sidebar-layout">
        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="key" size={16} />
              接入点 Key 列表
            </h3>
            <span className="badge">{keys.length} 个</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>序号</th>
                  <th>Key</th>
                  <th>编辑值</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key, index) => (
                  <tr key={`${key}-${index}`}>
                    <td>{index + 1}</td>
                    <td className="mono">{maskSecret(key)}</td>
                    <td>
                      {editingIndex === index ? (
                        <input
                          autoFocus
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.target.value)}
                        />
                      ) : (
                        <span className="faint">点击编辑后显示输入框</span>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        {editingIndex === index ? (
                          <>
                            <button className="icon-button" title="保存" type="button" onClick={() => saveEdit(index)}>
                              <Icon name="check" />
                            </button>
                            <button className="icon-button" title="取消" type="button" onClick={() => setEditingIndex(null)}>
                              <Icon name="x" />
                            </button>
                          </>
                        ) : (
                          <button
                            className="icon-button"
                            title="编辑"
                            type="button"
                            onClick={() => {
                              setEditingIndex(index);
                              setEditingValue(key);
                            }}
                          >
                            <Icon name="edit" />
                          </button>
                        )}
                        <button className="icon-button" title="删除" type="button" onClick={() => removeKey(index)}>
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {keys.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">暂无下游接入点</div>
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
              <Icon name="plus" size={16} />
              新增接入点
            </h3>
          </div>
          <div className="panel-body form-stack">
            <div className="field">
              <label htmlFor="new-api-key">接入 Key</label>
              <input
                id="new-api-key"
                placeholder="输入下游客户端使用的接入 Key"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </div>
            <button className="button primary" type="button" onClick={addKey}>
              <Icon name="plus" size={16} />
              添加
            </button>
            <div className="empty-state">
              删除与编辑会立即调用管理 API；完整保存会用当前列表替换服务端列表。
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
