# Windows 安装与使用

## 最简单的方式：独立 Edge 会话

1. 安装 Node.js 22 或更新版本。
2. 解压 Release 中的 `universal-browser-windows-portable.zip`。
3. 双击 `install.cmd`。
4. 安装程序会自动配置 Codex MCP 并安装 Skill；完成后重启一次 Codex。
5. 以后直接向智能体提出浏览器任务。智能体会自动寻找并连接浏览器，MCP 会自动启动本地服务；不需要先打开 Dashboard。

这种方式使用独立浏览器资料目录，不会修改日常 Edge 的登录资料。

## 使用已有登录状态

先双击 `connect-existing-browser.cmd`，再按窗口提示完成以下一次性步骤：

1. 打开 `edge://extensions` 或 `chrome://extensions`。
2. 开启“开发人员模式”。
3. 选择“加载解压缩的扩展”，选择项目中的 `extension` 文件夹。
4. 复制扩展 ID。
5. 把扩展 ID 粘贴回安装窗口，然后重启一次浏览器。

Firefox 需要先把 `extension/manifest.firefox.json` 复制为 `extension/manifest.json`，再临时加载或签名发布。

## 接入 AI

Codex 已由安装程序自动接入。其他客户端可使用生成的 `%LOCALAPPDATA%\UniversalBrowser\mcp-config.json`，或连接本地 MCP 地址 `http://127.0.0.1:3210/mcp`。

Agent 在点击、输入或导航前必须取得控制权。遇到 CAPTCHA、付款、删除或人工接管时，自动操作会暂停。

## 诊断

```powershell
powershell -File scripts/diagnose-windows.ps1
```

如果朋友不熟悉命令行，优先让其使用 `setup.cmd` 和 `start.cmd`。

## 更新与卸载

- 下载并解压新版本，双击其中的 `update.cmd`。
- 双击 `uninstall.cmd` 可删除程序、Skill、原生消息注册和安装程序写入的 Codex MCP 配置；修改前会保存配置备份。
