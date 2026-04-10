/* ═══  Copilot Brain 0.4.9 — frontend  ═══ */

// ── API base (handles HA ingress proxy) ──
const API_BASE = (() => {
  const path = window.location.pathname;
  if (path.endsWith('/')) return path;
  return path + '/';
})();
function apiUrl(endpoint) { return API_BASE + endpoint; }

// ── DOM refs ──
const $ = (id) => document.getElementById(id);

const healthText       = $('healthText');
const versionLabel     = $('versionLabel');
const modelLabel       = $('modelLabel');
const haStatusLabel    = $('haStatusLabel');
const githubStatusLabel= $('githubStatusLabel');
const statusbar        = document.querySelector('.statusbar');

const chatLog          = $('chatLog');
const chatForm         = $('chatForm');
const messageInput     = $('messageInput');

const terminalLog      = $('terminalLog');
const terminalForm     = $('terminalForm');
const terminalInput    = $('terminalInput');
const terminalClearBtn = $('terminalClearButton');
const outputLog        = $('outputLog');

const fileMenuButton   = $('fileMenuButton');
const fileMenu         = $('fileMenu');
const viewMenuButton   = $('viewMenuButton');
const viewMenu         = $('viewMenu');

const settingsModal         = $('settingsModal');
const settingsModalBackdrop = $('settingsModalBackdrop');
const closeSettingsModalBtn = $('closeSettingsModalButton');
const openSettingsItem      = $('openSettingsMenuItem');
const authorizeGithubItem   = $('authorizeGithubMenuItem');
const githubOauthSection    = $('githubOauthSection');

const commandsModal         = $('commandsModal');
const commandsModalBackdrop = $('commandsModalBackdrop');
const closeCommandsModalBtn = $('closeCommandsModalButton');
const openCommandsItem      = $('openCommandsMenuItem');
const commandsList          = $('commandsList');
const addCommandForm        = $('addCommandForm');

const settingsForm          = $('settingsForm');
const githubModelInput      = $('githubModelInput');
const refreshModelsButton   = $('refreshModelsButton');
const approvalModeInput     = $('approvalModeInput');
const mcpTokenInput         = $('mcpTokenInput');
const entityAllowlistInput  = $('entityAllowlistInput');
const serviceAllowlistInput = $('serviceAllowlistInput');
const addonAllowlistInput   = $('addonAllowlistInput');
const systemPromptInput     = $('systemPromptInput');
const testGithubButton      = null; // removed

const githubClientIdInput     = null; // removed (Device Flow replaced by PAT)
const githubOauthTokenInput   = $('githubOauthTokenInput');
const startDeviceFlowBtn      = null; // removed
const githubAppIdInput        = null; // removed (GitHub App config removed)
const githubInstallationIdInput = null; // removed
const githubPrivateKeyInput   = null; // removed

const configBox      = $('configBox');
const githubStatusBox= $('githubStatusBox');
const contextBox     = $('contextBox');
const modelsBox      = $('modelsBox');
const auditBox       = $('auditBox');
const approvalsBox   = $('approvalsBox');
const approvalCount  = $('approvalCount');

const resizeHandle = $('resizeHandle');
const chatPanel    = $('chatPanel');
const logPanel     = $('logPanel');
const workspace    = document.querySelector('.workspace');

// ── State ──
const TERMINAL_KEY = 'cb-terminal-v2';
const COMMANDS_KEY = 'cb-commands-v1';
let settingsHydrated = false;
let terminalHistory = [];
let predefinedCommands = [];
let terminalHistoryCursor = -1;

// ── Helpers ──
const toJson = (v) => JSON.stringify(v, null, 2);
const listToText = (v) => (Array.isArray(v) ? v.join('\n') : '');
const uniqueStrings = (values) => [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];

function formatErrorMessage(error, fallback = 'Wystąpił nieznany błąd.') {
  const message = error instanceof Error ? error.message : String(error ?? fallback);
  if (message === 'Failed to fetch') {
    return 'Brak połączenia z dodatkiem. Poczekaj chwilę aż Copilot Brain się uruchomi i odśwież widok.';
  }

  return message || fallback;
}

function focusTerminalInput() {
  if (!terminalInput) return;
  requestAnimationFrame(() => terminalInput.focus());
}

function getTerminalCommands() {
  return terminalHistory.filter((entry) => entry.kind === 'command').map((entry) => entry.text);
}

function navigateTerminalHistory(direction) {
  const commands = getTerminalCommands();
  if (!commands.length) return;

  if (direction < 0) {
    terminalHistoryCursor = Math.min(commands.length - 1, terminalHistoryCursor + 1);
  } else if (terminalHistoryCursor <= 0) {
    terminalHistoryCursor = -1;
    terminalInput.value = '';
    return;
  } else {
    terminalHistoryCursor -= 1;
  }

  if (terminalHistoryCursor >= 0) {
    terminalInput.value = commands[commands.length - 1 - terminalHistoryCursor] ?? '';
  }
}

function renderModelOptions(models, preferredModel) {
  const options = uniqueStrings([preferredModel, ...(models || [])]);
  if (!options.length) {
    options.push('openai/gpt-4.1');
  }

  const currentValue = preferredModel || githubModelInput.value || options[0];
  githubModelInput.innerHTML = '';
  for (const model of options) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    githubModelInput.appendChild(option);
  }
  githubModelInput.value = options.includes(currentValue) ? currentValue : options[0];
}

function setDeviceFlowNotice() {} // no-op (Device Flow removed)

// ══════════════════════════════════════════
//  MENUS
// ══════════════════════════════════════════
function toggleMenu(btn, menu) {
  const open = menu.classList.contains('hidden');
  closeAllMenus();
  if (open) { menu.classList.remove('hidden'); btn.classList.add('open'); }
}
function closeAllMenus() {
  [fileMenu, viewMenu].forEach(m => m.classList.add('hidden'));
  [fileMenuButton, viewMenuButton].forEach(b => b.classList.remove('open'));
}

function stopMenuEvent(event) {
  event.stopPropagation();
}

fileMenuButton.addEventListener('click', () => toggleMenu(fileMenuButton, fileMenu));
viewMenuButton.addEventListener('click', () => toggleMenu(viewMenuButton, viewMenu));
[fileMenuButton, fileMenu, viewMenuButton, viewMenu].forEach(el =>
  ['mousedown', 'click'].forEach((eventName) => el.addEventListener(eventName, stopMenuEvent)));
document.addEventListener('click', closeAllMenus);

// ══════════════════════════════════════════
//  MODALS
// ══════════════════════════════════════════
function openModal(modal, backdrop) {
  closeAllMenus();
  modal.classList.remove('hidden'); backdrop.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}
function closeModal(modal, backdrop) {
  modal.classList.add('hidden'); backdrop.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

closeSettingsModalBtn.addEventListener('click', () => closeModal(settingsModal, settingsModalBackdrop));
settingsModalBackdrop.addEventListener('click', () => closeModal(settingsModal, settingsModalBackdrop));

openSettingsItem.addEventListener('click', () => {
  openModal(settingsModal, settingsModalBackdrop);
  githubModelInput.focus();
});

authorizeGithubItem.addEventListener('click', () => {
  openModal(settingsModal, settingsModalBackdrop);
  githubOauthSection?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  githubOauthTokenInput?.focus();
});

openCommandsItem.addEventListener('click', () => openModal(commandsModal, commandsModalBackdrop));
closeCommandsModalBtn.addEventListener('click', () => closeModal(commandsModal, commandsModalBackdrop));
commandsModalBackdrop.addEventListener('click', () => closeModal(commandsModal, commandsModalBackdrop));

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAllMenus();
    closeModal(settingsModal, settingsModalBackdrop);
    closeModal(commandsModal, commandsModalBackdrop);
  }
});

// ══════════════════════════════════════════
//  TABS (Terminal / Output)
// ══════════════════════════════════════════
const panelTabs = document.querySelectorAll('.panel-tabs .tab[data-tab]');
const tabBodies = { terminal: $('terminalTabBody'), output: $('outputTabBody') };

function switchTab(name) {
  panelTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  Object.entries(tabBodies).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
  if (name === 'terminal') focusTerminalInput();
}

panelTabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
document.querySelectorAll('[data-switch-tab]').forEach(el =>
  el.addEventListener('click', () => { closeAllMenus(); switchTab(el.dataset.switchTab); }));

// ══════════════════════════════════════════
//  RESIZE HANDLE (drag to resize chat↔log)
// ══════════════════════════════════════════
let resizing = false;
resizeHandle.addEventListener('mousedown', e => {
  e.preventDefault(); resizing = true;
  resizeHandle.classList.add('dragging');
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', e => {
  if (!resizing) return;
  const rect = workspace.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const total = rect.height;
  const pct = Math.max(15, Math.min(85, (y / total) * 100));
  workspace.style.gridTemplateRows = `${pct}% 4px 1fr`;
});
document.addEventListener('mouseup', () => {
  if (!resizing) return;
  resizing = false;
  resizeHandle.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// ══════════════════════════════════════════
//  CHAT
// ══════════════════════════════════════════
function appendMessage(role, text) {
  const el = document.createElement('article');
  el.className = `message ${role}`;

  const label = document.createElement('div');
  label.className = 'message-role';
  if (role === 'user') {
    label.innerHTML = '<span class="mdi mdi-account"></span> Ty';
  } else {
    label.innerHTML = '<span class="mdi mdi-robot-outline"></span> Copilot Brain';
  }

  const body = document.createElement('div');
  body.className = 'message-body';
  body.textContent = text;

  el.append(label, body);
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

chatForm.addEventListener('submit', async e => {
  e.preventDefault();
  const msg = messageInput.value.trim();
  if (!msg) return;
  appendMessage('user', msg);
  messageInput.value = '';
  try {
    const res = await fetch(apiUrl('api/chat'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Chat error');
    appendMessage('assistant', data.reply);
    await refresh();
  } catch (err) {
    appendMessage('assistant', `Błąd: ${formatErrorMessage(err, 'Chat error')}`);
  }
});

// Ctrl+Enter to send
messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); chatForm.requestSubmit(); }
});

// ══════════════════════════════════════════
//  TERMINAL
// ══════════════════════════════════════════
function getPrefix(kind) {
  return kind === 'command' ? '$' : kind === 'error' ? '!' : kind === 'system' ? '#' : '›';
}

function persistTerminal() {
  sessionStorage.setItem(TERMINAL_KEY, JSON.stringify(terminalHistory.slice(-300)));
}
function renderTerminal() {
  terminalLog.innerHTML = '';
  for (const e of terminalHistory) {
    const line = document.createElement('div');
    line.className = `terminal-line ${e.kind}`;
    const pfx = document.createElement('span'); pfx.className = 'terminal-prefix'; pfx.textContent = getPrefix(e.kind);
    const body = document.createElement('div'); body.className = 'terminal-body'; body.textContent = e.text;
    line.append(pfx, body);
    terminalLog.appendChild(line);
  }
  terminalLog.scrollTop = terminalLog.scrollHeight;
}
function termLine(kind, text) {
  terminalHistory.push({ kind, text, at: new Date().toISOString() });
  persistTerminal(); renderTerminal();
}
function clearTerminal(msg) {
  terminalHistory = []; persistTerminal(); renderTerminal();
  if (msg) termLine('system', msg);
}

terminalClearBtn.addEventListener('click', () => { clearTerminal('Console cleared.'); terminalInput.focus(); });
terminalLog.addEventListener('click', focusTerminalInput);

terminalForm.addEventListener('submit', async e => {
  e.preventDefault();
  const cmd = terminalInput.value.trim();
  if (!cmd) return;
  terminalHistoryCursor = -1;
  termLine('command', cmd);
  terminalInput.value = '';
  try {
    const res = await fetch(apiUrl('api/terminal/execute'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd }),
    });
    const data = await res.json();
    if (data.clear) { clearTerminal(data.output); }
    else { termLine(data.ok ? 'output' : 'error', data.output ?? 'No output.'); }
    if (res.ok) await refresh();
  } catch (err) {
    termLine('error', formatErrorMessage(err, 'Terminal error'));
  } finally {
    focusTerminalInput();
  }
});

terminalInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    navigateTerminalHistory(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    navigateTerminalHistory(1);
  }
});

// ══════════════════════════════════════════
//  OUTPUT LOG (secondary panel)
// ══════════════════════════════════════════
function appendOutput(text) {
  const line = document.createElement('div');
  line.className = 'terminal-line output';
  const pfx = document.createElement('span'); pfx.className = 'terminal-prefix'; pfx.textContent = '›';
  const body = document.createElement('div'); body.className = 'terminal-body'; body.textContent = text;
  line.append(pfx, body);
  outputLog.appendChild(line);
  outputLog.scrollTop = outputLog.scrollHeight;
}

// ══════════════════════════════════════════
//  PREDEFINED COMMANDS
// ══════════════════════════════════════════
function loadCommands() {
  try { predefinedCommands = JSON.parse(localStorage.getItem(COMMANDS_KEY) || '[]'); } catch { predefinedCommands = []; }
}
function saveCommands() {
  localStorage.setItem(COMMANDS_KEY, JSON.stringify(predefinedCommands));
}
function renderCommands() {
  commandsList.innerHTML = '';
  if (!predefinedCommands.length) {
    commandsList.innerHTML = '<p class="muted-text">Brak zdefiniowanych komend.</p>';
    return;
  }
  for (const cmd of predefinedCommands) {
    const card = document.createElement('div'); card.className = 'command-card';
    card.innerHTML = `
      <span class="mdi ${cmd.icon || 'mdi-lightning-bolt-outline'}"></span>
      <div class="command-card-info">
        <div class="command-card-name">${esc(cmd.name)}</div>
        <div class="command-card-prompt">${esc(cmd.prompt)}</div>
      </div>
      <button type="button" class="command-card-del" title="Usuń"><span class="mdi mdi-delete-outline"></span></button>
    `;
    card.querySelector('.command-card-info').addEventListener('click', () => executeCommand(cmd));
    card.querySelector('.command-card-del').addEventListener('click', e => {
      e.stopPropagation();
      predefinedCommands = predefinedCommands.filter(c => c.id !== cmd.id);
      saveCommands(); renderCommands();
    });
    commandsList.appendChild(card);
  }
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function executeCommand(cmd) {
  closeModal(commandsModal, commandsModalBackdrop);
  appendMessage('user', `⚡ ${cmd.name}`);
  try {
    const res = await fetch(apiUrl('api/chat'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: cmd.prompt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Command error');
    appendMessage('assistant', data.reply);
    appendOutput(`[${cmd.name}] ${data.reply.slice(0, 500)}`);
    await refresh();
  } catch (err) {
    appendMessage('assistant', `Błąd komendy: ${err.message}`);
  }
}

addCommandForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = $('cmdNameInput').value.trim();
  const icon = $('cmdIconInput').value.trim() || 'mdi-lightning-bolt-outline';
  const prompt = $('cmdPromptInput').value.trim();
  if (!name || !prompt) return;
  predefinedCommands.push({ id: Date.now().toString(36), name, icon, prompt });
  saveCommands(); renderCommands();
  addCommandForm.reset();
});

// ══════════════════════════════════════════
//  STATUS BAR HELPERS
// ══════════════════════════════════════════
function setSbStatus(el, ok, label) { if (el) el.textContent = label; }

// ══════════════════════════════════════════
//  SETTINGS FORM
// ══════════════════════════════════════════
function hydrateSettings(s) {
  githubModelInput.dataset.savedValue = s.effectiveConfig.githubModelsDefaultModel ?? 'openai/gpt-4.1';
  approvalModeInput.value = s.effectiveConfig.approvalMode ?? 'explicit';
  entityAllowlistInput.value = listToText(s.effectiveConfig.entityAllowlist);
  serviceAllowlistInput.value = listToText(s.effectiveConfig.serviceAllowlist);
  addonAllowlistInput.value = listToText(s.effectiveConfig.addonAllowlist);
  systemPromptInput.value = s.effectiveConfig.systemPromptTemplate ?? '';
  settingsHydrated = true;
}

function renderApprovals(entries) {
  approvalCount.textContent = String(entries.length);
  if (!entries.length) { approvalsBox.textContent = 'Brak oczekujących.'; return; }
  approvalsBox.innerHTML = '';
  for (const e of entries) {
    const w = document.createElement('article'); w.className = 'approval-item';
    w.innerHTML = `<h3>${esc(e.summary)}</h3>
      <div class="approval-meta">${esc(e.id)} · ${e.status} · ${new Date(e.createdAt).toLocaleString()}</div>
      <pre>${esc(toJson(e.payload))}</pre>`;
    if (e.status === 'pending') {
      const acts = document.createElement('div'); acts.className = 'approval-actions';
      const ab = document.createElement('button'); ab.textContent = 'Approve';
      ab.addEventListener('click', async () => {
        await fetch(apiUrl(`api/approvals/${e.id}/approve`), { method: 'POST' });
        termLine('system', `Approved ${e.id}`); await refresh();
      });
      const rb = document.createElement('button'); rb.textContent = 'Reject'; rb.className = 'reject';
      rb.addEventListener('click', async () => {
        await fetch(apiUrl(`api/approvals/${e.id}/reject`), { method: 'POST' });
        termLine('system', `Rejected ${e.id}`); await refresh();
      });
      acts.append(ab, rb); w.appendChild(acts);
    }
    approvalsBox.appendChild(w);
  }
}

settingsForm.addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    github_model: githubModelInput.value.trim(),
    approval_mode: approvalModeInput.value,
    mcp_auth_token: mcpTokenInput.value.trim(),
    github_oauth_token: githubOauthTokenInput.value.trim(),
    entity_allowlist: entityAllowlistInput.value,
    service_allowlist: serviceAllowlistInput.value,
    addon_allowlist: addonAllowlistInput.value,
    system_prompt_template: systemPromptInput.value,
  };
  try {
    const res = await fetch(apiUrl('api/settings'), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Settings error');
    appendMessage('assistant', 'Ustawienia zapisane.');
    termLine('system', 'Runtime settings updated.');
    mcpTokenInput.value = ''; githubPrivateKeyInput.value = ''; githubOauthTokenInput.value = '';
    settingsHydrated = false;
    await refresh({ forceSettings: true });
    // Auto-reload models after save (token may have changed)
    try {
      const models = await loadJson(apiUrl('api/models'));
      renderModelOptions(models.models, githubModelInput.dataset.savedValue || models.selected);
      if (modelsBox) modelsBox.textContent = toJson(models);
      termLine('system', `Models refreshed: ${models.models?.length ?? 0}`);
    } catch { /* ignore */ }
  } catch (err) {
    appendMessage('assistant', `Błąd zapisu: ${formatErrorMessage(err, 'Settings error')}`);
  }
});

refreshModelsButton.addEventListener('click', async () => {
  try {
    refreshModelsButton.disabled = true;
    const models = await loadJson(apiUrl('api/models'));
    renderModelOptions(models.models, githubModelInput.value || githubModelInput.dataset.savedValue || models.selected);
    modelsBox.textContent = toJson(models);
    termLine('system', `Models loaded: ${models.models?.length ?? 0}`);
  } catch (err) {
    termLine('error', `Models: ${formatErrorMessage(err, 'Models error')}`);
  } finally {
    refreshModelsButton.disabled = false;
  }
});

// ══════════════════════════════════════════
//  DATA REFRESH
// ══════════════════════════════════════════
async function loadJson(url) {
  const r = await fetch(url);
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `${url}: ${r.status}`); }
  return r.json();
}
async function tryLoad(url) {
  try { return { ok: true, data: await loadJson(url) }; }
  catch (e) { return { ok: false, error: formatErrorMessage(e, 'Request failed') }; }
}

async function refresh(opts = {}) {
  const { forceSettings = false } = opts;
  const [health, config, github, settings, context, models, audit, approvals] = await Promise.all([
    tryLoad(apiUrl('api/health')), tryLoad(apiUrl('api/config')), tryLoad(apiUrl('api/github/status')),
    tryLoad(apiUrl('api/settings')), tryLoad(apiUrl('api/context')), tryLoad(apiUrl('api/models')),
    tryLoad(apiUrl('api/audit')), tryLoad(apiUrl('api/approvals')),
  ]);

  // Health / version
  if (health.ok) {
    const h = health.data;
    healthText.textContent = `${h.service} ${h.version} · ${h.stage}`;
    versionLabel.textContent = `v${h.version}`;
    document.title = `Copilot Brain ${h.version}`;
  } else {
    healthText.textContent = health.error;
  }

  // HA status
  if (config.ok) {
    configBox.textContent = toJson(config.data);
    setSbStatus(haStatusLabel, config.data.haLive, config.data.haLive ? 'HA live' : 'HA mock');
  } else {
    configBox.textContent = config.error;
    setSbStatus(haStatusLabel, false, 'HA err');
  }

  // GitHub
  if (github.ok) {
    githubStatusBox.textContent = toJson(github.data);
    setSbStatus(githubStatusLabel, github.data.ok, github.data.ok ? 'connected' : github.data.configured ? 'failing' : 'not configured');
  } else {
    githubStatusBox.textContent = github.error;
    setSbStatus(githubStatusLabel, false, 'error');
  }

  // Settings
  if (settings.ok && (!settingsHydrated || forceSettings)) hydrateSettings(settings.data);

  const preferredModel = githubModelInput.value || githubModelInput.dataset.savedValue || settings.data?.effectiveConfig?.githubModelsDefaultModel || 'openai/gpt-4.1';
  renderModelOptions(models.ok ? models.data.models : [preferredModel], preferredModel);

  // Model label
  if (settings.ok) modelLabel.textContent = settings.data.effectiveConfig.githubModelsDefaultModel ?? '—';

  // Context
  if (context.ok) {
    const c = context.data;
    contextBox.textContent = [c.entitiesSummary, '', c.addonsSummary].join('\n');
  } else { contextBox.textContent = context.error; }

  modelsBox.textContent = models.ok ? toJson(models.data) : models.error;
  auditBox.textContent = audit.ok ? toJson(audit.data.entries) : audit.error;

  if (approvals.ok) renderApprovals(approvals.data.entries);
  else { approvalsBox.textContent = approvals.error; approvalCount.textContent = '!'; }

  // Statusbar color
  const allOk = health.ok && config.ok;
  statusbar.classList.remove('error', 'warning');
  if (!allOk) statusbar.classList.add('warning');
}

// ══════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════
try {
  terminalHistory = JSON.parse(sessionStorage.getItem(TERMINAL_KEY) ?? '[]');
  if (!Array.isArray(terminalHistory)) terminalHistory = [];
} catch { terminalHistory = []; }

if (terminalHistory.length === 0) {
  termLine('system', 'Copilot Brain terminal ready. Type help for commands.');
  termLine('system', 'Guarded HA console — system, host, entities, logs, containers…');
} else { renderTerminal(); }

loadCommands();
renderCommands();

appendMessage('assistant',
  'Witaj w Copilot Brain.\nChat u góry, terminal na dole. Przeciągnij pasek aby zmienić proporcje.\nFile → Settings / Predefined Commands.\nAutoryzuj GitHub przez OAuth w Settings.');

focusTerminalInput();
refresh({ forceSettings: true });
setInterval(() => refresh(), 30000);
