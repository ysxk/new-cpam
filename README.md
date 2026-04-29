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
