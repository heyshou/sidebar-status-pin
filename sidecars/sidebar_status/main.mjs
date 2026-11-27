import fs from 'node:fs';
import path from 'node:path';

// Guard stdio EPIPE so closed pipes never crash the sidecar
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (err) => {
    if (err?.code !== 'EPIPE') throw err;
  });
}

const LS_ADDR = process.env.ANTIGRAVITY_LS_ADDRESS || 'localhost:5387';
const CSRF_TOKEN = process.env.ANTIGRAVITY_CSRF_TOKEN || '';

function getDevToolsPort() {
  try {
    const candidates = [];
    if (process.env.APPDATA) {
      candidates.push(path.join(process.env.APPDATA, 'Antigravity', 'DevToolsActivePort'));
    }
    if (process.env.HOME) {
      candidates.push(path.join(process.env.HOME, 'Library', 'Application Support', 'Antigravity', 'DevToolsActivePort'));
      candidates.push(path.join(process.env.HOME, '.config', 'Antigravity', 'DevToolsActivePort'));
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const firstLine = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/)[0]?.trim();
        if (firstLine && /^\d+$/.test(firstLine)) return firstLine;
      }
    }
  } catch {}
  return null;
}

const lastKnownWaiting = new Map();
const waitingMissCount = new Map();

async function isConversationWaiting(cascadeId, stepCount) {
  try {
    const start = Math.max(0, (Number(stepCount) || 0) - 8);
    const res = await fetch(
      `http://${LS_ADDR}/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': CSRF_TOKEN,
        },
        body: JSON.stringify({ cascadeId, stepOffset: start }),
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    const tail = steps.slice(-8);
    for (const s of tail) {
      const st = String(s?.status || '');
      const tp = String(s?.type || '');
      if (st.includes('WAITING')) return true;
      if (s?.requestedInteraction && st !== 'CORTEX_STEP_STATUS_DONE' && st !== 'CORTEX_STEP_STATUS_CANCELED') {
        return true;
      }
      if ((tp.includes('ASK_USER') || tp.includes('ASK_QUESTION')) && st !== 'CORTEX_STEP_STATUS_DONE' && st !== 'CORTEX_STEP_STATUS_CANCELED' && st !== 'CORTEX_STEP_STATUS_ERROR') {
        return true;
      }
    }
    return false;
  } catch {
    return null;
  }
}

async function fetchTrajectories() {
  const res = await fetch(
    `http://${LS_ADDR}/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-codeium-csrf-token': CSRF_TOKEN,
      },
      body: '{}',
      signal: AbortSignal.timeout(4000),
    }
  );
  if (!res.ok) throw new Error(`LS HTTP ${res.status}`);
  const data = await res.json();
  const summaries = data?.trajectorySummaries || {};
  const seenIds = new Set(Object.keys(summaries));
  for (const id of Array.from(lastKnownWaiting.keys())) {
    if (!seenIds.has(id)) lastKnownWaiting.delete(id);
  }
  for (const id of Array.from(waitingMissCount.keys())) {
    if (!seenIds.has(id)) waitingMissCount.delete(id);
  }

  const items = [];
  const runningChecks = [];
  for (const [id, info] of Object.entries(summaries)) {
    const rawStatus = String(info?.status || '');
    let status = 'idle';
    if (rawStatus.includes('WAITING')) {
      status = 'waiting';
      lastKnownWaiting.set(id, true);
      waitingMissCount.set(id, 0);
    } else if (rawStatus === 'CASCADE_RUN_STATUS_RUNNING') {
      status = 'running';
    } else {
      lastKnownWaiting.delete(id);
      waitingMissCount.delete(id);
    }
    const entry = {
      id,
      status,
      title: String(info?.summary || 'Untitled').trim() || 'Untitled',
      updatedAt: String(info?.lastModifiedTime || ''),
    };
    items.push(entry);
    if (status === 'running') {
      runningChecks.push(
        isConversationWaiting(id, info?.stepCount).then((waiting) => {
          if (waiting === true) {
            entry.status = 'waiting';
            lastKnownWaiting.set(id, true);
            waitingMissCount.set(id, 0);
          } else if (waiting === null) {
            if (lastKnownWaiting.get(id) === true) {
              entry.status = 'waiting';
            }
          } else if (lastKnownWaiting.get(id) === true) {
            const misses = (waitingMissCount.get(id) || 0) + 1;
            if (misses >= 2) {
              lastKnownWaiting.set(id, false);
              waitingMissCount.delete(id);
            } else {
              waitingMissCount.set(id, misses);
              entry.status = 'waiting';
            }
          }
        })
      );
    }
  }
  if (runningChecks.length > 0) {
    await Promise.all(runningChecks);
  }
  return items;
}

// Page-side bootstrap script (v7: CSS translate offset + hover freeze + active indicator + composer focus clear)
const BOOTSTRAP_SCRIPT = `(() => {
  const VERSION = 7;
  if (window.__agySidebarPin && window.__agySidebarPin.version === VERSION) return true;

  // Clean up any v1 global dock, old style, and v6 inline transform mutations
  const oldDock = document.getElementById('agy-sidebar-pin-dock');
  if (oldDock) oldDock.remove();
  const oldStyle = document.getElementById('agy-sidebar-pin-style');
  if (oldStyle) oldStyle.remove();
  if (window.__agySidebarPin?.cleanup) {
    try { window.__agySidebarPin.cleanup(); } catch {}
  }

  const prevList = document.querySelector('[data-testid="conversation-list-sidebar"]');
  const prevInner = prevList?.firstElementChild;
  if (prevInner) {
    for (const wrapper of Array.from(prevInner.children)) {
      if (wrapper.dataset?.agyOrigY !== undefined) {
        wrapper.style.transform = 'translateY(' + wrapper.dataset.agyOrigY + 'px)';
        delete wrapper.dataset.agyOrigY;
      }
      if (wrapper.dataset?.agyAppliedY !== undefined) {
        delete wrapper.dataset.agyAppliedY;
      }
      if (wrapper.dataset?.agyManaged !== undefined) {
        delete wrapper.dataset.agyManaged;
      }
      wrapper.style.removeProperty('--agy-dy');
    }
  }

  const STYLE_ID = 'agy-sidebar-pin-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = \`
      #agy-sidebar-pin-dock { display: none !important; visibility: hidden !important; height: 0 !important; max-height: 0 !important; padding: 0 !important; margin: 0 !important; overflow: hidden !important; pointer-events: none !important; }
      @keyframes agy-sb-breathe {
        0%, 100% { opacity: 0.4; box-shadow: 0 0 4px rgba(56, 189, 248, 0.35); }
        50% { opacity: 1; box-shadow: 0 0 11px rgba(56, 189, 248, 0.9); }
      }
      @keyframes agy-sb-wait-pulse {
        0%, 100% { opacity: 0.65; box-shadow: 0 0 4px rgba(245, 158, 11, 0.4); }
        50% { opacity: 1; box-shadow: 0 0 10px rgba(245, 158, 11, 0.85); }
      }

      /* Smooth vertical glide using independent CSS translate so React style.transform stays untouched */
      [data-testid="conversation-list-sidebar"] > div > div[data-agy-managed="1"] {
        translate: 0 var(--agy-dy, 0px);
        transition: translate 180ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      /* Native sidebar conversation row enhancements */
      [data-testid="conversation-row-sidebar"][data-agy-sb-state] {
        position: relative !important;
        overflow: hidden !important;
        transition: background-color 180ms ease, box-shadow 180ms ease;
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state]::before {
        content: "";
        position: absolute;
        left: 0;
        top: 4px;
        bottom: 4px;
        width: 3px;
        border-radius: 0 3px 3px 0;
        z-index: 5;
        pointer-events: none;
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state]::after {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 10px;
        font-weight: 600;
        padding: 1px 5px;
        border-radius: 4px;
        line-height: 1.35;
        z-index: 5;
        pointer-events: none;
      }
      /* Hide badge on hover so native hover action buttons (rename/pin/delete) remain unobstructed */
      [data-testid="conversation-row-sidebar"][data-agy-sb-state]:hover::after {
        opacity: 0;
      }

      /* 1. Done (Unread) - Soft Green when inactive, vivid ring + badge when active */
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="done"] {
        background-color: rgba(34, 197, 94, 0.10) !important;
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="done"]::before {
        background: #22c55e;
        box-shadow: 0 0 8px rgba(34, 197, 94, 0.65);
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="done"]::after {
        content: "完成";
        color: #4ade80;
        background: rgba(20, 83, 45, 0.72);
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="done"][data-agy-sb-active="1"] {
        background-color: rgba(34, 197, 94, 0.25) !important;
        box-shadow: inset 0 0 0 1.5px rgba(134, 239, 172, 0.92), inset 4px 0 0 0 #4ade80 !important;
        font-weight: 600 !important;
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="done"][data-agy-sb-active="1"]::after {
        content: "当前·完成";
        color: #ecfdf5;
        background: #16a34a;
      }

      /* 2. Waiting for confirmation - Amber/Orange */
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="waiting"] {
        background-color: rgba(245, 158, 11, 0.15) !important;
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="waiting"]::before {
        background: #f59e0b;
        animation: agy-sb-wait-pulse 1.7s ease-in-out infinite;
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="waiting"]::after {
        content: "询问";
        color: #fbbf24;
        background: rgba(120, 53, 15, 0.72);
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="waiting"][data-agy-sb-active="1"] {
        background-color: rgba(245, 158, 11, 0.25) !important;
        box-shadow: inset 0 0 0 1.5px rgba(252, 211, 77, 0.92), inset 4px 0 0 0 #f59e0b !important;
        font-weight: 600 !important;
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="waiting"][data-agy-sb-active="1"]::after {
        content: "当前·询问";
        color: #fffbeb;
        background: #d97706;
      }

      /* 3. Running - Cyan/Blue breathing light */
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="running"] {
        background-color: rgba(56, 189, 248, 0.13) !important;
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="running"]::before {
        background: #38bdf8;
        animation: agy-sb-breathe 1.6s ease-in-out infinite;
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="running"]::after {
        content: "进行中";
        color: #38bdf8;
        background: rgba(12, 74, 110, 0.72);
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="running"][data-agy-sb-active="1"] {
        background-color: rgba(56, 189, 248, 0.24) !important;
        box-shadow: inset 0 0 0 1.5px rgba(125, 211, 252, 0.92), inset 4px 0 0 0 #38bdf8 !important;
        font-weight: 600 !important;
      }
      [data-testid="conversation-row-sidebar"][data-agy-sb-state="running"][data-agy-sb-active="1"]::after {
        content: "当前·进行中";
        color: #f0f9ff;
        background: #0284c7;
      }
    \`;
    document.head.appendChild(style);
  }

  function getActiveConversationId() {
    const m = location.pathname.match(/^\\/(?:c|conversation)\\/([^/?#]+)/);
    if (m) return m[1];
    const list = document.querySelector('[data-testid="conversation-list-sidebar"]');
    if (!list) return null;
    const activeSelector = '[aria-current="page"], [aria-selected="true"], [data-active="true"], [data-state="active"]';
    const rows = list.querySelectorAll('[data-testid="conversation-row-sidebar"][data-cascade-id]');
    for (const row of rows) {
      if (row.matches(activeSelector) || row.querySelector(activeSelector)) {
        return row.getAttribute('data-cascade-id');
      }
    }
    return null;
  }

  function parseTranslateY(transformStr) {
    if (!transformStr) return null;
    const m = transformStr.match(/translateY\\(([-0-9.]+)px\\)/);
    return m ? Number(m[1]) : null;
  }

  const STORAGE_KEY = 'agy_sidebar_unread_done_v6';

  function loadUnread() {
    const map = new Map();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const [id, info] of arr) {
            if (typeof id === 'string' && info) map.set(id, info);
          }
        }
      }
    } catch {}
    return map;
  }

  function saveUnread(map) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.entries())));
    } catch {}
  }

  const prevState = window.__agySidebarPin;
  const initialUnread = prevState?.unreadDone instanceof Map && prevState.unreadDone.size > 0
    ? prevState.unreadDone
    : loadUnread();

  const initialActiveId = getActiveConversationId();
  const state = {
    version: VERSION,
    prevStatus: prevState?.prevStatus instanceof Map ? prevState.prevStatus : new Map(),
    unreadDone: initialUnread,
    clickedTitleIds: new Set(),
    latestItems: new Map(),
    displayState: new Map(),
    activeConvId: initialActiveId,
    activeConvEnteredAt: Date.now(),
  };

  function syncActiveConversation() {
    const nextId = getActiveConversationId();
    if (nextId !== state.activeConvId) {
      state.activeConvId = nextId;
      state.activeConvEnteredAt = Date.now();
    }
    return nextId;
  }

  function priorityOf(st) {
    if (st === 'done') return 0;
    if (st === 'waiting') return 1;
    if (st === 'running') return 2;
    return 3;
  }

  let isApplying = false;
  let observedSidebar = null;
  let sidebarObserver = null;
  let mountObserver = null;
  let rafPending = false;

  const scheduleLayout = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      applyPerProjectLayout();
    });
  };

  const onSidebarMouseLeave = () => {
    scheduleLayout();
  };

  function ensureSidebarObserver(list) {
    if (!list) {
      if (observedSidebar) {
        try { observedSidebar.removeEventListener('mouseleave', onSidebarMouseLeave); } catch {}
        observedSidebar = null;
      }
      if (sidebarObserver) {
        sidebarObserver.disconnect();
        sidebarObserver = null;
      }
      if (!mountObserver && document.body) {
        mountObserver = new MutationObserver(() => {
          const found = document.querySelector('[data-testid="conversation-list-sidebar"]');
          if (found) {
            mountObserver.disconnect();
            mountObserver = null;
            ensureSidebarObserver(found);
            scheduleLayout();
          }
        });
        mountObserver.observe(document.body, { childList: true, subtree: true });
      }
      return;
    }

    if (observedSidebar === list) return;
    if (observedSidebar) {
      try { observedSidebar.removeEventListener('mouseleave', onSidebarMouseLeave); } catch {}
    }
    if (sidebarObserver) {
      sidebarObserver.disconnect();
    }
    if (mountObserver) {
      mountObserver.disconnect();
      mountObserver = null;
    }

    observedSidebar = list;
    list.addEventListener('mouseleave', onSidebarMouseLeave);
    sidebarObserver = new MutationObserver(() => {
      if (isApplying) return;
      scheduleLayout();
    });
    sidebarObserver.observe(list, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'aria-current', 'aria-selected', 'data-active', 'data-state'],
    });
  }

  function applyPerProjectLayout() {
    if (isApplying) return;
    isApplying = true;
    try {
      ensureStyle();
      const list = document.querySelector('[data-testid="conversation-list-sidebar"]');
      ensureSidebarObserver(list);
      const inner = list?.firstElementChild;
      if (!inner) return;

      const activeId = syncActiveConversation();
      const isHovered = typeof list.matches === 'function' && list.matches(':hover');

      // 1. Collect all virtual list wrappers using React's untouched inline transform translateY
      const entries = [];
      for (const wrapper of Array.from(inner.children)) {
        const origY = parseTranslateY(wrapper.style.transform);
        const row = wrapper.querySelector('[data-testid="conversation-row-sidebar"][data-cascade-id]');
        const cascadeId = row ? row.getAttribute('data-cascade-id') : null;
        const isRow = Boolean(row && cascadeId && origY !== null);

        // Always keep visual state and active conversation indicator up to date (even while hovered)
        if (row && cascadeId) {
          const st = state.displayState.get(cascadeId);
          if (st) {
            if (row.getAttribute('data-agy-sb-state') !== st) {
              row.setAttribute('data-agy-sb-state', st);
            }
          } else if (row.hasAttribute('data-agy-sb-state')) {
            row.removeAttribute('data-agy-sb-state');
          }

          if (activeId && cascadeId === activeId) {
            if (row.getAttribute('data-agy-sb-active') !== '1') {
              row.setAttribute('data-agy-sb-active', '1');
            }
          } else if (row.hasAttribute('data-agy-sb-active')) {
            row.removeAttribute('data-agy-sb-active');
          }
        }

        entries.push({ wrapper, row, cascadeId, isRow, origY });
      }

      // Freeze reordering while pointer is hovering the sidebar so rows never jump under cursor
      if (isHovered) return;

      // 2. Sort by origY so we strictly partition contiguous conversation blocks per project
      entries.sort((a, b) => (a.origY ?? -1) - (b.origY ?? -1));

      // 3. Reorder ONLY within each contiguous block of conversation rows (also split on large virtual Y gaps)
      let i = 0;
      while (i < entries.length) {
        if (!entries[i].isRow) {
          i++;
          continue;
        }
        const block = [entries[i]];
        i++;
        while (i < entries.length && entries[i].isRow) {
          const prev = block[block.length - 1];
          const cur = entries[i];
          const rowH = prev.wrapper.offsetHeight || cur.wrapper.offsetHeight || 36;
          const maxStep = Math.max(rowH * 1.45, 56);
          if ((cur.origY - prev.origY) > maxStep) break;
          block.push(cur);
          i++;
        }

        const slots = block.map((e) => e.origY);

        const sorted = [...block].sort((a, b) => {
          const stA = state.displayState.get(a.cascadeId);
          const stB = state.displayState.get(b.cascadeId);
          const pA = priorityOf(stA);
          const pB = priorityOf(stB);
          if (pA !== pB) return pA - pB;
          if (stA === 'done' && stB === 'done') {
            const tA = state.unreadDone.get(a.cascadeId)?.finishedAt || 0;
            const tB = state.unreadDone.get(b.cascadeId)?.finishedAt || 0;
            if (tA !== tB) return tB - tA;
          }
          return a.origY - b.origY;
        });

        for (let k = 0; k < sorted.length; k++) {
          const item = sorted[k];
          const deltaY = slots[k] - item.origY;
          if (Math.abs(deltaY) < 0.5) {
            if (item.wrapper.dataset.agyManaged !== undefined) {
              delete item.wrapper.dataset.agyManaged;
            }
            if (item.wrapper.style.getPropertyValue('--agy-dy')) {
              item.wrapper.style.removeProperty('--agy-dy');
            }
          } else {
            const nextDy = deltaY + 'px';
            if (item.wrapper.dataset.agyManaged !== '1') {
              item.wrapper.dataset.agyManaged = '1';
            }
            if (item.wrapper.style.getPropertyValue('--agy-dy') !== nextDy) {
              item.wrapper.style.setProperty('--agy-dy', nextDy);
            }
          }
        }
      }
    } finally {
      isApplying = false;
    }
  }

  function rebuildDisplayState() {
    state.displayState.clear();

    for (const [id] of state.unreadDone.entries()) {
      const latest = state.latestItems.get(id);
      if (latest && (latest.status === 'running' || latest.status === 'waiting')) {
        state.unreadDone.delete(id);
        continue;
      }
      state.displayState.set(id, 'done');
    }

    for (const [id, item] of state.latestItems.entries()) {
      if (item.status === 'waiting') {
        state.displayState.set(id, 'waiting');
      } else if (item.status === 'running') {
        state.displayState.set(id, 'running');
      }
    }

    applyPerProjectLayout();
  }

  function tryClearActiveDone() {
    const activeId = syncActiveConversation();
    if (!activeId || !state.unreadDone.has(activeId)) return;
    const clicked = state.clickedTitleIds.has(activeId);
    const stayedLongEnough = (Date.now() - state.activeConvEnteredAt) >= 300;
    if (clicked || stayedLongEnough) {
      state.unreadDone.delete(activeId);
      state.clickedTitleIds.delete(activeId);
      saveUnread(state.unreadDone);
      rebuildDisplayState();
    }
  }

  const onClick = (ev) => {
    const row = ev.target?.closest?.('[data-testid="conversation-row-sidebar"][data-cascade-id]');
    if (row) {
      const id = row.getAttribute('data-cascade-id');
      if (id && state.unreadDone.has(id)) {
        state.clickedTitleIds.add(id);
      }
      scheduleLayout();
      return;
    }

    // Only clear when clicking inside the chat dialog/composer area (strictly outside the left sidebar)
    const inSidebar = Boolean(ev.target?.closest?.('[data-testid="conversation-list-sidebar"], nav, aside'));
    if (inSidebar) return;

    const inDialogOrComposer = Boolean(
      ev.target?.closest?.('main, textarea, [contenteditable="true"], [role="textbox"], [data-testid*="composer"], [data-testid*="chat"], [data-testid*="message"]')
    );
    if (!inDialogOrComposer) return;

    tryClearActiveDone();
  };

  const onComposerInteract = (ev) => {
    if (ev.target?.closest?.('[data-testid="conversation-list-sidebar"], nav, aside')) return;
    if (ev.target?.closest?.('textarea, [contenteditable="true"], [role="textbox"]')) {
      tryClearActiveDone();
    }
  };

  const onPopState = () => {
    scheduleLayout();
  };

  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);
  history.pushState = function (...args) {
    const ret = origPushState(...args);
    Promise.resolve().then(scheduleLayout);
    return ret;
  };
  history.replaceState = function (...args) {
    const ret = origReplaceState(...args);
    Promise.resolve().then(scheduleLayout);
    return ret;
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('focusin', onComposerInteract, true);
  document.addEventListener('keydown', onComposerInteract, true);
  window.addEventListener('popstate', onPopState);

  state.cleanup = () => {
    if (sidebarObserver) sidebarObserver.disconnect();
    if (mountObserver) mountObserver.disconnect();
    if (observedSidebar) {
      try { observedSidebar.removeEventListener('mouseleave', onSidebarMouseLeave); } catch {}
    }
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('focusin', onComposerInteract, true);
    document.removeEventListener('keydown', onComposerInteract, true);
    window.removeEventListener('popstate', onPopState);
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
  };

  state.update = (items) => {
    const seen = new Set();
    let unreadChanged = false;

    for (const item of items) {
      seen.add(item.id);
      const prev = state.prevStatus.get(item.id);
      state.latestItems.set(item.id, item);

      if ((prev === 'running' || prev === 'waiting') && item.status === 'idle') {
        state.unreadDone.set(item.id, { title: item.title, finishedAt: Date.now() });
        state.clickedTitleIds.delete(item.id);
        unreadChanged = true;
      } else if (item.status === 'running' || item.status === 'waiting') {
        if (state.unreadDone.delete(item.id)) unreadChanged = true;
        state.clickedTitleIds.delete(item.id);
      }

      state.prevStatus.set(item.id, item.status);
    }

    if (items.length > 0) {
      for (const id of Array.from(state.latestItems.keys())) {
        if (!seen.has(id)) {
          state.latestItems.delete(id);
          if (state.unreadDone.delete(id)) unreadChanged = true;
          state.clickedTitleIds.delete(id);
          state.prevStatus.delete(id);
        }
      }
    }

    if (unreadChanged) saveUnread(state.unreadDone);
    rebuildDisplayState();
  };

  window.__agySidebarPin = state;
  ensureStyle();
  ensureSidebarObserver(document.querySelector('[data-testid="conversation-list-sidebar"]'));
  return true;
})();`;

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.bootstrapped = false;
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = (err) => reject(err);
      ws.onclose = () => {
        this.bootstrapped = false;
        for (const { reject: rej } of this.pending.values()) {
          rej(new Error('CDP closed'));
        }
        this.pending.clear();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rej(msg.error);
            else res(msg.result);
          }
        } catch {}
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('CDP not open'));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async pushItems(items) {
    await this.connect();
    if (!this.bootstrapped) {
      await this.send('Runtime.evaluate', { expression: BOOTSTRAP_SCRIPT, returnByValue: true });
      this.bootstrapped = true;
    }
    const payload = JSON.stringify(items);
    const res = await this.send('Runtime.evaluate', {
      expression: `(() => { if (!window.__agySidebarPin || window.__agySidebarPin.version !== 7) return false; window.__agySidebarPin.update(${payload}); return true; })()`,
      returnByValue: true,
    });
    if (res?.result?.value === false) {
      this.bootstrapped = false;
      await this.send('Runtime.evaluate', { expression: BOOTSTRAP_SCRIPT, returnByValue: true });
      this.bootstrapped = true;
      await this.send('Runtime.evaluate', {
        expression: `window.__agySidebarPin?.update(${payload})`,
        returnByValue: true,
      });
    }
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}

const clients = new Map(); // targetId -> CdpClient

async function syncOnce() {
  const port = getDevToolsPort();
  if (!port) return;

  let targets = [];
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return;
    targets = await res.json();
  } catch {
    return;
  }

  const appPages = targets.filter(
    (t) =>
      t.type === 'page' &&
      t.webSocketDebuggerUrl &&
      /^https?:\/\/(127\.0\.0\.1|localhost)/.test(t.url || '')
  );

  const activeTargetIds = new Set(appPages.map((t) => t.id));
  for (const [tid, client] of clients.entries()) {
    if (!activeTargetIds.has(tid)) {
      client.close();
      clients.delete(tid);
    }
  }

  if (appPages.length === 0) return;

  let items = [];
  try {
    items = await fetchTrajectories();
  } catch {
    return;
  }

  for (const page of appPages) {
    let client = clients.get(page.id);
    if (!client) {
      client = new CdpClient(page.webSocketDebuggerUrl);
      clients.set(page.id, client);
    }
    try {
      await client.pushItems(items);
    } catch {
      client.close();
      clients.delete(page.id);
    }
  }
}

async function loop() {
  while (true) {
    await syncOnce();
    await new Promise((r) => setTimeout(r, 1500));
  }
}

process.on('SIGTERM', () => {
  for (const c of clients.values()) c.close();
  process.exit(0);
});
process.on('SIGINT', () => {
  for (const c of clients.values()) c.close();
  process.exit(0);
});

loop();
