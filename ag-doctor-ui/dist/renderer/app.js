"use strict";
/**
 * ag-doctor UI — renderer controller.
 * Vanilla TypeScript, talks to the main process via window.ag (preload bridge).
 */
// ─────────────────────────────────────────────────────────────────────────────
// DOM helpers
// ─────────────────────────────────────────────────────────────────────────────
const $ = (sel) => {
    const el = document.querySelector(sel);
    if (!el)
        throw new Error(`Missing element: ${sel}`);
    return el;
};
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function maskKey(k) {
    if (!k)
        return '(none)';
    if (k.length <= 8)
        return '***';
    return `${k.slice(0, 3)}...${k.slice(-4)}`;
}
// ─────────────────────────────────────────────────────────────────────────────
// Status pill
// ─────────────────────────────────────────────────────────────────────────────
const statusPill = $('#statusPill');
const statusText = $('#statusText');
function setStatus(text, kind = 'ready') {
    statusText.textContent = text;
    statusPill.classList.remove('busy', 'err');
    if (kind !== 'ready')
        statusPill.classList.add(kind);
}
// ─────────────────────────────────────────────────────────────────────────────
// Toasts
// ─────────────────────────────────────────────────────────────────────────────
const toastContainer = $('#toastContainer');
const TOAST_ICONS = {
    ok: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    err: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};
function toast(message, kind = 'info', durationMs = 3500) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<div class="toast-icon">${TOAST_ICONS[kind]}</div><div>${escapeHtml(message)}</div>`;
    toastContainer.appendChild(el);
    setTimeout(() => {
        el.classList.add('removing');
        setTimeout(() => el.remove(), 250);
    }, durationMs);
}
// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────
const modalBackdrop = $('#modalBackdrop');
const modalTitle = $('#modalTitle');
const modalBody = $('#modalBody');
const modalConfirm = $('#modalConfirm');
const modalCancel = $('#modalCancel');
const modalClose = $('#modalClose');
function confirmModal(title, body, opts) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalBody.innerHTML = body;
        modalConfirm.textContent = opts?.confirmLabel ?? 'Confirm';
        modalConfirm.className = `btn ${opts?.danger ? 'btn-danger' : 'btn-primary'}`;
        modalBackdrop.hidden = false;
        const cleanup = (result) => {
            modalBackdrop.hidden = true;
            modalConfirm.removeEventListener('click', onConfirm);
            modalCancel.removeEventListener('click', onCancel);
            modalClose.removeEventListener('click', onCancel);
            modalBackdrop.removeEventListener('click', onBackdrop);
            resolve(result);
        };
        const onConfirm = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onBackdrop = (e) => {
            if (e.target === modalBackdrop)
                cleanup(false);
        };
        modalConfirm.addEventListener('click', onConfirm);
        modalCancel.addEventListener('click', onCancel);
        modalClose.addEventListener('click', onCancel);
        modalBackdrop.addEventListener('click', onBackdrop);
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────
const navItems = $$('.nav-item');
const views = $$('.view');
function navigate(viewName) {
    navItems.forEach((n) => n.classList.toggle('active', n.dataset.view === viewName));
    views.forEach((v) => v.classList.toggle('active', v.id === `view-${viewName}`));
    // Trigger view-specific loaders
    if (viewName === 'models')
        void loadModels();
    if (viewName === 'patch')
        void loadPatchStatus();
    if (viewName === 'info')
        void loadInfo();
    if (viewName === 'logs')
        void loadLogs();
}
navItems.forEach((n) => n.addEventListener('click', () => navigate(n.dataset.view)));
// ─────────────────────────────────────────────────────────────────────────────
// Doctor / dashboard
// ─────────────────────────────────────────────────────────────────────────────
const healthList = $('#healthList');
const statOk = $('#statOk');
const statWarn = $('#statWarn');
const statErr = $('#statErr');
const statModels = $('#statModels');
const lastRunBadge = $('#lastRunBadge');
let lastResults = [];
function renderHealthList(results) {
    if (results.length === 0) {
        healthList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        </div>
        <p>Click <strong>Run doctor</strong> to start a diagnostic.</p>
      </div>`;
        return;
    }
    healthList.innerHTML = results
        .map((r, i) => {
        const icon = r.status === 'ok'
            ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
            : r.status === 'warn'
                ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
                : r.status === 'error'
                    ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
                    : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        const detailsHtml = r.details
            ? `<div class="health-details">${escapeHtml(r.details)}</div><div class="health-expand">Show details</div>`
            : '';
        return `
        <div class="health-item" style="animation-delay:${i * 40}ms" data-id="${r.id}">
          <div class="health-icon ${r.status}">${icon}</div>
          <div class="health-body">
            <div class="health-title">${escapeHtml(r.title)}</div>
            <div class="health-message">${escapeHtml(r.message)}</div>
            ${detailsHtml}
          </div>
        </div>`;
    })
        .join('');
    // Wire expand toggles
    $$('.health-item').forEach((item) => {
        const expander = item.querySelector('.health-expand');
        if (expander) {
            expander.addEventListener('click', () => item.classList.toggle('expanded'));
        }
    });
}
function updateStats(results) {
    const ok = results.filter((r) => r.status === 'ok').length;
    const warn = results.filter((r) => r.status === 'warn').length;
    const err = results.filter((r) => r.status === 'error').length;
    const modelsCheck = results.find((r) => r.id === 'models');
    const modelsCount = modelsCheck?.data && typeof modelsCheck.data === 'object' && 'count' in modelsCheck.data
        ? modelsCheck.data.count
        : 0;
    statOk.textContent = String(ok);
    statWarn.textContent = String(warn);
    statErr.textContent = String(err);
    statModels.textContent = String(modelsCount);
    lastRunBadge.textContent = new Date().toLocaleTimeString();
}
async function runDoctor() {
    setStatus('Running diagnostic…', 'busy');
    $('#runDoctorBtn')?.setAttribute('disabled', 'true');
    $('#refreshBtn')?.setAttribute('disabled', 'true');
    $('#quickRunBtn')?.setAttribute('disabled', 'true');
    try {
        const result = await window.ag.run(['doctor', '--json']);
        if (result.code !== 0 && !result.stdout) {
            throw new Error(result.stderr || `Exit ${result.code}`);
        }
        const data = JSON.parse(result.stdout);
        lastResults = data;
        renderHealthList(data);
        updateStats(data);
        toast(`Diagnostic complete · ${data.length} checks`, 'ok');
        setStatus('Ready');
    }
    catch (e) {
        toast(`Doctor failed: ${e.message}`, 'err', 5000);
        setStatus('Error', 'err');
    }
    finally {
        $('#runDoctorBtn')?.removeAttribute('disabled');
        $('#refreshBtn')?.removeAttribute('disabled');
        $('#quickRunBtn')?.removeAttribute('disabled');
    }
}
$('#runDoctorBtn').addEventListener('click', () => void runDoctor());
$('#quickRunBtn').addEventListener('click', () => void runDoctor());
$('#refreshBtn').addEventListener('click', () => void runDoctor());
// ─────────────────────────────────────────────────────────────────────────────
// Diagnostic view
// ─────────────────────────────────────────────────────────────────────────────
const doctorOutput = $('#doctorOutput');
function ansiToHtml(s) {
    // Strip ANSI escape codes and replace with HTML spans for known sequences
    return escapeHtml(s)
        .replace(/\x1b\[32m/g, '<span class="t-ok">')
        .replace(/\x1b\[33m/g, '<span class="t-warn">')
        .replace(/\x1b\[31m/g, '<span class="t-err">')
        .replace(/\x1b\[36m/g, '<span class="t-info">')
        .replace(/\x1b\[90m/g, '<span class="t-dim">')
        .replace(/\x1b\[1m/g, '<span class="t-bold">')
        .replace(/\x1b\[22m/g, '</span>')
        .replace(/\x1b\[39m/g, '</span>')
        .replace(/\x1b\[0m/g, '</span>');
}
async function runDoctorView() {
    setStatus('Running diagnostic…', 'busy');
    doctorOutput.textContent = '$ ag-doctor doctor\n';
    try {
        const result = await window.ag.run(['doctor']);
        doctorOutput.innerHTML = ansiToHtml(result.stdout || result.stderr);
        setStatus('Ready');
    }
    catch (e) {
        doctorOutput.textContent = `Error: ${e.message}`;
        setStatus('Error', 'err');
    }
}
$('#doctorRunBtn').addEventListener('click', () => void runDoctorView());
$('#doctorJsonBtn').addEventListener('click', async () => {
    setStatus('Loading JSON…', 'busy');
    try {
        const result = await window.ag.run(['doctor', '--json']);
        doctorOutput.textContent = result.stdout || result.stderr;
        setStatus('Ready');
    }
    catch (e) {
        toast(`Failed: ${e.message}`, 'err');
        setStatus('Error', 'err');
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// Models view
// ──────���──────────────────────────────────────────────────────────────────────
const modelsList = $('#modelsList');
async function loadModels() {
    setStatus('Loading models…', 'busy');
    modelsList.innerHTML = '<div class="empty-state"><p>Loading models…</p></div>';
    try {
        const result = await window.ag.run(['models', 'list', '--json']);
        const data = JSON.parse(result.stdout);
        if (data.models.length === 0) {
            modelsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>
          </div>
          <p>No models configured. Click <strong>Add model</strong> to create one.</p>
        </div>`;
        }
        else {
            modelsList.innerHTML = data.models
                .map((m) => {
                const initials = (m.displayName ?? m.name).slice(0, 2).toUpperCase();
                return `
            <div class="model-card">
              <div class="model-avatar">${escapeHtml(initials)}</div>
              <div class="model-body">
                <div class="model-name">${escapeHtml(m.displayName ?? m.name)}</div>
                <div class="model-meta">
                  <code>${escapeHtml(m.name)}</code> · ${escapeHtml(m.provider)} · ${escapeHtml(m.externalModelName)}
                </div>
                <div class="model-meta" style="margin-top:4px">
                  <code style="font-size:10px">${escapeHtml(m.apiUrl)}</code> · key: ${escapeHtml(maskKey(m.apiKey))}${m.encrypted ? ' · <span style="color:var(--ok)">encrypted</span>' : ''}
                </div>
              </div>
              <div class="model-actions">
                <button class="btn btn-ghost btn-sm" data-action="test" data-name="${escapeHtml(m.name)}">Test</button>
                <button class="btn btn-ghost btn-sm" data-action="reveal" data-url="${escapeHtml(m.apiUrl)}">Open URL</button>
                <button class="btn btn-danger btn-sm" data-action="remove" data-name="${escapeHtml(m.name)}">Delete</button>
              </div>
            </div>`;
            })
                .join('');
            // Wire actions
            $$('.model-card [data-action]').forEach((btn) => {
                btn.addEventListener('click', () => handleModelAction(btn));
            });
        }
        setStatus(`${data.models.length} model(s)`);
    }
    catch (e) {
        modelsList.innerHTML = `<div class="empty-state"><p>Error: ${escapeHtml(e.message)}</p></div>`;
        setStatus('Error', 'err');
    }
}
async function handleModelAction(btn) {
    const action = btn.dataset.action;
    const name = btn.dataset.name ?? '';
    const url = btn.dataset.url ?? '';
    if (action === 'test') {
        setStatus(`Testing ${name}…`, 'busy');
        try {
            const r = await window.ag.run(['models', 'test', name]);
            toast(r.stdout.includes('✓') || r.code === 0 ? `${name} reachable` : `${name} failed`, r.code === 0 ? 'ok' : 'err');
            setStatus('Ready');
        }
        catch (e) {
            toast(`Test failed: ${e.message}`, 'err');
            setStatus('Error', 'err');
        }
    }
    else if (action === 'reveal') {
        await window.ag.openExternal(url);
    }
    else if (action === 'remove') {
        const ok = await confirmModal('Delete model', `Are you sure you want to delete <strong>${escapeHtml(name)}</strong>?`, { confirmLabel: 'Delete', danger: true });
        if (!ok)
            return;
        setStatus('Removing…', 'busy');
        const r = await window.ag.run(['models', 'remove', name, '--yes']);
        if (r.code === 0) {
            toast(`Removed ${name}`, 'ok');
            void loadModels();
        }
        else {
            toast(`Failed: ${r.stderr || r.stdout}`, 'err');
        }
        setStatus('Ready');
    }
}
$('#modelsTestBtn').addEventListener('click', async () => {
    setStatus('Testing all models…', 'busy');
    try {
        const r = await window.ag.run(['models', 'test']);
        toast(r.code === 0 ? 'All models reachable' : 'Some models failed', r.code === 0 ? 'ok' : 'warn', 5000);
        setStatus('Ready');
    }
    catch (e) {
        toast(`Test failed: ${e.message}`, 'err');
        setStatus('Error', 'err');
    }
});
// Add Model Modal elements
const addModelModalBackdrop = $('#addModelModalBackdrop');
const addModelModalClose = $('#addModelModalClose');
const addModelModalCancel = $('#addModelModalCancel');
const addModelModalSave = $('#addModelModalSave');
const modelProviderSelect = $('#modelProvider');
const modelIdInput = $('#modelId');
const externalModelNameInput = $('#externalModelName');
const modelApiUrlInput = $('#modelApiUrl');
const modelApiKeyInput = $('#modelApiKey');
const modelDisplayNameInput = $('#modelDisplayName');
const DEFAULT_URLS = {
    openai: 'https://api.openai.com/v1/chat/completions',
    anthropic: 'https://api.anthropic.com/v1/messages',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    ollama: 'http://localhost:11434/v1/chat/completions',
    google: 'https://generativelanguage.googleapis.com/v1beta/models/',
    deepseek: 'https://api.deepseek.com/anthropic',
    groq: 'https://api.groq.com/openai/v1',
    mistral: 'https://api.mistral.ai/v1',
    cerebras: 'https://api.cerebras.ai/v1',
    kimi: 'https://api.moonshot.ai/anthropic/v1',
    fireworks: 'https://api.fireworks.ai/inference/v1',
    lmstudio: 'http://localhost:1234/v1',
    llamacpp: 'http://localhost:8080/v1',
    nvidia: 'https://integrate.api.nvidia.com/v1',
};
// Set API URL based on selected provider
modelProviderSelect.addEventListener('change', () => {
    const provider = modelProviderSelect.value;
    const url = DEFAULT_URLS[provider] || '';
    modelApiUrlInput.value = url;
    modelApiUrlInput.placeholder = url;
});
// Open modal
$('#modelsAddBtn').addEventListener('click', () => {
    // Reset form
    modelIdInput.value = '';
    externalModelNameInput.value = '';
    modelApiKeyInput.value = '';
    modelDisplayNameInput.value = '';
    modelProviderSelect.value = 'openai';
    modelApiUrlInput.value = DEFAULT_URLS['openai'];
    modelApiUrlInput.placeholder = DEFAULT_URLS['openai'];
    addModelModalBackdrop.hidden = false;
});
// Close modal helpers
function closeAddModelModal() {
    addModelModalBackdrop.hidden = true;
}
addModelModalClose.addEventListener('click', closeAddModelModal);
addModelModalCancel.addEventListener('click', closeAddModelModal);
addModelModalBackdrop.addEventListener('click', (e) => {
    if (e.target === addModelModalBackdrop)
        closeAddModelModal();
});
// Auto-fill external model name when model ID is edited (e.g. models/gpt-4o -> gpt-4o)
modelIdInput.addEventListener('input', () => {
    const val = modelIdInput.value.trim();
    if (val.startsWith('models/')) {
        externalModelNameInput.value = val.replace(/^models\//, '');
    }
});
// Save model action
addModelModalSave.addEventListener('click', async () => {
    const provider = modelProviderSelect.value;
    let name = modelIdInput.value.trim();
    const external = externalModelNameInput.value.trim();
    const url = modelApiUrlInput.value.trim();
    const key = modelApiKeyInput.value.trim();
    const display = modelDisplayNameInput.value.trim();
    if (!name) {
        toast('Model ID is required', 'warn');
        modelIdInput.focus();
        return;
    }
    if (!name.startsWith('models/')) {
        name = `models/${name}`;
        modelIdInput.value = name;
    }
    if (!external) {
        toast('External model name is required', 'warn');
        externalModelNameInput.focus();
        return;
    }
    if (!url) {
        toast('API URL is required', 'warn');
        modelApiUrlInput.focus();
        return;
    }
    addModelModalSave.setAttribute('disabled', 'true');
    setStatus('Adding model…', 'busy');
    try {
        const args = [
            'models',
            'add',
            '--provider', provider,
            '--name', name,
            '--external', external,
            '--url', url,
            '--yes'
        ];
        if (key)
            args.push('--key', key);
        if (display)
            args.push('--display', display);
        const r = await window.ag.run(args);
        if (r.code === 0) {
            toast(`Successfully added model ${name}`, 'ok');
            closeAddModelModal();
            void loadModels();
        }
        else {
            toast(`Failed to add model: ${r.stderr || r.stdout}`, 'err', 6000);
            setStatus('Ready');
        }
    }
    catch (e) {
        toast(`Error: ${e.message}`, 'err');
        setStatus('Error', 'err');
    }
    finally {
        addModelModalSave.removeAttribute('disabled');
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// Patch view
// ─────────────────────────────────────────────────────────────────────────────
const patchStatusEl = $('#patchStatus');
async function loadPatchStatus() {
    setStatus('Loading patch status…', 'busy');
    patchStatusEl.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
    try {
        const r = await window.ag.run(['patch', 'status', '--json']);
        const s = JSON.parse(r.stdout);
        const banner = s.applied
            ? `<div class="patch-banner ok">
             <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
             <div class="patch-banner-body">
               <div class="patch-banner-title">Patch is active</div>
               <div class="patch-banner-text">language_server is redirected to the local proxy.</div>
             </div>
           </div>`
            : s.exists
                ? `<div class="patch-banner warn">
               <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
               <div class="patch-banner-body">
                 <div class="patch-banner-title">Patch is NOT applied</div>
                 <div class="patch-banner-text">Custom models will not appear in the chat dropdown until the patch is applied.</div>
               </div>
             </div>`
                : `<div class="patch-banner err">
               <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
               <div class="patch-banner-body">
                 <div class="patch-banner-title">Binary not found</div>
                 <div class="patch-banner-text">Could not locate language_server binary.</div>
               </div>
             </div>`;
        patchStatusEl.innerHTML = `
      ${banner}
      <div class="patch-row">
        <div class="patch-row-label">Binary path</div>
        <div class="patch-row-value">${escapeHtml(s.binaryPath ?? '—')}</div>
      </div>
      <div class="patch-row">
        <div class="patch-row-label">Exists</div>
        <div class="patch-row-value ${s.exists ? 'ok' : 'err'}">${s.exists ? 'yes' : 'no'}</div>
      </div>
      <div class="patch-row">
        <div class="patch-row-label">Applied</div>
        <div class="patch-row-value ${s.applied ? 'ok' : 'warn'}">${s.applied ? 'yes' : 'no'}</div>
      </div>
      <div class="patch-row">
        <div class="patch-row-label">Backup</div>
        <div class="patch-row-value ${s.backupExists ? 'ok' : ''}">${s.backupExists ? 'yes' : 'no'}</div>
      </div>
      <div class="patch-row">
        <div class="patch-row-label">Original URL</div>
        <div class="patch-row-value">${escapeHtml(s.originalUrl)}</div>
      </div>
      <div class="patch-row">
        <div class="patch-row-label">Patched URL</div>
        <div class="patch-row-value">${escapeHtml(s.patchedUrl)}</div>
      </div>`;
        setStatus('Ready');
    }
    catch (e) {
        patchStatusEl.innerHTML = `<div class="empty-state"><p>Error: ${escapeHtml(e.message)}</p></div>`;
        setStatus('Error', 'err');
    }
}
$('#patchApplyBtn').addEventListener('click', async () => {
    const ok = await confirmModal('Apply binary patch', `This will modify <code>language_server</code> to redirect API calls to the local proxy.<br><br>A backup will be created automatically.`, { confirmLabel: 'Apply patch' });
    if (!ok)
        return;
    setStatus('Applying patch…', 'busy');
    try {
        const r = await window.ag.run(['patch', 'apply', '--yes']);
        if (r.code === 0) {
            toast('Patch applied successfully', 'ok', 5000);
            void loadPatchStatus();
        }
        else {
            toast(`Patch failed: ${r.stderr || r.stdout}`, 'err', 6000);
        }
        setStatus('Ready');
    }
    catch (e) {
        toast(`Error: ${e.message}`, 'err');
        setStatus('Error', 'err');
    }
});
$('#patchRestoreBtn').addEventListener('click', async () => {
    const ok = await confirmModal('Restore from backup', `This will restore the original <code>language_server</code> binary from backup.<br><br>The patch will be undone.`, { confirmLabel: 'Restore', danger: true });
    if (!ok)
        return;
    setStatus('Restoring…', 'busy');
    try {
        const r = await window.ag.run(['patch', 'restore', '--yes']);
        if (r.code === 0) {
            toast('Restored successfully', 'ok');
            void loadPatchStatus();
        }
        else {
            toast(`Restore failed: ${r.stderr || r.stdout}`, 'err');
        }
        setStatus('Ready');
    }
    catch (e) {
        toast(`Error: ${e.message}`, 'err');
        setStatus('Error', 'err');
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// Logs view (streaming)
// ─────────────────────────────────────────────────────────────────────────────
const logsOutput = $('#logsOutput');
const logsFollowBtn = $('#logsFollowBtn');
const logsClearBtn = $('#logsClearBtn');
const logsCopyBtn = $('#logsCopyBtn');
let logsStreamId = null;
let logsStreaming = false;
async function loadLogs() {
    if (logsStreaming)
        return;
    setStatus('Loading logs…', 'busy');
    try {
        const r = await window.ag.run(['logs', '-n', '100']);
        logsOutput.innerHTML = ansiToHtml(r.stdout || r.stderr || '(empty)');
        setStatus('Ready');
    }
    catch (e) {
        logsOutput.textContent = `Error: ${e.message}`;
        setStatus('Error', 'err');
    }
}
async function startLogStream() {
    if (logsStreaming)
        return;
    logsStreaming = true;
    logsFollowBtn.innerHTML = '<span class="dot-live"></span> Stop';
    setStatus('Streaming logs…', 'busy');
    logsStreamId = `logs-${Date.now()}`;
    window.ag.onStreamData(logsStreamId, (chunk) => {
        logsOutput.innerHTML += ansiToHtml(chunk);
        logsOutput.scrollTop = logsOutput.scrollHeight;
    });
    window.ag.onStreamClose(logsStreamId, (code) => {
        logsStreaming = false;
        logsFollowBtn.innerHTML = '<span class="dot-live"></span> Follow';
        setStatus(`Stream closed (${code})`);
    });
    window.ag.onStreamError(logsStreamId, (err) => {
        toast(`Stream error: ${err}`, 'err');
        stopLogStream();
    });
    await window.ag.startStream(['logs', '-f'], logsStreamId);
}
async function stopLogStream() {
    if (logsStreamId) {
        await window.ag.cancelStream(logsStreamId);
        logsStreamId = null;
    }
    logsStreaming = false;
    logsFollowBtn.innerHTML = '<span class="dot-live"></span> Follow';
    setStatus('Ready');
}
logsFollowBtn.addEventListener('click', () => {
    if (logsStreaming)
        void stopLogStream();
    else
        void startLogStream();
});
logsClearBtn.addEventListener('click', () => {
    logsOutput.textContent = '';
});
logsCopyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(logsOutput.textContent ?? '');
    toast('Logs copied to clipboard', 'ok', 2000);
});
// ─────────────────────────────────────────────────────────────────────────────
// System view
// ─────────────────────────────────────────────────────────────────────────────
const infoTable = $('#infoTable');
async function loadInfo() {
    setStatus('Loading system info…', 'busy');
    try {
        const info = await window.ag.info();
        const cliResult = await window.ag.run(['info', '--json']);
        const cli = JSON.parse(cliResult.stdout);
        const rows = [
            ['Platform', `${info.platform}/${info.arch}`],
            ['Electron', info.electron],
            ['Node', info.node],
            ['Chromium', info.chrome],
            ['CLI path', info.cliPath],
            ['Antigravity', cli.installDir ?? '—'],
            ['custom_models.json', cli.customModelsPath ?? '—'],
            ['LS log', cli.lsLogPath ?? '—'],
            ['app.asar', cli.appAsarPath ?? '—'],
            ['Home', cli.homedir ?? '—'],
            ['Username', cli.username ?? '—'],
            ['CPU', cli.cpu ?? '—'],
            ['Memory', cli.memory ?? '—'],
        ];
        infoTable.innerHTML = rows
            .map(([k, v]) => `<div class="info-cell k">${escapeHtml(k)}</div><div class="info-cell v">${escapeHtml(v)}</div>`)
            .join('');
        setStatus('Ready');
    }
    catch (e) {
        infoTable.innerHTML = `<div class="empty-state"><p>Error: ${escapeHtml(e.message)}</p></div>`;
        setStatus('Error', 'err');
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────
(async function boot() {
    setStatus('Initializing…', 'busy');
    try {
        const info = await window.ag.info();
        setStatus(`Ready · ${info.platform}/${info.arch}`);
    }
    catch {
        setStatus('Ready');
    }
    // Auto-run doctor on first load
    void runDoctor();
})();
//# sourceMappingURL=app.js.map