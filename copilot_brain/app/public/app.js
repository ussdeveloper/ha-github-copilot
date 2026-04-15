/* ═══  Copilot Brain 0.4.19 — frontend  ═══ */

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

const commandsModal         = $('commandsModal');
const commandsModalBackdrop = $('commandsModalBackdrop');
const closeCommandsModalBtn = $('closeCommandsModalButton');
const openCommandsItem      = $('openCommandsMenuItem');
const commandsList          = $('commandsList');
const addCommandForm        = $('addCommandForm');

const settingsForm          = null; // replaced by per-section buttons
const githubModelInput      = $('githubModelInput');
const refreshModelsButton   = $('refreshModelsButton');
const approvalModeInput     = null; // removed for now
const mcpTokenInput         = null; // removed for now
const entityAllowlistInput  = null; // removed for now
const serviceAllowlistInput = null; // removed for now
const addonAllowlistInput   = null; // removed for now
const systemPromptInput     = null; // removed for now
const testGithubButton      = $('testTokenButton');
const saveTokenButton       = $('saveTokenButton');
const saveModelsButton      = $('saveModelsButton');
const modelsCheckboxList    = $('modelsCheckboxList');
const authStatusBox         = $('authStatusBox');

const githubClientIdInput     = null; // removed
const githubOauthTokenInput   = $('githubOauthTokenInput');
const startDeviceFlowBtn      = null; // removed
const githubAppIdInput        = null; // removed
const githubInstallationIdInput = null; // removed
const githubPrivateKeyInput   = null; // removed

// Settings nav section switching
const settingsNav = $('settingsNav');
const settingsPages = document.querySelectorAll('.settings-page');
let selectedModels = []; // user-selected models for UI

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
const PRACTICAL_DEFAULT_MODEL = 'openai/gpt-4.1-mini';
let settingsHydrated = false;
let terminalHistory = [];
let predefinedCommands = [];
let terminalHistoryCursor = -1;

// ── Helpers ──
const toJson = (v) => JSON.stringify(v, null, 2);
const listToText = (v) => (Array.isArray(v) ? v.join('\n') : '');
const uniqueStrings = (values) => [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];

function getModelMeta(model) {
  const value = String(model || '').toLowerCase();

  if (/openai\/gpt-4\.1-mini|openai\/gpt-4\.1-nano|openai\/gpt-4o-mini/.test(value)) {
    return { badge: 'polecany', badgeClass: 'recommended', rank: 100 };
  }

  if (/openai\/(gpt-5-chat|gpt-5-mini|gpt-5-nano|o1-mini|o3-mini|o4-mini)/.test(value)) {
    return { badge: 'niski limit', badgeClass: 'warning', rank: 20 };
  }

  if (/openai\/(gpt-5|o1|o3)(?:$|[^a-z0-9-])/.test(value)) {
    return { badge: 'bardzo niski limit', badgeClass: 'limited', rank: 10 };
  }

  return { badge: '', badgeClass: '', rank: 50 };
}

function sortModelsForUi(models, preferredModel) {
  const preferred = String(preferredModel || '').trim();
  return uniqueStrings(models).sort((a, b) => {
    if (a === preferred) return -1;
    if (b === preferred) return 1;
    const metaDiff = getModelMeta(b).rank - getModelMeta(a).rank;
    return metaDiff || a.localeCompare(b);
  });
}

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
  const options = sortModelsForUi([preferredModel, ...(models || [])], preferredModel);
  if (!options.length) {
    options.push(PRACTICAL_DEFAULT_MODEL);
  }

  const currentValue = preferredModel || githubModelInput.value || PRACTICAL_DEFAULT_MODEL || options[0];
  githubModelInput.innerHTML = '';
  for (const model of options) {
    const option = document.createElement('option');
    option.value = model;
    const meta = getModelMeta(model);
    option.textContent = meta.badge ? `${model} · ${meta.badge}` : model;
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
});

authorizeGithubItem.addEventListener('click', () => {
  openModal(settingsModal, settingsModalBackdrop);
  // Switch to auth section
  settingsNav.querySelectorAll('.settings-nav-item').forEach(b => b.classList.toggle('active', b.dataset.section === 'auth'));
  settingsPages.forEach(p => p.classList.toggle('active', p.dataset.section === 'auth'));
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

// Parse text into segments: plain text and fenced code blocks
function parseMessageSegments(text) {
  const segments = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', content: text.slice(last, m.index) });
    segments.push({ type: 'code', lang: m[1] || '', content: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', content: text.slice(last) });
  return segments;
}

// Check if code is previewable (HTML-like or combined HTML/CSS/JS)
function isPreviewable(lang, code) {
  const l = lang.toLowerCase();
  if (['html', 'htm'].includes(l)) return true;
  // Also check if content has HTML tags even without language tag
  if (!l && /<\w+[^>]*>/.test(code) && (/<\/\w+>/.test(code))) return true;
  return false;
}

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

  const segments = parseMessageSegments(text);
  for (const seg of segments) {
    if (seg.type === 'text') {
      const p = document.createElement('span');
      p.textContent = seg.content;
      body.appendChild(p);
    } else {
      // Code block
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block';

      // Header with lang label and buttons
      const header = document.createElement('div');
      header.className = 'code-block-header';
      const langSpan = document.createElement('span');
      langSpan.className = 'code-block-lang';
      langSpan.textContent = seg.lang || 'code';
      header.appendChild(langSpan);

      const actions = document.createElement('div');
      actions.className = 'code-block-actions';

      // Copy button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'code-action-btn';
      copyBtn.innerHTML = '<span class="mdi mdi-content-copy"></span> Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(seg.content).then(() => {
          copyBtn.innerHTML = '<span class="mdi mdi-check"></span> Copied';
          setTimeout(() => { copyBtn.innerHTML = '<span class="mdi mdi-content-copy"></span> Copy'; }, 1500);
        });
      });
      actions.appendChild(copyBtn);

      // Preview button (only for HTML-like code)
      if (isPreviewable(seg.lang, seg.content)) {
        const previewBtn = document.createElement('button');
        previewBtn.className = 'code-action-btn preview-btn';
        previewBtn.innerHTML = '<span class="mdi mdi-play-circle-outline"></span> Preview';
        previewBtn.addEventListener('click', () => openPreview(seg.content));
        actions.appendChild(previewBtn);
      }

      header.appendChild(actions);
      wrapper.appendChild(header);

      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = seg.content;
      pre.appendChild(code);
      wrapper.appendChild(pre);

      body.appendChild(wrapper);
    }
  }

  el.append(label, body);
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ══════════════════════════════════════════
//  CODE PREVIEW (mini-browser)
// ══════════════════════════════════════════
const previewModal = $('previewModal');
const previewBackdrop = $('previewModalBackdrop');
const previewFrame = $('previewFrame');
const previewConsole = $('previewConsoleLog');
const closePreviewBtn = $('closePreviewModalButton');
const clearPreviewConsoleBtn = $('clearPreviewConsoleButton');
const previewConsoleBadge = $('previewConsoleBadge');

function openPreview(htmlCode) {
  if (!previewModal || !previewFrame) return;

  // Clear previous console
  if (previewConsole) previewConsole.innerHTML = '';
  if (previewConsoleBadge) { previewConsoleBadge.textContent = ''; previewConsoleBadge.classList.remove('has-items'); }

  // Inject console capture script into the HTML
  const consoleCapture = `<script>
(function(){
  var _parent = window.parent;
  ['log','warn','error','info'].forEach(function(method){
    var orig = console[method];
    console[method] = function(){
      var args = Array.prototype.slice.call(arguments);
      var msg = args.map(function(a){
        try { return typeof a === 'object' ? JSON.stringify(a,null,2) : String(a); }
        catch(e) { return String(a); }
      }).join(' ');
      _parent.postMessage({type:'preview-console',method:method,message:msg},'*');
      if(orig) orig.apply(console,arguments);
    };
  });
  window.onerror = function(msg,src,line,col,err){
    _parent.postMessage({type:'preview-console',method:'error',message:msg+' (line '+line+')'},'*');
  };
})();
<\/script>`;

  // Insert console capture right after <head> or at the beginning
  let finalHtml = htmlCode;
  if (/<head[^>]*>/i.test(finalHtml)) {
    finalHtml = finalHtml.replace(/(<head[^>]*>)/i, '$1' + consoleCapture);
  } else if (/<html[^>]*>/i.test(finalHtml)) {
    finalHtml = finalHtml.replace(/(<html[^>]*>)/i, '$1<head>' + consoleCapture + '</head>');
  } else {
    finalHtml = consoleCapture + finalHtml;
  }

  // Show modal
  previewBackdrop.classList.remove('hidden');
  previewModal.classList.remove('hidden');
  previewModal.setAttribute('aria-hidden', 'false');

  // Write to iframe
  previewFrame.srcdoc = finalHtml;
}

function closePreview() {
  if (previewModal) { previewModal.classList.add('hidden'); previewModal.setAttribute('aria-hidden', 'true'); }
  if (previewBackdrop) previewBackdrop.classList.add('hidden');
  if (previewFrame) previewFrame.srcdoc = '';
}

if (closePreviewBtn) closePreviewBtn.addEventListener('click', closePreview);
if (previewBackdrop) previewBackdrop.addEventListener('click', closePreview);
if (clearPreviewConsoleBtn) clearPreviewConsoleBtn.addEventListener('click', () => {
  if (previewConsole) previewConsole.innerHTML = '';
  if (previewConsoleBadge) { previewConsoleBadge.textContent = ''; previewConsoleBadge.classList.remove('has-items'); }
});

// Listen for console messages from preview iframe
let previewConsoleCount = 0;
window.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'preview-console') return;
  if (!previewConsole) return;
  const line = document.createElement('div');
  line.className = 'preview-console-line ' + (e.data.method || 'log');
  const prefix = document.createElement('span');
  prefix.className = 'preview-console-prefix';
  prefix.textContent = e.data.method === 'error' ? '✕' : e.data.method === 'warn' ? '⚠' : '›';
  const msg = document.createElement('span');
  msg.textContent = e.data.message;
  line.append(prefix, msg);
  previewConsole.appendChild(line);
  previewConsole.scrollTop = previewConsole.scrollHeight;
  // Update badge
  previewConsoleCount++;
  if (previewConsoleBadge) {
    previewConsoleBadge.textContent = String(previewConsoleCount);
    previewConsoleBadge.classList.add('has-items');
  }
});

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
  } catch (err) {
    appendMessage('assistant', `Błąd: ${formatErrorMessage(err, 'Chat error')}`);
  }
});

// Enter to send (Shift+Enter for newline)
messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatForm.requestSubmit(); }
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
//  OUTPUT LOG — live GitHub API logs via SSE
// ══════════════════════════════════════════
function appendOutput(text, cssClass) {
  const line = document.createElement('div');
  line.className = 'terminal-line output' + (cssClass ? ' ' + cssClass : '');
  const pfx = document.createElement('span'); pfx.className = 'terminal-prefix'; pfx.textContent = '›';
  const body = document.createElement('pre'); body.className = 'terminal-body'; body.textContent = text;
  body.style.whiteSpace = 'pre-wrap'; body.style.wordBreak = 'break-all'; body.style.margin = '0';
  line.append(pfx, body);
  outputLog.appendChild(line);
  // Keep max 500 entries
  while (outputLog.children.length > 500) outputLog.removeChild(outputLog.firstChild);
  outputLog.scrollTop = outputLog.scrollHeight;
}

function formatApiLog(entry) {
  const ts = entry.ts ? entry.ts.split('T')[1]?.replace('Z','') : '';
  if (entry.direction === 'req') {
    const hdrs = entry.headers ? '\n  Headers: ' + JSON.stringify(entry.headers) : '';
    const body = entry.body ? '\n  Body: ' + (typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body, null, 2)) : '';
    return `[${ts}] ▶ ${entry.method} ${entry.url}${hdrs}${body}`;
  }
  const status = entry.status ? ` ${entry.status}` : '';
  const dur = entry.durationMs !== undefined ? ` (${entry.durationMs}ms)` : '';
  const err = entry.error ? `\n  Error: ${entry.error}` : '';
  const body = entry.body ? '\n  Body: ' + (typeof entry.body === 'string' ? entry.body.slice(0, 3000) : JSON.stringify(entry.body, null, 2)) : '';
  return `[${ts}] ◀${status}${dur} ${entry.method} ${entry.url}${err}${body}`;
}

function connectLogSSE() {
  const es = new EventSource(apiUrl('api/logs/stream'));
  es.onmessage = (event) => {
    try {
      const entry = JSON.parse(event.data);
      if (entry.connected) {
        appendOutput('🔌 Log stream podłączony', 'log-connected');
        return;
      }
      const isError = (entry.status && entry.status >= 400) || entry.error;
      appendOutput(formatApiLog(entry), isError ? 'log-error' : (entry.direction === 'req' ? 'log-req' : 'log-res'));
    } catch { /* ignore parse errors */ }
  };
  es.onerror = () => {
    appendOutput('⚠ Log stream rozłączony — reconnecing…', 'log-error');
  };
}
connectLogSSE();

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
  githubModelInput.dataset.savedValue = s.effectiveConfig.githubModelsDefaultModel ?? PRACTICAL_DEFAULT_MODEL;
  settingsHydrated = true;
}

// ── Approvals UI ──
const approvalsListUI = $('approvalsListUI');
const approvalNavBadge = $('approvalNavBadge');
const refreshApprovalsButton = $('refreshApprovalsButton');

function renderApprovalsUI(entries) {
  const pending = entries.filter(e => e.status === 'pending');
  // Update badge
  if (approvalNavBadge) {
    approvalNavBadge.textContent = pending.length ? String(pending.length) : '';
    approvalNavBadge.classList.toggle('has-items', pending.length > 0);
  }
  if (approvalCount) approvalCount.textContent = String(pending.length);

  if (!approvalsListUI) return;
  if (!entries.length) {
    approvalsListUI.innerHTML = '<p class="muted-text">Brak oczekujących zatwierdzeń.</p>';
    return;
  }

  approvalsListUI.innerHTML = '';
  // Show pending first, then resolved (most recent first)
  const sorted = [...entries].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  for (const entry of sorted.slice(0, 50)) {
    const card = document.createElement('div');
    card.className = 'approval-card' + (entry.status === 'pending' ? ' pending' : ' resolved');

    const typeLabel = {
      service_call: 'Usługa HA',
      shell_command: 'Shell',
      workspace_mutation: 'Plik',
    }[entry.type] || entry.type;

    const statusLabel = {
      pending: '⏳ Oczekuje',
      approved: '✅ Zatwierdzono',
      rejected: '❌ Odrzucono',
    }[entry.status] || entry.status;

    let payloadPreview = '';
    try {
      const p = entry.payload;
      if (entry.type === 'service_call') payloadPreview = `${p.service} → ${(p.entityIds || []).join(', ')}`;
      else if (entry.type === 'shell_command') payloadPreview = p.command || '';
      else if (entry.type === 'workspace_mutation') payloadPreview = `${p.operation}: ${p.path}`;
      else payloadPreview = JSON.stringify(p).slice(0, 200);
    } catch { payloadPreview = '—'; }

    card.innerHTML = `
      <div class="approval-card-header">
        <span class="approval-type-badge">${esc(typeLabel)}</span>
        <span class="approval-status ${entry.status}">${statusLabel}</span>
        <span class="approval-time">${new Date(entry.createdAt).toLocaleString()}</span>
      </div>
      <div class="approval-summary">${esc(entry.summary)}</div>
      <pre class="approval-payload">${esc(payloadPreview)}</pre>
    `;

    if (entry.status === 'pending') {
      const actions = document.createElement('div');
      actions.className = 'approval-card-actions';
      const approveBtn = document.createElement('button');
      approveBtn.className = 'primary-button';
      approveBtn.innerHTML = '<span class="mdi mdi-check"></span> Approve';
      approveBtn.addEventListener('click', async () => {
        approveBtn.disabled = true;
        try {
          await fetch(apiUrl(`api/approvals/${entry.id}/approve`), { method: 'POST' });
          termLine('system', `Approved: ${entry.summary}`);
          await loadApprovals();
        } catch (err) { termLine('error', `Approve error: ${formatErrorMessage(err)}`); }
      });
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'secondary-button reject-button';
      rejectBtn.innerHTML = '<span class="mdi mdi-close"></span> Reject';
      rejectBtn.addEventListener('click', async () => {
        rejectBtn.disabled = true;
        try {
          await fetch(apiUrl(`api/approvals/${entry.id}/reject`), { method: 'POST' });
          termLine('system', `Rejected: ${entry.summary}`);
          await loadApprovals();
        } catch (err) { termLine('error', `Reject error: ${formatErrorMessage(err)}`); }
      });
      actions.append(approveBtn, rejectBtn);
      card.appendChild(actions);
    }

    approvalsListUI.appendChild(card);
  }
}

async function loadApprovals() {
  try {
    const data = await loadJson(apiUrl('api/approvals'));
    renderApprovalsUI(data.entries || []);
  } catch {
    if (approvalsListUI) approvalsListUI.innerHTML = '<p class="muted-text">Błąd ładowania zatwierdzeń.</p>';
  }
}

if (refreshApprovalsButton) {
  refreshApprovalsButton.addEventListener('click', () => loadApprovals());
}

// Auto-refresh approvals every 5 seconds
setInterval(() => loadApprovals(), 5000);
// Initial load
loadApprovals();

// ── Settings nav switching ──
if (settingsNav) {
  settingsNav.addEventListener('click', e => {
    const btn = e.target.closest('.settings-nav-item');
    if (!btn) return;
    const section = btn.dataset.section;
    settingsNav.querySelectorAll('.settings-nav-item').forEach(b => b.classList.toggle('active', b === btn));
    settingsPages.forEach(p => p.classList.toggle('active', p.dataset.section === section));
  });
}

// ── Test token ──
testGithubButton.addEventListener('click', async () => {
  const token = githubOauthTokenInput.value.trim();
  authStatusBox.className = 'auth-status-box';
  authStatusBox.textContent = 'Testowanie…';

  if (!token) {
    // Test with existing saved token
    try {
      const res = await loadJson(apiUrl('api/github/status'));
      if (res.ok) {
        authStatusBox.className = 'auth-status-box ok';
        authStatusBox.textContent = `✓ Połączono. Modele: ${res.modelAccess?.modelCount ?? '?'}, authMode: ${res.authMode}`;
      } else {
        authStatusBox.className = 'auth-status-box fail';
        authStatusBox.textContent = `✗ ${res.message || 'Token nie skonfigurowany.'}`;
      }
    } catch (err) {
      authStatusBox.className = 'auth-status-box fail';
      authStatusBox.textContent = `✗ ${formatErrorMessage(err, 'Test failed')}`;
    }
    return;
  }

  if (!isValidTokenFormat(token)) {
    authStatusBox.className = 'auth-status-box fail';
    authStatusBox.textContent = '✗ Nieprawidłowy format tokena. Token musi zaczynać się od: github_pat_, gho_, ghu_ lub ghp_';
    return;
  }

  // Save temporarily then test
  try {
    await fetch(apiUrl('api/settings'), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_oauth_token: token }),
    });
    const res = await loadJson(apiUrl('api/github/status'));
    if (res.ok) {
      authStatusBox.className = 'auth-status-box ok';
      authStatusBox.textContent = `✓ Połączono! Modele: ${res.modelAccess?.modelCount ?? '?'}`;
      githubOauthTokenInput.value = '';
      termLine('system', 'Token saved & verified.');
      await refresh({ forceSettings: true });
      await loadAndRenderModels();
    } else {
      authStatusBox.className = 'auth-status-box fail';
      authStatusBox.textContent = `✗ Token zapisany, ale test nieudany: ${res.message || 'unknown error'}`;
    }
  } catch (err) {
    authStatusBox.className = 'auth-status-box fail';
    authStatusBox.textContent = `✗ ${formatErrorMessage(err, 'Test failed')}`;
  }
});

// ── Token format validation ──
const VALID_TOKEN_PREFIXES = ['github_pat_', 'gho_', 'ghu_', 'ghp_'];
function isValidTokenFormat(token) {
  return VALID_TOKEN_PREFIXES.some(prefix => token.startsWith(prefix));
}

// ── Save token ──
saveTokenButton.addEventListener('click', async () => {
  const token = githubOauthTokenInput.value.trim();
  if (!token) {
    authStatusBox.className = 'auth-status-box fail';
    authStatusBox.textContent = 'Wklej token przed zapisaniem.';
    return;
  }
  if (!isValidTokenFormat(token)) {
    authStatusBox.className = 'auth-status-box fail';
    authStatusBox.textContent = '✗ Nieprawidłowy format tokena. Token musi zaczynać się od: github_pat_, gho_, ghu_ lub ghp_';
    return;
  }

  try {
    const res = await fetch(apiUrl('api/settings'), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_oauth_token: token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Save error');
    authStatusBox.className = 'auth-status-box ok';
    authStatusBox.textContent = '✓ Token zapisany.';
    githubOauthTokenInput.value = '';
    termLine('system', 'Token saved.');
    settingsHydrated = false;
    await refresh({ forceSettings: true });
    await loadAndRenderModels();
  } catch (err) {
    authStatusBox.className = 'auth-status-box fail';
    authStatusBox.textContent = `✗ ${formatErrorMessage(err, 'Save error')}`;
  }
});

// ── Models: load and render with checkboxes ──
async function loadAndRenderModels() {
  try {
    const data = await loadJson(apiUrl('api/models'));
    const models = data.models || [];
    const current = data.selected || PRACTICAL_DEFAULT_MODEL;

    // Load saved selection from localStorage
    try { selectedModels = JSON.parse(localStorage.getItem('copilot_selected_models') || '[]'); } catch { selectedModels = []; }
    if (!selectedModels.length) selectedModels = [current];

    renderModelCheckboxes(models, current);
    renderModelOptions(models, current);
    if (modelsBox) modelsBox.textContent = toJson(data);
    termLine('system', `Models loaded: ${models.length}`);
  } catch (err) {
    modelsCheckboxList.innerHTML = `<p class="muted-text">Błąd ładowania: ${formatErrorMessage(err, 'error')}</p>`;
  }
}

function renderModelCheckboxes(models, defaultModel) {
  modelsCheckboxList.innerHTML = '';
  if (!models.length) {
    modelsCheckboxList.innerHTML = '<p class="muted-text">Brak modeli. Zapisz token i kliknij Odśwież.</p>';
    return;
  }
  for (const model of sortModelsForUi(models, defaultModel)) {
    const isChecked = selectedModels.includes(model);
    const isDefault = model === defaultModel;
    const meta = getModelMeta(model);
    const item = document.createElement('label');
    item.className = 'model-checkbox-item' + (isChecked ? ' selected' : '');
    item.innerHTML = `
      <input type="checkbox" value="${esc(model)}" ${isChecked ? 'checked' : ''} />
      <span class="model-name">${esc(model)}</span>
      ${meta.badge ? `<span class="model-tier-badge ${meta.badgeClass}">${meta.badge}</span>` : ''}
      ${isDefault ? '<span class="model-default-badge">default</span>' : ''}
    `;
    const checkbox = item.querySelector('input');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (!selectedModels.includes(model)) selectedModels.push(model);
      } else {
        selectedModels = selectedModels.filter(m => m !== model);
      }
      item.classList.toggle('selected', checkbox.checked);
    });
    modelsCheckboxList.appendChild(item);
  }
}

// ── Save model selection ──
saveModelsButton.addEventListener('click', async () => {
  if (!selectedModels.length) {
    termLine('error', 'Wybierz przynajmniej jeden model.');
    return;
  }
  localStorage.setItem('copilot_selected_models', JSON.stringify(selectedModels));

  // Set the first selected as default model
  const defaultModel = selectedModels[0];
  try {
    await fetch(apiUrl('api/settings'), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_model: defaultModel }),
    });
    termLine('system', `Zapisano ${selectedModels.length} modeli. Domyślny: ${defaultModel}`);
    const meta = getModelMeta(defaultModel);
    if (meta.badgeClass === 'warning' || meta.badgeClass === 'limited') {
      termLine('system', `Uwaga: ${defaultModel} ma niski limit w GitHub Models API. Do codziennej pracy lepszy będzie ${PRACTICAL_DEFAULT_MODEL}.`);
    }
    settingsHydrated = false;
    await refresh({ forceSettings: true });
  } catch (err) {
    termLine('error', `Błąd zapisu modeli: ${formatErrorMessage(err, 'error')}`);
  }
});

refreshModelsButton.addEventListener('click', async () => {
  refreshModelsButton.disabled = true;
  await loadAndRenderModels();
  refreshModelsButton.disabled = false;
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
  const [health, config, github, settings, models] = await Promise.all([
    tryLoad(apiUrl('api/health')), tryLoad(apiUrl('api/config')), tryLoad(apiUrl('api/github/status')),
    tryLoad(apiUrl('api/settings')), tryLoad(apiUrl('api/models')),
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
    if (configBox) configBox.textContent = toJson(config.data);
    setSbStatus(haStatusLabel, config.data.haLive, config.data.haLive ? 'HA live' : 'HA mock');
  } else {
    if (configBox) configBox.textContent = config.error;
    setSbStatus(haStatusLabel, false, 'HA err');
  }

  // GitHub
  if (github.ok) {
    if (githubStatusBox) githubStatusBox.textContent = toJson(github.data);
    setSbStatus(githubStatusLabel, github.data.ok, github.data.ok ? 'connected' : github.data.configured ? 'failing' : 'not configured');
  } else {
    if (githubStatusBox) githubStatusBox.textContent = github.error;
    setSbStatus(githubStatusLabel, false, 'error');
  }

  // Settings
  if (settings.ok && (!settingsHydrated || forceSettings)) hydrateSettings(settings.data);

  const preferredModel = githubModelInput.value || githubModelInput.dataset.savedValue || settings.data?.effectiveConfig?.githubModelsDefaultModel || PRACTICAL_DEFAULT_MODEL;
  renderModelOptions(models.ok ? models.data.models : [preferredModel], preferredModel);

  // Model label
  if (settings.ok) modelLabel.textContent = settings.data.effectiveConfig.githubModelsDefaultModel ?? '—';

  if (modelsBox) modelsBox.textContent = models.ok ? toJson(models.data) : models.error;

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
  'Witaj w Copilot Brain.\nChat u góry, terminal na dole. Przeciągnij pasek aby zmienić proporcje.\nFile → Settings aby skonfigurować token i modele.\nAgent ma podstawowe toolsy: odczyt plików, listowanie katalogów, search/grep, edycję plików z approval i /shell <polecenie> (z approval).');

focusTerminalInput();
refresh({ forceSettings: true });
setInterval(() => refresh(), 300000); // 5 min
