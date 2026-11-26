# Sidebar Status Pin (`sidebar-status-pin`)

[中文](./README.md) | **English**

A lightweight global Sidecar plugin for **Google Antigravity** that adds **per-conversation status highlights, breathing-light indicators, and per-project priority sorting** directly inside the native left sidebar.

## Features

Without breaking the native sidebar layout, conversations are **sorted strictly within their own project** (never mixed across projects) in the following order:

1. **Done (Unread)** — **Green highlight bar + soft green tint + `完成` badge**
   - Automatically pinned to the top of its own project when a background task finishes.
   - Accidental-clear protection: only clears and returns to its normal position after you **first click the conversation title in the sidebar, and then click inside the chat/composer area**. Other unread conversations stay untouched.
   - Persisted in `localStorage` so unread highlights survive project switches and reloads.
2. **Asking / Waiting for Confirmation** — **Amber pulsing bar + soft amber tint + `询问` badge**
   - Detects `ask_question`, input prompts, and approval steps; pinned right below Done and above Running.
3. **Running** — **Cyan breathing-light bar + soft blue tint + `进行中` badge**
   - Live breathing animation while the agent is actively working; pinned below Asking.

> Hovering over a row automatically hides the right-side status badge so native action buttons (rename/pin/delete) remain unobstructed.

---

## Installation on Another Computer

### Option 1: One-Click AI Prompt (Recommended)

Open **Antigravity** (or **Codex**) and send this prompt to the AI:

```text
Please install the sidebar-status-pin plugin globally from https://github.com/heyshou/sidebar-status-pin.git and check/configure Antigravity's --remote-debugging-port=0 launch flag for me.
```

> After installation, **fully quit and reopen Antigravity**, then make sure **Sidebar Status Pin** is enabled in **Plugins / Customizations**.

### Option 2: Manual Git Clone (Easy `git pull` updates)

**Windows (PowerShell):**
```powershell
git clone https://github.com/heyshou/sidebar-status-pin.git "$env:USERPROFILE\.gemini\config\plugins\sidebar-status-pin"
```

**macOS / Linux:**
```bash
git clone https://github.com/heyshou/sidebar-status-pin.git ~/.gemini/config/plugins/sidebar-status-pin
```

### Option 3: Download ZIP (No Git required)

1. Click **Code → Download ZIP** on this repository and extract it.
2. Ensure Antigravity launches with `--remote-debugging-port=0` (on Windows, append ` --remote-debugging-port=0` to the shortcut Target; if using Ghost Proxifier, add `--remote-debugging-port=0` to `args`).
3. Run the installer for your OS:
   - **Windows**: double-click `install.bat`
   - **macOS / Linux**:
     ```bash
     chmod +x install.sh && ./install.sh
     ```
4. Fully quit and reopen Antigravity, then confirm **Sidebar Status Pin** is enabled in **Plugins / Customizations**.

---

## Updating & Uninstalling

- **Update**: run `git pull` inside the plugin directory (if cloned), or extract a new ZIP and re-run `install.bat` / `./install.sh`.
- **Uninstall**: double-click `uninstall.bat` on Windows, or remove `~/.gemini/config/plugins/sidebar-status-pin`.

---

## Repository Structure

```text
sidebar-status-pin/
├── plugin.json                        # Plugin manifest
├── sidecars/
│   └── sidebar_status/
│       ├── sidecar.json               # Sidecar process config
│       └── main.mjs                   # Status polling & CDP sidebar injection
├── install.bat / install.ps1          # Windows installer
├── install.sh                         # macOS / Linux installer
├── uninstall.bat                      # Windows uninstaller
├── README.md                          # Chinese documentation
└── README.en.md                       # English documentation
```

## License

MIT
