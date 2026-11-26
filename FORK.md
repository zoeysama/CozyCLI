# CozyCLI 改动说明（开发者文档）

CozyCLI 基于上游 [CloudCLI UI](https://github.com/siteboon/claudecodeui) v1.37.10 修改而来。改动上游文件的地方都加了 `CozyCLI:` 注释，用 `git grep -n "CozyCLI:"` 可以全部找出来。

## 新增模块（上游没有，rebase 时不会冲突）

- `server/modules/workbench/`：`/api/workbench/*` 接口，负责项目标识、会话标签、界面定制设置、快捷会话、会话状态和闹钟。数据存在 `auth.db` 中新增的 `workbench_*` 表里，首次使用时自动建表，不改动上游已有的表。
- `server/modules/agent-runner/` 和 `server/runner.ts`：独立的 agent runner 进程，见下文。
- `src/modules/workbench/`：全部前端逻辑，包括 context、竖向 ActivityBar、徽标、标签、筛选、用量面板、新建会话面板、状态槽、提问导航和各个对话框。
- `src/modules/project-workspace/WorkbenchHostBridge.tsx`：把工作区状态传给 workbench 模块。

## 接线点（改动上游文件的地方，rebase 冲突只会出在这里）

| 文件 | 改动 |
|---|---|
| `server/index.ts` | 挂载 `/api/workbench`；设置了 `AGENT_RUNNER_SOCKET` 时改用 runner gateway |
| `server/modules/plugins/plugin-registry.service.ts` | 支持用 `CLOUDCLI_PLUGINS_HOME` 环境变量覆盖插件目录 |
| `src/modules/project-workspace/ProjectWorkspaceShell.tsx` | 外面包一层 bridge，插入 ActivityBar |
| `src/modules/project-workspace/WorkspaceHeader.tsx` | 竖栏开启时，桌面端隐藏顶部标签栏 |
| `src/modules/project-workspace/WorkspaceTitle.tsx` | 项目名上色 |
| `src/modules/project-workspace/ProjectMainRegion.tsx` | 桌面端点"新建会话"或没有选中项目时，主区域显示新建会话面板 |
| `src/modules/chat/transcript/MessageComponent.tsx` | 自定义聊天头像和助手显示名 |
| `src/modules/chat/transcript/ChatMessagesPane.tsx` | 用户消息行加提问起点标记；滚动条旁加"上一个/下一个提问"按钮 |
| `src/modules/sidebar/*` | 新建按钮、筛选栏、用量面板、标签 chip、项目颜色、统一状态槽、Running 平铺视图、排序调整 |

另外还改了品牌：界面名称、页面标题、logo、`package.json` 改为 CozyCLI；关于页加了上游归属声明；应用内"自更新"只走 git，不会再安装上游的 npm 包。内部名称没改，比如 `~/.cloudcli` 数据目录和 `CLOUDCLI_*` 环境变量，这样能和已有数据兼容，以后同步上游也更容易。

## agent-runner：会话进程与 Web UI 解耦

- `server/runner.ts` 是单独的进程，所有 provider run（也就是所有 agent 子进程）都由它持有。
- Web UI 服务设置了 `AGENT_RUNNER_SOCKET` 后，聊天和定时消息的 run 都通过这个 unix socket 交给 runner；不设置时和上游一样在进程内运行。
- 协议是换行分隔的 JSON，定义在 `server/modules/agent-runner/agent-runner.protocol.ts`。
- UI 重启后会重新连上 runner，runner 在 hello 消息里报告还在跑的 run，UI 把它们重新登记，浏览器里仍然显示"运行中"。断线期间积压的事件会补发。
- 侧问、`/api/agent`、生成 git 提交信息这类很快就结束的调用，仍然留在 UI 进程里。
- runner 连不上时，UI 退回进程内运行，但这样启动的 run 撑不过 UI 重启。
- 升级：只改了前端或 UI 侧代码时，只需重启 UI 服务；改到 `server/modules/providers/**` 或 agent-runner 时，要重启 runner，而重启 runner 会断开正在跑的 agent。

部署示例（systemd 用户服务，路径请自行调整）：

```ini
# ~/.config/systemd/user/cozycli-runner.service
[Service]
WorkingDirectory=%h/CozyCLI
Environment=AGENT_RUNNER_SOCKET=%t/cozycli-runner.sock
ExecStart=/usr/bin/node dist-server/server/runner.js
Restart=on-failure

# ~/.config/systemd/user/cozycli.service
[Service]
WorkingDirectory=%h/CozyCLI
Environment=AGENT_RUNNER_SOCKET=%t/cozycli-runner.sock
ExecStart=/usr/bin/node dist-server/server/index.js
Restart=on-failure
```

## 会话状态槽

- 位置在会话行颜色竖条右边，宽度固定。按优先级只显示一个状态：运行中（蓝色转圈）> 闹钟（⏰；同时有未读时变成琥珀色）> 后台任务（紫色转圈）> 未读（琥珀色圆点）> 最近活动（绿色圆点，默认关闭）。
- 侧边栏的 Running 标签改成平铺的状态视图，可以按 运行中 / 未读 / 有标记 / 全部 筛选。
- 未读的判断：会话最后活动时间晚于上次查看它的时间。查看时间存在服务端的 `workbench_session_views` 表里，所以各设备同步。
- 运行/后台状态除了看前端自己的运行记录，还会读服务端的 `/api/workbench/session-status`。服务端直接读 Claude Code 的 `~/.claude/sessions/*.json`，所以其他实例或终端拉起的进程也能显示。
- 闹钟来源：会话里最近一次 ScheduleWakeup（进程还活着时才算）、CloudCLI 的定时消息，以及可选的外部长闹钟目录 `~/.local/state/agent-wake/pending/*.json`。最后这个目录不存在就自动跳过。文件格式为 `{"session": "<claude session id>", "at": <epoch 秒>}`。

## 用量面板接入新插件

在"界面定制 → 用量面板 → 添加用量来源"里填写名称、插件名、RPC 路由、颜色和解析方式，不用改代码。插件路由按下面任一种标准格式返回即可：

```json
{ "h5": 12, "d7": 40, "h5ResetAt": "2026-11-26T16:00:00Z", "d7ResetAt": 1795800000 }
{ "windows": [ { "window": "5h", "usedPercent": 12, "resetsAt": "…" }, { "window": "7d", "usedPercent": 40, "resetsAt": "…" } ] }
```

- 百分比指已用比例，取值 0–100。
- 重置时间可以是 ISO 字符串，也可以是 epoch 秒或毫秒。
- 返回结果外面包一层 `data` 之类的信封也能识别。
- 代码位置：`src/modules/workbench/utils/usageSources.ts`、`usageParsers.ts`。

## 聊天头像

- 图片在前端缩小到最长边 256px 后，存进 `auth.db` 的 `workbench_avatars` 表，所以各设备同步。名称、缩放和位置存在 workbench 设置里。
- 支持导入 "CloudCLI Chat Avatars" 油猴脚本（`.user.js`）里的图片、名称、缩放和位置。

## 测试实例

用 `CLOUDCLI_PLUGINS_HOME` 指向另一个插件目录，再配上独立的数据库和端口，就能起一个和正式实例互不干扰的测试实例。

## 已知情况

- 新增功能的界面文字目前只有中文，还没接入 i18n，欢迎提 PR。
- 在"对话"列表里按标签筛选，只作用于已经加载出来的那一页会话。
- 移动端的会话行保持上游原样。
- 环境里设置了 `CLAUDE_CLI_PATH` 时，`server/shared/tests/claude-cli-path.test.ts` 会失败；用 `env -u CLAUDE_CLI_PATH npm test` 运行即可。
