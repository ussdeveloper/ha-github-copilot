const healthText = document.getElementById('healthText');
const serviceBadge = document.getElementById('serviceBadge');
const haStatusBadge = document.getElementById('haStatusBadge');
const githubStatusBadge = document.getElementById('githubStatusBadge');
const versionChip = document.getElementById('versionChip');

const configBox = document.getElementById('configBox');
const githubStatusBox = document.getElementById('githubStatusBox');
const contextBox = document.getElementById('contextBox');
const modelsBox = document.getElementById('modelsBox');
const auditBox = document.getElementById('auditBox');
const approvalsBox = document.getElementById('approvalsBox');
const approvalCount = document.getElementById('approvalCount');

const chatLog = document.getElementById('chatLog');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');

const terminalLog = document.getElementById('terminalLog');
const terminalForm = document.getElementById('terminalForm');
const terminalInput = document.getElementById('terminalInput');
const terminalClearButton = document.getElementById('terminalClearButton');

const settingsForm = document.getElementById('settingsForm');
const githubModelInput = document.getElementById('githubModelInput');
const approvalModeInput = document.getElementById('approvalModeInput');
const mcpTokenInput = document.getElementById('mcpTokenInput');
const githubAppIdInput = document.getElementById('githubAppIdInput');
const githubInstallationIdInput = document.getElementById('githubInstallationIdInput');
const githubPrivateKeyInput = document.getElementById('githubPrivateKeyInput');
const entityAllowlistInput = document.getElementById('entityAllowlistInput');
const serviceAllowlistInput = document.getElementById('serviceAllowlistInput');
const addonAllowlistInput = document.getElementById('addonAllowlistInput');
const systemPromptInput = document.getElementById('systemPromptInput');
const testGithubButton = document.getElementById('testGithubButton');

const menuButtons = Array.from(document.querySelectorAll('[data-target]'));
const quickCommandButtons = Array.from(document.querySelectorAll('[data-terminal-command]'));

const terminalHistoryKey = 'copilot-brain-terminal-history-v1';
let settingsHydrated = false;
let terminalHistory = [];

function listToTextarea(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function stringify(value) {
  return JSON.stringify(value, null, 2);
}

function setBadgeState(element, state, label) {
  element.classList.remove('ok', 'warning', 'error', 'neutral');
  element.classList.add(state);
  element.textContent = label;
}

function appendMessage(role, text) {
  const element = document.createElement('article');
  element.className = `message ${role}`;

  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'Ty' : 'Copilot Brain';

  const body = document.createElement('div');
  body.className = 'message-body';
  body.textContent = text;

  element.append(label, body);
  chatLog.appendChild(element);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function getTerminalPrefix(kind) {
  switch (kind) {
    case 'command':
      return '$';
    case 'error':
      return '!';
    case 'system':
      return '#';
    default:
      return '›';
  }
}

function persistTerminalHistory() {
  sessionStorage.setItem(terminalHistoryKey, JSON.stringify(terminalHistory.slice(-200)));
}

function renderTerminalHistory() {
  terminalLog.innerHTML = '';

  for (const entry of terminalHistory) {
    const line = document.createElement('div');
    line.className = `terminal-line ${entry.kind}`;

    const prefix = document.createElement('span');
    prefix.className = 'terminal-prefix';
    prefix.textContent = getTerminalPrefix(entry.kind);

    const body = document.createElement('div');
    body.className = 'terminal-body';
    body.textContent = entry.text;

    line.append(prefix, body);
    terminalLog.appendChild(line);
  }

  terminalLog.scrollTop = terminalLog.scrollHeight;
}

function appendTerminalLine(kind, text) {
  terminalHistory.push({ kind, text, at: new Date().toISOString() });
  persistTerminalHistory();
  renderTerminalHistory();
}

function clearTerminalHistory(message) {
  terminalHistory = [];
  persistTerminalHistory();
  renderTerminalHistory();
  if (message) {
    appendTerminalLine('system', message);
  }
}

function hydrateSettings(settings) {
  githubModelInput.value = settings.effectiveConfig.githubModelsDefaultModel ?? '';
  approvalModeInput.value = settings.effectiveConfig.approvalMode ?? 'explicit';
  githubAppIdInput.value = settings.effectiveConfig.githubAppId ?? '';
  githubInstallationIdInput.value = settings.effectiveConfig.githubAppInstallationId ?? '';
  entityAllowlistInput.value = listToTextarea(settings.effectiveConfig.entityAllowlist);
  serviceAllowlistInput.value = listToTextarea(settings.effectiveConfig.serviceAllowlist);
  addonAllowlistInput.value = listToTextarea(settings.effectiveConfig.addonAllowlist);
  systemPromptInput.value = settings.effectiveConfig.systemPromptTemplate ?? '';
  settingsHydrated = true;
}

function renderApprovals(entries) {
  approvalCount.textContent = String(entries.length);

  if (!entries.length) {
    approvalsBox.textContent = 'Brak oczekujących zatwierdzeń.';
    return;
  }

  approvalsBox.innerHTML = '';

  for (const entry of entries) {
    const wrapper = document.createElement('article');
    wrapper.className = 'approval-item';

    const title = document.createElement('h3');
    title.textContent = entry.summary;

    const meta = document.createElement('div');
    meta.className = 'approval-meta';
    meta.textContent = `${entry.id} · ${entry.status} · ${new Date(entry.createdAt).toLocaleString()}`;

    const payload = document.createElement('pre');
    payload.textContent = stringify(entry.payload);

    wrapper.append(title, meta, payload);

    if (entry.status === 'pending') {
      const actions = document.createElement('div');
      actions.className = 'approval-actions';

      const approveButton = document.createElement('button');
      approveButton.type = 'button';
      approveButton.textContent = 'Approve';
      approveButton.addEventListener('click', async () => {
        const response = await fetch(`/api/approvals/${entry.id}/approve`, { method: 'POST' });
        const body = await response.json();
        if (!response.ok) {
          appendTerminalLine('error', body.error ?? `Approval ${entry.id} failed.`);
          return;
        }

        appendTerminalLine('system', `Approval ${entry.id} approved.`);
        await refresh();
      });

      const rejectButton = document.createElement('button');
      rejectButton.type = 'button';
      rejectButton.className = 'reject';
      rejectButton.textContent = 'Reject';
      rejectButton.addEventListener('click', async () => {
        const response = await fetch(`/api/approvals/${entry.id}/reject`, { method: 'POST' });
        const body = await response.json();
        if (!response.ok) {
          appendTerminalLine('error', body.error ?? `Reject ${entry.id} failed.`);
          return;
        }

        appendTerminalLine('system', `Approval ${entry.id} rejected.`);
        await refresh();
      });

      actions.append(approveButton, rejectButton);
      wrapper.appendChild(actions);
    }

    approvalsBox.appendChild(wrapper);
  }
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    let message = `Request failed for ${url}: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) {
        message = body.error;
      }
    } catch {
      // ignore parse failures
    }
    throw new Error(message);
  }

  return response.json();
}

async function loadJsonResult(url) {
  try {
    return { ok: true, data: await loadJson(url) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function refresh(options = {}) {
  const { forceSettings = false } = options;

  const [healthResult, configResult, githubResult, settingsResult, contextResult, modelsResult, auditResult, approvalsResult] =
    await Promise.all([
      loadJsonResult('/api/health'),
      loadJsonResult('/api/config'),
      loadJsonResult('/api/github/status'),
      loadJsonResult('/api/settings'),
      loadJsonResult('/api/context'),
      loadJsonResult('/api/models'),
      loadJsonResult('/api/audit'),
      loadJsonResult('/api/approvals'),
    ]);

  if (healthResult.ok) {
    const health = healthResult.data;
    setBadgeState(serviceBadge, 'ok', `${health.service} online`);
    healthText.textContent = `${health.service} ${health.version} · ${health.stage} · ${new Date(health.time).toLocaleString()}`;
    versionChip.textContent = `v${health.version} · ${health.stage}`;
    document.title = `Copilot Brain ${health.version}`;
  } else {
    setBadgeState(serviceBadge, 'error', 'Service error');
    healthText.textContent = healthResult.error;
  }

  if (configResult.ok) {
    const config = configResult.data;
    configBox.textContent = stringify(config);
    setBadgeState(haStatusBadge, config.haLive ? 'ok' : 'warning', config.haLive ? 'HA live' : 'HA mock mode');
  } else {
    configBox.textContent = configResult.error;
    setBadgeState(haStatusBadge, 'error', 'HA unavailable');
  }

  if (githubResult.ok) {
    const githubStatus = githubResult.data;
    githubStatusBox.textContent = stringify(githubStatus);

    if (githubStatus.ok) {
      setBadgeState(githubStatusBadge, 'ok', 'GitHub connected');
    } else if (githubStatus.configured) {
      setBadgeState(githubStatusBadge, 'error', 'GitHub failing');
    } else {
      setBadgeState(githubStatusBadge, 'warning', 'GitHub not configured');
    }
  } else {
    githubStatusBox.textContent = githubResult.error;
    setBadgeState(githubStatusBadge, 'error', 'GitHub status error');
  }

  if (settingsResult.ok && (!settingsHydrated || forceSettings)) {
    hydrateSettings(settingsResult.data);
  }

  if (contextResult.ok) {
    const context = contextResult.data;
    contextBox.textContent = [context.entitiesSummary, '', context.addonsSummary].join('\n');
  } else {
    contextBox.textContent = contextResult.error;
  }

  modelsBox.textContent = modelsResult.ok ? stringify(modelsResult.data) : modelsResult.error;
  auditBox.textContent = auditResult.ok ? stringify(auditResult.data.entries) : auditResult.error;

  if (approvalsResult.ok) {
    renderApprovals(approvalsResult.data.entries);
  } else {
    approvalsBox.textContent = approvalsResult.error;
    approvalCount.textContent = '!';
  }
}

for (const button of menuButtons) {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.target);
    if (!target) {
      return;
    }

    for (const candidate of menuButtons) {
      candidate.classList.remove('active');
    }

    button.classList.add('active');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

for (const button of quickCommandButtons) {
  button.addEventListener('click', () => {
    terminalInput.value = button.dataset.terminalCommand ?? '';
    terminalInput.focus();
  });
}

testGithubButton.addEventListener('click', async () => {
  try {
    testGithubButton.disabled = true;
    const response = await fetch('/api/github/test-auth', { method: 'POST' });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? 'Unknown GitHub auth error');
    }

    appendMessage(
      'assistant',
      `GitHub auth test OK. Token issued: ${body.installationTokenIssued ? 'yes' : 'no'}. Visible models: ${body.modelAccess?.modelCount ?? 0}.`,
    );
    appendTerminalLine('system', 'GitHub auth test completed successfully.');
    await refresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendMessage('assistant', `GitHub auth test failed: ${message}`);
    appendTerminalLine('error', `GitHub auth test failed: ${message}`);
    setBadgeState(githubStatusBadge, 'error', 'GitHub failing');
  } finally {
    testGithubButton.disabled = false;
  }
});

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    github_model: githubModelInput.value.trim(),
    approval_mode: approvalModeInput.value,
    mcp_auth_token: mcpTokenInput.value.trim(),
    github_app_id: githubAppIdInput.value.trim(),
    github_app_installation_id: githubInstallationIdInput.value.trim(),
    github_app_private_key: githubPrivateKeyInput.value.trim(),
    entity_allowlist: entityAllowlistInput.value,
    service_allowlist: serviceAllowlistInput.value,
    addon_allowlist: addonAllowlistInput.value,
    system_prompt_template: systemPromptInput.value,
  };

  try {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? 'Unknown settings error');
    }

    appendMessage('assistant', 'Ustawienia zostały zapisane.');
    appendTerminalLine('system', 'Runtime settings updated.');
    mcpTokenInput.value = '';
    githubPrivateKeyInput.value = '';
    settingsHydrated = false;
    await refresh({ forceSettings: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendMessage('assistant', `Błąd zapisu ustawień: ${message}`);
    appendTerminalLine('error', `Settings update failed: ${message}`);
  }
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) {
    return;
  }

  appendMessage('user', message);
  messageInput.value = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? 'Unknown chat error');
    }

    appendMessage('assistant', payload.reply);
    await refresh();
  } catch (error) {
    appendMessage('assistant', `Błąd: ${error instanceof Error ? error.message : String(error)}`);
  }
});

terminalForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const command = terminalInput.value.trim();
  if (!command) {
    return;
  }

  appendTerminalLine('command', command);
  terminalInput.value = '';

  try {
    const response = await fetch('/api/terminal/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command }),
    });

    const payload = await response.json();
    if (payload.clear) {
      clearTerminalHistory(payload.output);
    } else {
      appendTerminalLine(payload.ok ? 'output' : 'error', payload.output ?? 'No output.');
    }

    if (!response.ok && !payload.ok) {
      return;
    }

    await refresh();
  } catch (error) {
    appendTerminalLine('error', error instanceof Error ? error.message : String(error));
  }
});

terminalClearButton.addEventListener('click', () => {
  clearTerminalHistory('Console cleared locally.');
  terminalInput.focus();
});

try {
  terminalHistory = JSON.parse(sessionStorage.getItem(terminalHistoryKey) ?? '[]');
  if (!Array.isArray(terminalHistory)) {
    terminalHistory = [];
  }
} catch {
  terminalHistory = [];
}

if (terminalHistory.length === 0) {
  appendTerminalLine('system', 'Copilot Brain terminal ready. Run help to see supported commands.');
  appendTerminalLine('system', 'This is a guarded HA console, not a raw shell. Tiny difference, gigantic security benefit.');
} else {
  renderTerminalHistory();
}

appendMessage(
  'assistant',
  'Witaj w Copilot Brain 0.2.0. Masz u góry chat, na dole terminal HA, a z lewej menu pod kolejne funkcje. Zacznij od /entities albo komendy help w terminalu.',
);

refresh({ forceSettings: true });
