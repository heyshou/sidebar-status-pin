# Sidebar Status Pin (`sidebar-status-pin`)

**中文** | [English](./README.en.md)

为 **Google Antigravity** 原生左侧边栏提供**单条对话着色高亮、呼吸灯动效与项目内状态置顶**的轻量级全局 Sidecar 插件。

## 核心效果

在**不破坏原生左侧边栏布局**的前提下，严格按**每个项目内部分类排序**（不跨项目混排）：

1. **完成（未查看）** — **绿色高亮条 + 淡绿底色 + `完成` 徽章**
   - 后台任务完成时自动置顶到所属项目最上方。
   - 防止误消：**先点击左侧标题、再点击右侧聊天/输入框区域**后，才会只消除当前这一条的绿色高亮并回落原位，其余未查看对话不受影响。
   - 状态持久化保存在本地 `localStorage`，切换项目或刷新页面不丢失。
2. **询问 / 等待确认** — **橙黄色脉冲高亮条 + 淡橙底色 + `询问` 徽章**
   - 自动识别 `ask_question`、等待输入或权限审批等阻塞步骤，排在「完成」下方、「进行中」上方。
3. **进行中** — **青蓝色呼吸灯竖条 + 淡蓝底色 + `进行中` 徽章**
   - 正在运行的对话实时显示柔和呼吸灯动效，排在「询问」下方。

> 鼠标悬停到对话行时，右侧状态徽章会自动隐藏，不会遮挡原生的重命名、置顶、删除按钮。

---

## 在新电脑上安装

### 方式一：AI 一键安装 Prompt（推荐）

直接打开 **Antigravity**（或 **Codex** 对话框），复制下面这段话发给 AI 即可自动完成下载、安装和调试参数配置：

```text
请帮我从 https://github.com/heyshou/sidebar-status-pin.git 安装 sidebar-status-pin 插件到全局目录，并帮我检查/配置好 Antigravity 的 --remote-debugging-port=0 启动参数。
```

> 安装完成后，**完全退出并重新打开 Antigravity**，在 **Plugins / Customizations** 面板确认启用 **Sidebar Status Pin** 即可。

### 方式二：Git 手动安装（方便后续 `git pull` 更新）

**Windows (PowerShell)：**
```powershell
git clone https://github.com/heyshou/sidebar-status-pin.git "$env:USERPROFILE\.gemini\config\plugins\sidebar-status-pin"
```

**macOS / Linux：**
```bash
git clone https://github.com/heyshou/sidebar-status-pin.git ~/.gemini/config/plugins/sidebar-status-pin
```

### 方式三：网页直接下载 ZIP 安装（无需 Git）

1. 在本仓库页面右上角点击 **Code → Download ZIP** 并解压。
2. 确保 Antigravity 启动参数包含 `--remote-debugging-port=0`（Windows 可右键快捷方式 → 属性 → 目标末尾加 ` --remote-debugging-port=0`；使用 Ghost Proxifier 则在其 `args` 中填入 `--remote-debugging-port=0`）。
3. 运行对应系统的安装脚本：
   - **Windows**：双击运行 `install.bat`
   - **macOS / Linux**：在解压目录打开终端执行：
     ```bash
     chmod +x install.sh && ./install.sh
     ```
4. 完全退出并重新打开 Antigravity（确保带 `--remote-debugging-port=0` 启动），在 **Plugins / Customizations** 面板中确认 **Sidebar Status Pin** 已启用即可生效。

---

## 更新与卸载

- **更新**：
  - 若使用 `git clone` 安装，在插件目录执行 `git pull` 即可。
  - 若使用 ZIP 安装，下载新版覆盖解压后重新运行 `install.bat`（或 `./install.sh`）。
- **卸载**：
  - Windows 可直接双击 `uninstall.bat`，或手动删除 `~/.gemini/config/plugins/sidebar-status-pin` 目录。

---

## 目录结构

```text
sidebar-status-pin/
├── plugin.json                        # 插件清单
├── sidecars/
│   └── sidebar_status/
│       ├── sidecar.json               # Sidecar 进程配置
│       └── main.mjs                   # 状态轮询与 CDP 侧边栏注入逻辑
├── install.bat / install.ps1          # Windows 一键安装脚本
├── install.sh                         # macOS / Linux 一键安装脚本
├── uninstall.bat                      # Windows 卸载脚本
├── README.md                          # 中文说明文档
└── README.en.md                       # English documentation
```

## License

MIT
