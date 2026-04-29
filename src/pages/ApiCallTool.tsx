import { useState } from "react";
import { ApiCallResult, managementApi } from "../api/client";
import Icon from "../components/Icon";

function textToHeaders(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.includes(":") ? ":" : "=";
        const [key, ...rest] = line.split(separator);
        return [key.trim(), rest.join(separator).trim()] as const;
      })
      .filter(([key, entryValue]) => key && entryValue),
  );
}

function formatHeaders(headers: Record<string, string[]>): string {
  return Object.entries(headers)
    .map(([key, values]) => `${key}: ${values.join(", ")}`)
    .join("\n");
}

export default function ApiCallTool() {
  const [authIndex, setAuthIndex] = useState("");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("Authorization: Bearer $TOKEN$\nContent-Type: application/json");
  const [data, setData] = useState("");
  const [result, setResult] = useState<ApiCallResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendRequest() {
    if (!authIndex.trim() || !url.trim()) {
      setError("auth_index 和 URL 不能为空");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await managementApi.apiCall({
          auth_index: authIndex.trim(),
          method,
          url: url.trim(),
          header: textToHeaders(headers),
          data: data.trim() ? data : undefined,
        }),
      );
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : "API 调用失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>API 调用</h2>
          <p>通过后端 /api-call 使用指定 auth_index 的 token 直接请求上游接口。</p>
        </div>
        <button className="button primary" disabled={loading} type="button" onClick={sendRequest}>
          <Icon name="activity" size={16} />
          发送
        </button>
      </div>

      {error && <div className="error-state">{error}</div>}

      <div className="grid sidebar-layout">
        <section className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="code" size={16} />
              请求
            </h3>
          </div>
          <div className="panel-body form-stack">
            <div className="field-row">
              <div className="field">
                <label htmlFor="api-call-auth-index">auth_index</label>
                <input
                  id="api-call-auth-index"
                  placeholder="认证文件列表中的 auth_index"
                  value={authIndex}
                  onChange={(event) => setAuthIndex(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="api-call-method">method</label>
                <select id="api-call-method" value={method} onChange={(event) => setMethod(event.target.value)}>
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="api-call-url">URL</label>
              <input
                id="api-call-url"
                placeholder="https://api.example.com/..."
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="api-call-headers">Headers，每行 Key: Value，可用 $TOKEN$ 占位</label>
              <textarea
                id="api-call-headers"
                value={headers}
                onChange={(event) => setHeaders(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="api-call-body">Body</label>
              <textarea
                id="api-call-body"
                className="code-editor"
                value={data}
                onChange={(event) => setData(event.target.value)}
              />
            </div>
          </div>
        </section>

        <aside className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Icon name="logs" size={16} />
              响应
            </h3>
            {result && <span className={result.statusCode >= 200 && result.statusCode < 300 ? "badge ok" : "badge danger"}>{result.statusCode}</span>}
          </div>
          <div className="panel-body form-stack">
            <div className="field">
              <label htmlFor="api-call-response-headers">响应 Headers</label>
              <textarea
                id="api-call-response-headers"
                className="compact-textarea mono"
                readOnly
                value={result ? formatHeaders(result.header) : ""}
              />
            </div>
            <div className="field">
              <label htmlFor="api-call-response-body">响应 Body</label>
              <textarea
                id="api-call-response-body"
                className="code-editor"
                readOnly
                value={result?.bodyText ?? ""}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
