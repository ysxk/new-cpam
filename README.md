# CPAM WebUI

CPAM WebUI 是 CLIProxyAPI 的管理控制台前端。项目使用 React、TypeScript 和 Vite 构建，并通过 `vite-plugin-singlefile` 输出单文件面板，发布时作为 `management.html` 交给 CLIProxyAPI 远程拉取。

## 功能

- 仪表盘：查看请求量、失败数、Token 用量和运行概览。
- 提供商：管理 Gemini、Claude、Codex、OpenAI Compatibility 等 Provider 配置。
- API Key：查看、添加、编辑和删除访问密钥。
- 认证文件：管理 auth-dir 下的 JSON token 文件，支持上传、下载、删除、禁用、字段编辑和 Vertex 导入。
- OAuth 登录：发起支持的 OAuth 登录流程，并轮询登录状态。
- 配额：按认证文件聚合使用情况，并查询部分 Provider 的实时配额。
- 日志：查看运行日志和请求错误日志。
- YAML 配置：直接查看和保存 CLIProxyAPI 的 YAML 配置。
- 系统设置：管理调试开关、请求统计、日志、代理、重试策略和 WebSocket 认证。

## 技术栈

- React 18
- TypeScript
- Vite 6
- React Router v6
- vite-plugin-singlefile
- LobeHub static SVG icons

## 本地开发

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

开发环境默认会连接本机管理 API：

```text
http://localhost:8317/v0/management
```

如果管理 API 地址或管理密钥不同，可以在页面右上角的设置入口中修改。配置会保存在浏览器 `localStorage`。

## 构建

```bash
npm run build
```

构建产物为：

```text
dist/index.html
```

该文件已经内联 JS 和 CSS，可作为单文件管理面板分发。发布流程会把它重命名为 `management.html`。

计算构建产物 SHA-256：

```bash
npm run hash
```

输出格式：

```text
sha256:<digest>
```

## 发布

项目通过 GitHub Actions 在推送 tag 时自动发布：

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

发布流程会：

1. 安装依赖。
2. 执行 `npm run build`。
3. 将 `dist/index.html` 复制为 `dist/management.html`。
4. 计算 SHA-256 digest。
5. 创建 GitHub Release 并上传 `management.html`。

CLIProxyAPI 可通过以下配置拉取远程管理面板：

```yaml
remote-management:
  panel-github-repository: "https://github.com/ysxk/new-cpam"
```

## 接入此管理面板

CLIProxyAPI 会从 `remote-management.panel-github-repository` 指向的 GitHub Release 中下载 `management.html`，并通过以下地址提供面板：

```text
http://<你的 CPA 地址>:8317/management.html
```

使用本仓库面板时，核心配置如下：

```yaml
remote-management:
  # 从非 localhost 访问管理 API 或面板时需要开启。
  allow-remote: true

  # 必填。为空会禁用整个 /v0/management 管理 API。
  secret-key: "换成你的管理密钥"

  # 必须保持 false，否则 /management.html 会返回 404。
  disable-control-panel: false

  # 使用本仓库发布的 management.html。
  panel-github-repository: "https://github.com/ysxk/new-cpam"
```

如果只在 CPA 所在机器本机访问，可以把 `allow-remote` 改为 `false`。如果通过服务器 IP、域名、反向代理或 Docker 端口映射访问，通常需要设为 `true`。

### Docker 安装的 CPA

Docker 方式不需要改容器镜像，也不需要把本仓库打进镜像。只需要修改宿主机上挂载进容器的配置文件。

官方 Docker 启动示例会把宿主机配置挂载到容器内：

```bash
docker run --rm \
  -p 8317:8317 \
  -v /path/to/your/config.yaml:/CLIProxyAPI/config.yaml \
  -v /path/to/your/auth-dir:/root/.cli-proxy-api \
  eceasy/cli-proxy-api:latest
```

这里要改的是宿主机的：

```text
/path/to/your/config.yaml
```

在该文件里加入或修改：

```yaml
remote-management:
  allow-remote: true
  secret-key: "换成你的管理密钥"
  disable-control-panel: false
  panel-github-repository: "https://github.com/ysxk/new-cpam"
```

然后重启容器：

```bash
docker restart <container-name>
```

如果使用 `docker compose`，同样修改 compose 项目里的 `config.yaml`，然后执行：

```bash
docker compose restart
```

完成后打开：

```text
http://<服务器 IP 或域名>:8317/management.html
```

首次进入页面后，在右上角填入管理密钥，也就是 `remote-management.secret-key` 的值。

### 手动安装的 CPA

手动安装时也不需要改本仓库代码，只需要修改 CPA 实际使用的配置文件。

常见配置文件位置：

- 直接运行二进制：默认读取启动目录下的 `config.yaml`。
- 使用 `--config` 启动：读取命令中指定的文件，例如 `./cli-proxy-api --config /path/to/config.yaml`。
- macOS Homebrew 服务：默认读取 `$(brew --prefix)/etc/cliproxyapi.conf`。
- Linux systemd 或安装脚本：以服务文件里的 `--config` 参数为准；没有 `--config` 时看服务启动目录下的 `config.yaml`。

在实际配置文件中加入或修改：

```yaml
remote-management:
  allow-remote: true
  secret-key: "换成你的管理密钥"
  disable-control-panel: false
  panel-github-repository: "https://github.com/ysxk/new-cpam"
```

如果是本机访问，可以使用：

```yaml
remote-management:
  allow-remote: false
  secret-key: "换成你的管理密钥"
  disable-control-panel: false
  panel-github-repository: "https://github.com/ysxk/new-cpam"
```

修改后重启 CPA。常见方式：

```bash
# systemd 用户服务
systemctl --user restart cli-proxy-api

# Homebrew 服务
brew services restart cliproxyapi

# 直接运行二进制时，停止旧进程后重新启动
./cli-proxy-api --config /path/to/config.yaml
```

然后访问：

```text
http://localhost:8317/management.html
```

如果从另一台机器访问，则使用服务器 IP 或域名：

```text
http://<服务器 IP 或域名>:8317/management.html
```

新版 CPA 使用 `remote-management.allow-remote` 和 `remote-management.secret-key`。如果你的旧版配置仍是 `allow-remote-management`、`remote-management-key` 这类顶层字段，建议先升级 CPA，再使用上面的新版配置。

参考官方文档：

- [Web UI](https://help.router-for.me/cn/management/webui)
- [基础配置](https://help.router-for.me/cn/configuration/basic)
- [Docker 运行](https://help.router-for.me/cn/docker/docker)

## 管理 API

前端通过 `src/api/client.ts` 访问管理 API。默认地址规则：

- 生产环境：当前站点 origin 下的 `/v0/management`
- 本地 Vite 开发：`http://localhost:8317/v0/management`
- 非 HTTP 场景：`http://localhost:8317/v0/management`

管理 API 文档：

```text
https://help.router-for.me/cn/management/api.html
```

## 目录结构

```text
src/
├── api/client.ts              # 管理 API 客户端
├── components/                # 通用组件
├── layouts/MainLayout.tsx     # 侧边栏和顶栏布局
├── pages/                     # 页面
│   ├── Dashboard.tsx
│   ├── Providers.tsx
│   ├── ApiKeys.tsx
│   ├── AuthFiles.tsx
│   ├── OAuthLogin.tsx
│   ├── Quota.tsx
│   ├── Logs.tsx
│   ├── ConfigPage.tsx
│   └── Settings.tsx
└── utils/                     # 格式化和配额查询工具
```
