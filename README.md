<div align="center">
 <img src="public/logo.svg" alt="CozyCLI" width="64" height="64">
 <h1>CozyCLI</h1>
 <p>A cozier web workbench for <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a>, Codex, Cursor CLI and OpenCode sessions.</p>
 <p><b>CozyCLI is a modified version of <a href="https://github.com/siteboon/claudecodeui">CloudCLI UI (https://github.com/siteboon/claudecodeui)</a>.</b><br>
 It is not the original CloudCLI UI and is not affiliated with or endorsed by Siteboon AI B.V.</p>
</div>

<div align="right"><i><b>English</b> · <a href="#中文">中文</a></i></div>

---

## What's different from CloudCLI UI

CozyCLI is built on CloudCLI UI v1.37.10 and keeps all of its features. On top of that, it adds the following:

### Sessions keep running when the UI restarts
- A separate **agent runner** process (`server/runner.ts`) owns every agent process. The Web UI hands runs to it over a unix socket (`AGENT_RUNNER_SOCKET`).
- You can restart or upgrade the UI without killing running sessions. When the UI comes back, it re-adopts live runs and replays missed events.
- If no runner is configured, CozyCLI runs agents in-process exactly as upstream does.

### Session status at a glance
- **A unified status slot** on every session row shows one state, by priority: running › alarm ⏰ › background task › unread › recently active.
- **Unread state is stored on the server**, so it syncs across devices.
- **Status is read from disk** (Claude Code's `~/.claude/sessions/*.json`), so sessions started by other instances or terminals show up too.
- **Alarms** come from ScheduleWakeup, scheduled messages and an optional external long-alarm directory.
- **The Running tab is a flat status view** with Running / Unread / Flagged / All filters.

### Organising projects and sessions
- **Project colors:** colored names, a clickable color dot, and a color stripe on the cross-project recents feed.
- **Session tags** you set yourself, with a sidebar filter.
- Newly created project folders sort to the top. The sidebar opens on the conversations list.

### Layout and navigation
- **A vertical activity bar** (desktop) holds every view and plugin, replacing the top tab pills.
- **A new-session launcher:** pick agent, model, effort and permission mode, then a project (a quick scratch session, an existing project, or a new folder), all in one place.
- **Quick sessions:** start chatting without creating a project first.
- **Previous/next prompt buttons** next to the transcript scrollbar.

### Built-in customisation
- **A usage meter** with configurable sources. New usage plugins only need to return a [standard format](FORK.md#用量面板接入新插件); no code changes needed.
- **Custom chat avatars and assistant display names**, stored on the server.
- Toggles to tidy the sidebar header and footer.

Developer notes, the full list of changed upstream files and the runner protocol are in [FORK.md](FORK.md).

> Note: the UI text of the CozyCLI-specific features is currently Chinese only. i18n PRs are welcome.

## Quick start

CozyCLI is installed from git. It is **not** published to npm.

```bash
git clone https://github.com/zoeysama/CozyCLI.git
cd CozyCLI
npm install
npm run build
npm run server          # http://localhost:3001 (SERVER_PORT / HOST to change)
```

Requires Node.js 22 (see `.nvmrc`) and at least one agent CLI (for example Claude Code) installed and logged in.

### Optional: run the agent runner as a separate service

```bash
export AGENT_RUNNER_SOCKET=$XDG_RUNTIME_DIR/cozycli-runner.sock
npm run runner &        # owns the agent processes
npm run server          # the Web UI; can now be restarted freely
```

[FORK.md](FORK.md) has a systemd example.

### Updating

```bash
git pull && npm install && npm run build
```

Then restart the UI service. Restart the runner only when no session is running.

Data lives in `~/.cloudcli/` (the name is kept for compatibility with CloudCLI UI), so an existing CloudCLI UI install's database keeps working.

## License

CozyCLI is licensed under the **GNU Affero General Public License v3.0 or later**, including the additional terms under Section 7. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

- Original work: CloudCLI UI (https://github.com/siteboon/claudecodeui), Copyright 2025-2026 Siteboon AI B.V. and contributors.
- Modifications: Copyright 2026 zoeysama and CozyCLI contributors.

"CloudCLI" and "Siteboon" are names of their respective owners. They are used here only to describe where this work comes from.

## Acknowledgments

Huge thanks to [Siteboon](https://github.com/siteboon) and all CloudCLI UI contributors. CozyCLI would not exist without their work.

---

## 中文

**CozyCLI 是 [CloudCLI UI (https://github.com/siteboon/claudecodeui)](https://github.com/siteboon/claudecodeui) 的修改版**，基于 v1.37.10。它不是原版 CloudCLI UI，和 Siteboon AI B.V. 没有关联，也没有得到其背书。

在保留原版全部功能的基础上，主要改进如下：

- **会话不随 Web UI 重启而中断**：所有 agent 进程由独立的 runner 进程持有。重启或升级 UI 时，正在跑的会话不受影响。
- **统一的会话状态槽**：一格显示运行中、闹钟、后台任务、未读或最近活动；未读状态存在服务端，各设备同步。运行状态直接读磁盘，其他实例或终端拉起的会话也能看到。
- **Running 标签改为平铺状态视图**，可以按运行中、未读、有标记、全部筛选。
- **项目颜色和会话标签**：项目名上色，会话可以手动打标签，侧边栏可以筛选。
- **竖向活动栏**、**新建会话面板**（一次选好 agent、模型、effort、权限和项目）、**快捷会话**、**上一个/下一个提问导航**。
- **内置用量面板**（用量来源可配置）、**自定义聊天头像和助手名称**、侧边栏精简开关。

安装和更新方法见上面的 Quick start，开发者文档见 [FORK.md](FORK.md)。本项目采用 AGPL-3.0-or-later 协议，并遵守上游 LICENSE 第 7 条的附加条款。
