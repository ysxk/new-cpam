import { useEffect, useState } from "react";
import { downloadBrowserFile, ErrorLogFile, managementApi } from "../api/client";
import Icon from "../components/Icon";
import { formatBytes, formatDate, formatNumber } from "../utils/format";

function isFileLoggingDisabled(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("logging to file disabled");
}

export default function Logs() {
  const [lines, setLines] = useState<string[]>([]);
  const [lineCount, setLineCount] = useState(0);
  const [latestTimestamp, setLatestTimestamp] = useState(0);
  const [errorLogs, setErrorLogs] = useState<ErrorLogFile[]>([]);
  const [selectedErrorLog, setSelectedErrorLog] = useState<ErrorLogFile | null>(null);
  const [selectedErrorLogContent, setSelectedErrorLogContent] = useState("");
  const [loadingSelectedErrorLog, setLoadingSelectedErrorLog] = useState(false);
  const [logsDisabled, setLogsDisabled] = useState(false);
  const [loggingToFile, setLoggingToFile] = useState(false);
  const [requestLog, setRequestLog] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadToggles() {
    const [fileLogging, requestLogging] = await Promise.allSettled([
      managementApi.getBooleanSetting("/logging-to-file", "logging-to-file"),
      managementApi.getBooleanSetting("/request-log", "request-log"),
    ]);
    if (fileLogging.status === "fulfilled") {
      setLoggingToFile(fileLogging.value);
      setLogsDisabled(!fileLogging.value);
    }
    if (requestLogging.status === "fulfilled") {
      setRequestLog(requestLogging.value);
    }
  }

  async function loadLogs(incremental = false) {
    setError("");
    try {
      const response = await managementApi.getLogs(incremental ? latestTimestamp : undefined, incremental ? 200 : 600);
      const nextLines = response.lines ?? [];
      setLines((items) => (incremental ? [...items, ...nextLines].slice(-600) : nextLines));
      setLineCount(response["line-count"] ?? nextLines.length);
      setLatestTimestamp(response["latest-timestamp"] ?? latestTimestamp);
      setLogsDisabled(false);
    } catch (loadError) {
      if (isFileLoggingDisabled(loadError)) {
        setLogsDisabled(true);
        setLines([]);
        setLineCount(0);
        setLatestTimestamp(0);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "读取日志失败");
    }
  }

  async function loadErrorLogs() {
    try {
      setErrorLogs(await managementApi.getErrorLogs());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取错误请求日志失败");
    }
  }

  async function loadAll() {
    await loadToggles();
    await Promise.all([loadLogs(false), loadErrorLogs()]);
  }

  useEffect(() => {
    void loadAll();
    const refresh = () => void loadAll();
    window.addEventListener("cpam-refresh", refresh);
    return () => window.removeEventListener("cpam-refresh", refresh);
  }, []);

  useEffect(() => {
    if (!live) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void loadLogs(true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [live, latestTimestamp]);

  async function setToggle(path: string, key: string, value: boolean) {
    await managementApi.setValue(path, value);
    if (key === "logging-to-file") {
      setLoggingToFile(value);
      setLogsDisabled(!value);
      if (!value) {
        setLines([]);
        setLineCount(0);
        setLatestTimestamp(0);
      } else {
        void loadLogs(false);
      }
    } else {
      setRequestLog(value);
    }
    setMessage("设置已保存");
  }

  async function clearLogs() {
    if (!window.confirm("清空当前日志文件和轮转日志？")) {
      return;
    }
    const result = await managementApi.clearLogs();
    setLines([]);
    setLineCount(0);
    setLatestTimestamp(0);
    setMessage(result.message ?? "日志已清空");
    await loadErrorLogs();
  }

  async function downloadErrorLog(file: ErrorLogFile) {
    const blob = await managementApi.downloadErrorLog(file.name);
    downloadBrowserFile(blob, file.name);
  }

  async function viewErrorLog(file: ErrorLogFile) {
    setSelectedErrorLog(file);
    setSelectedErrorLogContent("");
    setLoadingSelectedErrorLog(true);
    setError("");
    try {
      const blob = await managementApi.downloadErrorLog(file.name);
      setSelectedErrorLogContent(await blob.text());
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : "读取错误请求日志失败");
    } finally {
      setLoadingSelectedErrorLog(false);
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>日志</h2>
          <p>查看文件日志、请求错误日志，并控制文件日志与请求日志开关。</p>
        </div>
        <div className="actions">
          <button className={live ? "button primary" : "button"} type="button" onClick={() => setLive((value) => !value)}>
            <Icon name="activity" size={16} />
            {live ? "停止实时" : "实时跟随"}
          </button>
          <button className="button" type="button" onClick={() => loadLogs(false)}>
            <Icon name="refresh" size={16} />
            刷新
          </button>
          <button className="button danger" disabled={!loggingToFile} type="button" onClick={clearLogs}>
            <Icon name="trash" size={16} />
            清空
          </button>
        </div>
      </div>

      {error && <div className="error-state">{error}</div>}
      {message && <div className="empty-state">{message}</div>}

      <div className="grid two">
        <div className="toggle-line">
          <div>
            <strong>文件日志</strong>
            <div className="faint">GET /logs 依赖该开关</div>
          </div>
          <button
            className={loggingToFile ? "switch on" : "switch"}
            type="button"
            onClick={() => setToggle("/logging-to-file", "logging-to-file", !loggingToFile)}
          />
        </div>
        <div className="toggle-line">
          <div>
            <strong>请求日志</strong>
            <div className="faint">关闭后可查看 request-error-logs</div>
          </div>
          <button
            className={requestLog ? "switch on" : "switch"}
            type="button"
            onClick={() => setToggle("/request-log", "request-log", !requestLog)}
          />
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">
              <Icon name="logs" size={16} />
              运行日志
            </h3>
            <p className="panel-subtitle">
              扫描 {formatNumber(lineCount)} 行，latest-timestamp {latestTimestamp || 0}
            </p>
          </div>
          <span className={live ? "badge ok" : "badge"}>{live ? "live" : "paused"}</span>
        </div>
        <div className="panel-body">
          <div className="log-viewer">
            {logsDisabled ? (
              <div className="log-line">文件日志未开启，开启后可查看运行日志。</div>
            ) : lines.length === 0 ? (
              <div className="log-line">暂无日志</div>
            ) : (
              lines.map((line, index) => (
                <div className="log-line" key={`${index}-${line.slice(0, 24)}`}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Icon name="file" size={16} />
            请求错误日志
          </h3>
          <button className="button subtle" type="button" onClick={loadErrorLogs}>
            <Icon name="refresh" size={16} />
            刷新列表
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>文件名</th>
                <th>大小</th>
                <th>修改时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {errorLogs.map((file) => (
                <tr key={file.name}>
                  <td className="mono">{file.name}</td>
                  <td>{formatBytes(file.size)}</td>
                  <td>{formatDate(file.modified)}</td>
                  <td>
                    <div className="actions">
                      <button className="icon-button" title="查看" type="button" onClick={() => viewErrorLog(file)}>
                        <Icon name="file" />
                      </button>
                      <button className="icon-button" title="下载" type="button" onClick={() => downloadErrorLog(file)}>
                        <Icon name="download" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {errorLogs.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">暂无错误请求日志</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedErrorLog && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel log-modal" role="dialog" aria-modal="true" aria-labelledby="error-log-modal-title">
            <div className="modal-header">
              <div>
                <h3 id="error-log-modal-title">请求错误日志</h3>
                <p className="panel-subtitle">
                  <span className="mono">{selectedErrorLog.name}</span>
                  {" · "}
                  {formatBytes(selectedErrorLog.size)}
                </p>
              </div>
              <button className="icon-button" title="关闭" type="button" onClick={() => setSelectedErrorLog(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal-body form-stack">
              <div className="actions">
                <button className="button subtle" type="button" onClick={() => viewErrorLog(selectedErrorLog)}>
                  <Icon name="refresh" size={16} />
                  重新读取
                </button>
                <button className="button" type="button" onClick={() => downloadErrorLog(selectedErrorLog)}>
                  <Icon name="download" size={16} />
                  下载
                </button>
              </div>
              <div className="log-viewer request-log-viewer">
                {loadingSelectedErrorLog ? (
                  <div className="log-line">读取中...</div>
                ) : selectedErrorLogContent ? (
                  selectedErrorLogContent.split("\n").map((line, index) => (
                    <div className="log-line" key={`${index}-${line.slice(0, 24)}`}>
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="log-line">暂无内容</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
