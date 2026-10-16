# 工作偏好管理

维护与二次开发：**hyz**。

一个在本机运行的场景化工作偏好框架，供 Claude Code、Codex 等编程助手采集、管理和检索可复用的工作方法。每位使用者独立配置模型、独立保存自己的数据；克隆仓库不会带入其他人的偏好或会话。

## 环境准备

- Node.js 20.9+（包含 npm）、Git。
- Python 3.12+ 与 uv；安装器也包含依赖准备流程，首次安装需要联网。
- 已安装并登录 Codex CLI 或 Claude Code；后台提炼使用所选 CLI 的模型配置。
- Windows 安装 Git for Windows，确保 Git Bash 可用。若 ONNX Runtime 提示缺少运行库，安装 Microsoft Visual C++ x64 Redistributable。

## 安装

先使用拥有仓库权限的 GitHub 账号克隆：

```powershell
gh repo clone lianshangyou/scene-memory
cd scene-memory
node bin/claude-smart.js install --host claude-code,codex --backend local --provider codex
```

仅使用一个助手时，把 `--host` 改成 `codex` 或 `claude-code`。希望通过 Claude 提炼时，把 `--provider codex` 改为 `--provider claude-code`。也可以运行交互安装：

```powershell
node bin/claude-smart.js install
```

按提示选择本地模式、宿主、后台提炼模型和共享范围。安装后重启对应助手，并新建会话，使插件和 hook 配置有机会加载。**从本仓库运行安装器，不使用 `npx claude-smart` 安装，以免安装成上游 npm 分发包。**

安装会将运行副本放在用户目录。更换已有安装前，请先备份自己的 `~/.claude-smart` 和 `~/.reflexio`；它们不是仓库的一部分。已有后端配置会保留，不自动覆盖成空白配置。

## 日常使用

管理页：<http://127.0.0.1:3001/preferences>。本地后端默认端口为 8071，向量服务默认端口为 8072。

默认场景包括通用协作与工具、新增需求、修改需求、写 PRD、输出原型、写工作日报、写今日计划、写今日产出。一条偏好可以关联多个场景，项目适用范围单独设置；不同工作类型可以扩展场景。

- **采集与提炼**：在实际触发插件 hook 的宿主中正常聊天，后台按窗口和判断规则处理新增交互；不是每条消息都调用模型，也不是固定分钟必定提炼。
- **明确偏好**：可复用的长期要求可成为生效偏好；推断和冲突进入待确认，不把单页修改、项目事实或助手建议直接当作通用习惯。
- **编辑与确认**：在场景卡片中修改结论、场景与范围。手动版本受保护，自动冲突不会直接覆盖。
- **删除与恢复**：删除后停止检索并保存语义排除；同义判断仍可能有误差。需要恢复时使用已删除列表。
- **检索与应用**：通过宿主支持的答复前 hook 提供相关偏好。是否执行 hook 取决于实际宿主与会话，须用真实新会话验证。

只记录结论，不要求偏好卡片展示原话或会话位置。首次本地后端启动会为无既有配置的安装启用场景提炼，关闭独立 playbook 提炼和优化器。

## Codex VS Code 使用边界

VS Code 扩展的会话可写入 Codex 本机会话目录，但本框架当前没有独立的共享会话目录增量采集器。**会话文件存在，不等于插件已经采集；管理页已有偏好，也不等于当前 IDE 请求已经获得偏好。**

应先新建会话验证宿主 hook 的实际执行、采集和检索。若没有触发，不应把它当作已自动接入。不要为此反复导入全部历史会话。

## 常用操作

Windows 可在 Git Bash 中运行（macOS/Linux 使用 Bash）：

```bash
bash ~/.reflexio/plugin-root/scripts/dashboard-open.sh
bash ~/.reflexio/plugin-root/scripts/backend-service.sh status
bash ~/.reflexio/plugin-root/scripts/dashboard-service.sh status
bash ~/.reflexio/plugin-root/scripts/cli.sh show
```

Claude Code 可使用 `/claude-smart:show`、`/claude-smart:learn` 和 `/claude-smart:dashboard`。手动学习会调用配置的模型服务；日常使用不需要每轮执行命令。

## 数据与配置

| 位置 | 用途 |
| --- | --- |
| `~/.claude-smart/.env` | 当前用户的模型桥接、宿主与连接配置 |
| `~/.claude-smart/sessions/` | 插件本地会话缓冲 |
| `~/.reflexio/configs/config_claude-smart.json` | 后端提炼与存储配置 |
| `~/.reflexio/data/` | 当前用户的数据库与偏好 |

这些数据保存在使用者自己的电脑，不随源码分享。会话及工具输出可能以本地明文保存；后台提炼会调用所选模型服务，产生用量，并可能向该服务发送相关内容。仓库不包含任何账号、令牌或预填模型凭据。

## 本地开发

修改后端位于 `plugin/src/claude_smart` 和 `plugin/vendor/reflexio`，管理页位于 `plugin/dashboard`。

```powershell
cd plugin/dashboard
npm ci
npm run build
```

修改仓库源码不会自动更新用户目录里的运行副本；需要从仓库重新运行安装器，再检查服务实际使用的路径。已有偏好数据应先备份。不要用上游自动更新覆盖本仓库的定制代码。

本地编辑、构建和安装不会自动提交或推送到 GitHub。发布由维护者明确执行。

离线后端检查（先准备 Python 依赖，在 Bash 中执行）：

```bash
PYTHONPATH=plugin/vendor/reflexio:plugin/src plugin/.venv/bin/python -m unittest discover -s tests -v
```

Windows 使用 `plugin/.venv/Scripts/python.exe`，`PYTHONPATH` 的两个目录用分号分隔。测试只使用临时数据库，不调用模型。

## 来源与许可证

基于 claude-smart 与 Reflexio 二次开发，维护署名为 hyz。上游来源、Apache-2.0 许可证和第三方版权声明见 [NOTICE](NOTICE)、[LICENSE](LICENSE) 及各组件许可证。
