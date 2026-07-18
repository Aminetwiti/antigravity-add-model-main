"use strict";
/**
 * Preload script — runs in every BrowserWindow before the page loads.
 * Exposes a minimal, secure API via contextBridge so the renderer can
 * communicate with the main-process auto-updater without nodeIntegration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const idGenerator_1 = require("./proxy/idGenerator");
const errorClassifier_1 = require("./proxy/errorClassifier");
// ─── API Definitions ─────────────────────────────────────────────────────────
const updaterAPI = {
    onStateChanged: (callback) => {
        const handler = (_event, state) => {
            callback(state);
        };
        electron_1.ipcRenderer.on('updater:state-changed', handler);
        // Return unsubscribe function
        return () => {
            electron_1.ipcRenderer.removeListener('updater:state-changed', handler);
        };
    },
    applyUpdate: () => electron_1.ipcRenderer.invoke('updater:apply'),
    quitAndInstall: () => electron_1.ipcRenderer.invoke('updater:quit-and-install'),
    checkForUpdates: () => electron_1.ipcRenderer.invoke('updater:check-for-updates'),
};
const dialogAPI = {
    showOpenDialog: () => electron_1.ipcRenderer.invoke('dialog:open-workspace'),
};
const notificationAPI = {
    send: (options) => electron_1.ipcRenderer.invoke('notification:send', options),
    openSystemPreferences: () => electron_1.ipcRenderer.invoke('notification:open-system-preferences'),
    onClicked: (callback) => {
        const handler = (_event, payload) => {
            callback(payload);
        };
        electron_1.ipcRenderer.on('notification:clicked', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('notification:clicked', handler);
        };
    },
};
const storageAPI = {
    getItems: () => electron_1.ipcRenderer.invoke('storage:get-items'),
    updateItems: (changes) => electron_1.ipcRenderer.invoke('storage:update-items', changes),
    onChanged: (callback) => {
        const handler = (_event, changes) => {
            callback(changes);
        };
        electron_1.ipcRenderer.on('storage:changed', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('storage:changed', handler);
        };
    },
    getCustomModels: () => electron_1.ipcRenderer.invoke('storage:get-custom-models'),
    saveCustomModel: (model) => electron_1.ipcRenderer.invoke('storage:save-custom-model', model),
    deleteCustomModel: (modelName) => electron_1.ipcRenderer.invoke('storage:delete-custom-model', modelName),
    testModelConnection: (model) => electron_1.ipcRenderer.invoke('storage:test-model-connection', model),
    fetchModels: (params) => electron_1.ipcRenderer.invoke('storage:fetch-models', params),
};
const logsAPI = {
    getElectronLogs: () => electron_1.ipcRenderer.invoke('logs:electron'),
};
const extensionsAPI = {
    sendAuthorities: (authoritiesMap) => electron_1.ipcRenderer.invoke('extensions:send-authorities', authoritiesMap),
};
const deepLinkAPI = {
    onDeepLink: (callback) => {
        const handler = (_event, url) => {
            callback(url);
        };
        electron_1.ipcRenderer.on('deep-link', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('deep-link', handler);
        };
    },
    getStoredDeepLink: () => electron_1.ipcRenderer.invoke('deep-link:get-stored'),
};
const agentAPI = {
    updateActiveAgentCount: (count) => electron_1.ipcRenderer.invoke('agent:update-active-count', count),
};
const electronNativeAPI = {
    getZoomLevel: () => electron_1.webFrame.getZoomFactor(),
    setTitleBarOverlay: (options) => electron_1.ipcRenderer.invoke('window:set-title-bar-overlay', options),
    minimize: () => electron_1.ipcRenderer.invoke('window:minimize'),
    maximize: () => electron_1.ipcRenderer.invoke('window:maximize'),
    unmaximize: () => electron_1.ipcRenderer.invoke('window:unmaximize'),
    isMaximized: () => electron_1.ipcRenderer.invoke('window:is-maximized'),
    close: () => electron_1.ipcRenderer.invoke('window:close'),
    toggleDevTools: () => electron_1.ipcRenderer.invoke('window:toggle-devtools'),
    zoomIn: () => {
        const current = electron_1.webFrame.getZoomLevel();
        electron_1.webFrame.setZoomLevel(current + 0.5);
    },
    zoomOut: () => {
        const current = electron_1.webFrame.getZoomLevel();
        electron_1.webFrame.setZoomLevel(current - 0.5);
    },
    resetZoom: () => {
        electron_1.webFrame.setZoomLevel(0);
    },
    openExternal: (url) => electron_1.ipcRenderer.invoke('shell:open-external', url),
};
// ─── Expose all APIs via contextBridge ──────────────────────────────────────
electron_1.contextBridge.exposeInMainWorld('electronUpdater', updaterAPI);
electron_1.contextBridge.exposeInMainWorld('dialog', dialogAPI);
electron_1.contextBridge.exposeInMainWorld('nativeNotifications', notificationAPI);
electron_1.contextBridge.exposeInMainWorld('nativeStorage', storageAPI);
electron_1.contextBridge.exposeInMainWorld('logs', logsAPI);
electron_1.contextBridge.exposeInMainWorld('extensions', extensionsAPI);
electron_1.contextBridge.exposeInMainWorld('deepLink', deepLinkAPI);
electron_1.contextBridge.exposeInMainWorld('agent', agentAPI);
electron_1.contextBridge.exposeInMainWorld('electronNative', electronNativeAPI);
// ─── Custom Models UI Injection ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    function findRefreshButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find((b) => b.textContent?.trim() === 'Refresh') || null;
    }
    function findMcpSectionContainer() {
        const refreshBtn = findRefreshButton();
        if (!refreshBtn)
            return null;
        const btnGroup = refreshBtn.parentNode;
        if (!btnGroup)
            return null;
        const headerRow = btnGroup.parentNode;
        if (!headerRow)
            return null;
        const mainContainer = headerRow.parentNode;
        if (!mainContainer)
            return null;
        const contentBlock = headerRow.nextElementSibling;
        return {
            mainContainer,
            headerRow,
            contentBlock,
        };
    }
    // ─── Provider Icons & Status Helpers ──────────────────────────────
    const PROVIDER_ICONS = {
        openai: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
        anthropic: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="8" width="4" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="10" y="5" width="4" height="14" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="17" y="2" width="4" height="20" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>`,
        google: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M12 4a8 8 0 0 1 5.66 13.66L12 12V4z" fill="currentColor" fill-opacity="0.2"/></svg>`,
        ollama: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/><path d="M8 15c1 1.5 3 2 4 2s3-.5 4-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
        openrouter: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity="0.3"/></svg>`,
        custom: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    };
    const PROVIDER_COLORS = {
        openai: '#10a37f',
        anthropic: '#d97757',
        google: '#4285f4',
        ollama: '#f0f0f0',
        openrouter: '#ff7a45',
        custom: '#a855f7',
    };
    function getProviderIcon(provider) {
        return PROVIDER_ICONS[provider] || PROVIDER_ICONS.custom;
    }
    function getProviderColor(provider) {
        return PROVIDER_COLORS[provider] || PROVIDER_COLORS.custom;
    }
    async function renderCustomModelsList() {
        const contentArea = document.getElementById('agy-custom-models-content');
        if (!contentArea)
            return;
        contentArea.innerHTML = '';
        try {
            const models = await storageAPI.getCustomModels();
            if (!models || models.length === 0) {
                const placeholder = document.createElement('div');
                placeholder.style.display = 'flex';
                placeholder.style.flexDirection = 'column';
                placeholder.style.alignItems = 'center';
                placeholder.style.justifyContent = 'center';
                placeholder.style.padding = '24px';
                placeholder.style.backgroundColor = '#18181b';
                placeholder.style.border = '1px solid #27272a';
                placeholder.style.borderRadius = '8px';
                placeholder.style.textAlign = 'center';
                placeholder.innerHTML = `
                    <div style="font-size: 15px; font-weight: 600; color: #f4f4f5; margin-bottom: 4px;">No Custom Models</div>
                    <div style="font-size: 13px; color: #a1a1aa;">You currently don't have any custom models installed. Add a custom model above.</div>
                `;
                contentArea.appendChild(placeholder);
            }
            else {
                models.forEach((model) => {
                    const item = document.createElement('div');
                    item.style.display = 'flex';
                    item.style.justifyContent = 'space-between';
                    item.style.alignItems = 'center';
                    item.style.padding = '12px 16px';
                    item.style.backgroundColor = '#18181b';
                    item.style.border = '1px solid #27272a';
                    item.style.borderRadius = '8px';
                    item.style.transition = 'border-color 0.15s ease, background-color 0.15s ease';
                    item.style.marginBottom = '8px';
                    item.addEventListener('mouseenter', () => {
                        item.style.borderColor = '#3f3f46';
                        item.style.backgroundColor = '#1c1c1f';
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.borderColor = '#27272a';
                        item.style.backgroundColor = '#18181b';
                    });
                    // ─── Left: Provider icon + model info ────────────
                    const left = document.createElement('div');
                    left.style.display = 'flex';
                    left.style.alignItems = 'center';
                    left.style.gap = '12px';
                    // Provider icon bubble
                    const iconWrapper = document.createElement('div');
                    iconWrapper.style.width = '32px';
                    iconWrapper.style.height = '32px';
                    iconWrapper.style.borderRadius = '8px';
                    iconWrapper.style.display = 'flex';
                    iconWrapper.style.alignItems = 'center';
                    iconWrapper.style.justifyContent = 'center';
                    iconWrapper.style.backgroundColor = getProviderColor(model.provider) + '18';
                    iconWrapper.style.color = getProviderColor(model.provider);
                    iconWrapper.style.flexShrink = '0';
                    iconWrapper.innerHTML = getProviderIcon(model.provider);
                    // Text info
                    const info = document.createElement('div');
                    info.style.display = 'flex';
                    info.style.flexDirection = 'column';
                    info.style.gap = '2px';
                    // Title row with status dot
                    const titleRow = document.createElement('div');
                    titleRow.style.display = 'flex';
                    titleRow.style.alignItems = 'center';
                    titleRow.style.gap = '6px';
                    // Status indicator dot
                    const statusDot = document.createElement('span');
                    statusDot.style.width = '6px';
                    statusDot.style.height = '6px';
                    statusDot.style.borderRadius = '50%';
                    statusDot.style.flexShrink = '0';
                    statusDot.style.backgroundColor = '#71717a'; // neutral = unknown
                    statusDot.title = 'Connection status unknown (test to verify)';
                    statusDot.style.transition = 'background-color 0.3s ease';
                    const title = document.createElement('div');
                    title.style.fontSize = '14px';
                    title.style.fontWeight = '500';
                    title.style.color = '#f4f4f5';
                    title.textContent = model.displayName || model.name;
                    titleRow.appendChild(statusDot);
                    titleRow.appendChild(title);
                    // Subtitle with provider badge
                    const sub = document.createElement('div');
                    sub.style.fontSize = '12px';
                    sub.style.color = '#a1a1aa';
                    sub.style.display = 'flex';
                    sub.style.alignItems = 'center';
                    sub.style.gap = '8px';
                    // Provider badge
                    const badge = document.createElement('span');
                    badge.style.fontSize = '10px';
                    badge.style.fontWeight = '600';
                    badge.style.textTransform = 'uppercase';
                    badge.style.letterSpacing = '0.5px';
                    badge.style.padding = '2px 6px';
                    badge.style.borderRadius = '4px';
                    badge.style.backgroundColor = getProviderColor(model.provider) + '22';
                    badge.style.color = getProviderColor(model.provider);
                    badge.textContent = model.provider;
                    sub.appendChild(badge);
                    sub.appendChild(document.createTextNode(model.apiUrl));
                    info.appendChild(titleRow);
                    info.appendChild(sub);
                    left.appendChild(iconWrapper);
                    left.appendChild(info);
                    // ─── Right: Action buttons ──────────────────
                    const actions = document.createElement('div');
                    actions.style.display = 'flex';
                    actions.style.gap = '4px';
                    actions.style.alignItems = 'center';
                    // Test Connection button
                    const testBtn = document.createElement('button');
                    testBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
                    testBtn.style.background = 'transparent';
                    testBtn.style.border = 'none';
                    testBtn.style.color = '#a1a1aa';
                    testBtn.style.cursor = 'pointer';
                    testBtn.style.padding = '6px';
                    testBtn.style.borderRadius = '4px';
                    testBtn.style.display = 'flex';
                    testBtn.style.alignItems = 'center';
                    testBtn.style.justifyContent = 'center';
                    testBtn.style.transition = 'color 0.15s ease, background-color 0.15s ease';
                    testBtn.title = 'Test connection';
                    testBtn.addEventListener('mouseenter', () => {
                        testBtn.style.color = '#22c55e';
                        testBtn.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
                    });
                    testBtn.addEventListener('mouseleave', () => {
                        testBtn.style.color = '#a1a1aa';
                        testBtn.style.backgroundColor = 'transparent';
                    });
                    testBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        // Show loading spinner
                        const originalHtml = testBtn.innerHTML;
                        testBtn.style.color = '#fbbf24';
                        testBtn.style.cursor = 'wait';
                        testBtn.disabled = true;
                        testBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
                        try {
                            const result = await storageAPI.testModelConnection({
                                apiUrl: model.apiUrl,
                                provider: model.provider,
                                apiKey: model.apiKey,
                                allowUnauthorized: model.allowUnauthorized,
                            });
                            if (result.success) {
                                statusDot.style.backgroundColor = '#22c55e'; // green
                                statusDot.title = result.message || 'Connected';
                                testBtn.title = 'Connected ✓';
                                testBtn.style.color = '#22c55e';
                                testBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
                            }
                            else {
                                statusDot.style.backgroundColor = '#ef4444'; // red
                                const errMsg = result.error || 'Connection failed';
                                statusDot.title = errMsg;
                                testBtn.title = errMsg;
                                testBtn.style.color = '#ef4444';
                                testBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
                            }
                        }
                        catch (err) {
                            statusDot.style.backgroundColor = '#ef4444';
                            statusDot.title = 'Connection test failed';
                            testBtn.title = 'Connection test failed';
                            testBtn.style.color = '#ef4444';
                            testBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
                        }
                        testBtn.style.cursor = 'pointer';
                        // Reset to neutral after 3 seconds
                        setTimeout(() => {
                            testBtn.disabled = false;
                            testBtn.style.cursor = 'pointer';
                            testBtn.style.color = '#a1a1aa';
                            testBtn.style.borderColor = '#3f3f46';
                            testBtn.innerHTML = originalHtml;
                        }, 3000);
                    });
                    // Delete button
                    const deleteBtn = document.createElement('button');
                    deleteBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    `;
                    deleteBtn.style.background = 'transparent';
                    deleteBtn.style.border = 'none';
                    deleteBtn.style.color = '#a1a1aa';
                    deleteBtn.style.cursor = 'pointer';
                    deleteBtn.style.padding = '6px';
                    deleteBtn.style.borderRadius = '4px';
                    deleteBtn.style.display = 'flex';
                    deleteBtn.style.alignItems = 'center';
                    deleteBtn.style.justifyContent = 'center';
                    deleteBtn.style.transition = 'color 0.15s ease, background-color 0.15s ease';
                    deleteBtn.addEventListener('mouseenter', () => {
                        deleteBtn.style.color = '#ef4444';
                        deleteBtn.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                    });
                    deleteBtn.addEventListener('mouseleave', () => {
                        deleteBtn.style.color = '#a1a1aa';
                        deleteBtn.style.backgroundColor = 'transparent';
                    });
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete the model "${model.displayName || model.name}"?`)) {
                            await storageAPI.deleteCustomModel(model.name);
                            await renderCustomModelsList();
                            const refreshBtn = findRefreshButton();
                            if (refreshBtn)
                                refreshBtn.click();
                        }
                    });
                    actions.appendChild(testBtn);
                    actions.appendChild(deleteBtn);
                    item.appendChild(left);
                    item.appendChild(actions);
                    contentArea.appendChild(item);
                });
            }
        }
        catch (err) {
            console.error('Failed to load custom models in list:', err);
        }
    }
    async function injectCustomModelsSection() {
        const layout = findMcpSectionContainer();
        if (!layout)
            return;
        const { mainContainer, headerRow, contentBlock } = layout;
        if (document.getElementById('agy-custom-models-section'))
            return;
        const section = document.createElement('div');
        section.id = 'agy-custom-models-section';
        section.style.marginTop = '24px';
        section.style.display = 'flex';
        section.style.flexDirection = 'column';
        section.style.gap = '12px';
        const newHeaderRow = document.createElement('div');
        newHeaderRow.className = headerRow.className;
        newHeaderRow.style.cssText = headerRow.style.cssText;
        newHeaderRow.style.display = 'flex';
        newHeaderRow.style.justifyContent = 'space-between';
        newHeaderRow.style.alignItems = 'center';
        newHeaderRow.style.marginBottom = '8px';
        const originalHeading = headerRow.firstElementChild;
        const newHeading = document.createElement(originalHeading ? originalHeading.tagName : 'div');
        if (originalHeading) {
            newHeading.className = originalHeading.className;
            newHeading.style.cssText = originalHeading.style.cssText;
        }
        newHeading.textContent = 'Custom Models';
        const newBtnGroup = document.createElement('div');
        const originalBtnGroup = headerRow.lastElementChild;
        if (originalBtnGroup) {
            newBtnGroup.className = originalBtnGroup.className;
            newBtnGroup.style.cssText = originalBtnGroup.style.cssText;
        }
        newBtnGroup.style.display = 'flex';
        newBtnGroup.style.gap = '8px';
        newBtnGroup.style.alignItems = 'center';
        const addModelBtn = document.createElement('button');
        addModelBtn.id = 'agy-add-model-btn';
        addModelBtn.textContent = 'Add Model';
        const refreshBtn = findRefreshButton();
        if (refreshBtn) {
            addModelBtn.className = refreshBtn.className;
            addModelBtn.style.cssText = refreshBtn.style.cssText;
        }
        addModelBtn.style.cursor = 'pointer';
        addModelBtn.addEventListener('click', () => {
            openAddModelModal();
        });
        newBtnGroup.appendChild(addModelBtn);
        newHeaderRow.appendChild(newHeading);
        newHeaderRow.appendChild(newBtnGroup);
        const contentArea = document.createElement('div');
        contentArea.id = 'agy-custom-models-content';
        contentArea.style.display = 'flex';
        contentArea.style.flexDirection = 'column';
        contentArea.style.gap = '8px';
        section.appendChild(newHeaderRow);
        section.appendChild(contentArea);
        if (contentBlock && contentBlock.nextSibling) {
            mainContainer.insertBefore(section, contentBlock.nextSibling);
        }
        else {
            mainContainer.appendChild(section);
        }
        await renderCustomModelsList();
    }
    function openAddModelModal() {
        // Remove existing modal if any
        const existing = document.getElementById('agy-modal-overlay');
        if (existing)
            existing.remove();
        // Modal overlay backdrop
        const overlay = document.createElement('div');
        overlay.id = 'agy-modal-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        overlay.style.backdropFilter = 'blur(6px)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '999999';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s ease-in-out';
        // Modal card container
        const modal = document.createElement('div');
        modal.id = 'agy-modal-card';
        modal.style.width = '520px';
        modal.style.maxHeight = '90vh';
        modal.style.overflowY = 'auto';
        modal.style.backgroundColor = '#18181b';
        modal.style.border = '1px solid #27272a';
        modal.style.borderRadius = '16px';
        modal.style.padding = '32px';
        modal.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.5)';
        modal.style.color = '#f4f4f5';
        modal.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        modal.style.transform = 'scale(0.9) translateY(20px)';
        modal.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; background-color: #3b82f618; color: #3b82f6;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg>
                    </div>
                    <h3 style="margin: 0; font-size: 20px; font-weight: 600; color: #f4f4f5;">Add Custom Model</h3>
                </div>
                <button id="agy-modal-close" style="background: transparent; border: none; color: #a1a1aa; cursor: pointer; font-size: 20px; line-height: 1; padding: 4px; display: flex; align-items: center; justify-content: center; transition: color 0.15s ease;">&times;</button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
                <!-- Step Indicator -->
                <div style="display: flex; align-items: center; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid #3f3f46;">
                    <div id="agy-step-1-indicator" style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #3b82f6; color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">1</div>
                        <span style="font-size: 13px; font-weight: 500; color: #e4e4e7;">Configure API</span>
                    </div>
                    <div style="flex: 1; height: 2px; background-color: #3f3f46;"></div>
                    <div id="agy-step-2-indicator" style="display: flex; align-items: center; gap: 8px;">
                        <div id="agy-step-2-circle" style="width: 28px; height: 28px; border-radius: 50%; background-color: #3f3f46; color: #71717a; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;">2</div>
                        <span id="agy-step-2-text" style="font-size: 13px; font-weight: 500; color: #71717a;">Select Models</span>
                    </div>
                </div>

                <!-- Step 1: API Configuration -->
                <div id="agy-step-1-content" style="display: flex; flex-direction: column; gap: 16px;">
                    <!-- Provider Type -->
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label style="font-size: 13px; font-weight: 500; color: #a1a1aa;">Provider Type <span style="color: #ef4444;">*</span></label>
                        <select id="agy-provider-type" style="background-color: #27272a; border: 1px solid #3f3f46; border-radius: 8px; color: #f4f4f5; padding: 10px 12px; font-size: 14px; outline: none; cursor: pointer; transition: border-color 0.15s ease;">
                            <option value="openai">OpenAI Compatible</option>
                            <option value="anthropic">Anthropic Compatible</option>
                        </select>
                    </div>

                    <!-- API URL -->
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label style="font-size: 13px; font-weight: 500; color: #a1a1aa;">API URL <span style="color: #ef4444;">*</span></label>
                        <input type="text" id="agy-api-url" placeholder="https://api.openai.com/v1/chat/completions" style="background-color: #27272a; border: 1px solid #3f3f46; border-radius: 8px; color: #f4f4f5; padding: 10px 12px; font-size: 14px; outline: none; transition: border-color 0.15s ease;" />
                        <div id="agy-url-error" style="font-size: 11px; color: #ef4444; display: none;"></div>
                    </div>

                    <!-- API Key -->
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label style="font-size: 13px; font-weight: 500; color: #a1a1aa;">API Key <span style="color: #71717a;">(optional for local)</span></label>
                        <input type="password" id="agy-api-key" placeholder="sk-..." style="background-color: #27272a; border: 1px solid #3f3f46; border-radius: 8px; color: #f4f4f5; padding: 10px 12px; font-size: 14px; outline: none; transition: border-color 0.15s ease;" />
                    </div>

                    <!-- Allow Unauthorized SSL -->
                    <div style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; background-color: #27272a; border: 1px solid #3f3f46; border-radius: 8px;">
                        <input type="checkbox" id="agy-allow-unauthorized" style="width: 16px; height: 16px; cursor: pointer;" />
                        <label for="agy-allow-unauthorized" style="font-size: 13px; color: #d4d4d8; cursor: pointer; user-select: none;">Allow self-signed certificates</label>
                    </div>

                    <!-- Fetch Models Button -->
                    <button id="agy-fetch-models-btn" type="button" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border: none; color: white; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.15s ease; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 8 12 12 8 8"/><line x1="12" y1="16" x2="12" y2="12"/></svg>
                        Fetch Available Models
                    </button>
                    <div id="agy-fetch-status" style="font-size: 12px; color: #a1a1aa; display: none; text-align: center;"></div>
                </div>

                <!-- Step 2: Model Selection -->
                <div id="agy-step-2-content" style="display: none; flex-direction: column; gap: 16px;">
                    <div style="font-size: 13px; color: #a1a1aa;">Select one or more models to add:</div>
                    
                    <!-- Models List -->
                    <div id="agy-models-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; padding: 8px; background-color: #1c1c1f; border: 1px solid #3f3f46; border-radius: 8px;">
                        <!-- Models will be populated here -->
                    </div>

                    <!-- Back Button -->
                    <button id="agy-back-to-step1" type="button" style="background-color: #27272a; border: 1px solid #3f3f46; color: #d4d4d8; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s ease;">
                        ← Back to Configuration
                    </button>

                    <!-- Selected Models Display -->
                    <div id="agy-selected-models" style="display: none; flex-direction: column; gap: 8px; padding: 12px; background-color: #1c1c1f; border: 1px solid #22c55e; border-radius: 8px;">
                        <div style="font-size: 12px; font-weight: 600; color: #22c55e;">Selected Models:</div>
                        <div id="agy-selected-list" style="font-size: 12px; color: #d4d4d8;"></div>
                    </div>
                </div>

                <!-- Display Name Suffix (Optional, shown in step 2) -->
                <div id="agy-display-name-container" style="display: none; flex-direction: column; gap: 6px;">
                    <label style="font-size: 13px; font-weight: 500; color: #a1a1aa;">Display Name Suffix (optional)</label>
                    <input type="text" id="agy-display-name-suffix" placeholder="e.g. (via OpenRouter)" style="background-color: #27272a; border: 1px solid #3f3f46; border-radius: 8px; color: #f4f4f5; padding: 10px 12px; font-size: 14px; outline: none; transition: border-color 0.15s ease;" />
                    <div style="font-size: 11px; color: #71717a;">Will be appended to model names</div>
                </div>
            </div>

            <div style="display: flex; gap: 12px; justify-content: flex-end; padding-top: 16px; border-top: 1px solid #3f3f46;">
                <button id="agy-btn-cancel" style="background: transparent; border: 1px solid #3f3f46; color: #d4d4d8; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s ease;">Cancel</button>
                <button id="agy-btn-save" style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border: none; color: white; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; box-shadow: 0 4px 6px -1px rgba(34, 197, 94, 0.3); display: none;">Add Selected Models</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        // Animate in
        setTimeout(() => {
            overlay.style.opacity = '1';
            modal.style.transform = 'scale(1) translateY(0)';
        }, 10);
        // Close handler
        const closeModal = () => {
            overlay.style.opacity = '0';
            modal.style.transform = 'scale(0.9) translateY(20px)';
            setTimeout(() => overlay.remove(), 200);
        };
        document.getElementById('agy-modal-close').addEventListener('click', closeModal);
        document.getElementById('agy-btn-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay)
                closeModal();
        });
        // Element references for Step 1
        const providerTypeSelect = document.getElementById('agy-provider-type');
        const urlInput = document.getElementById('agy-api-url');
        const keyInput = document.getElementById('agy-api-key');
        const allowUnauthorized = document.getElementById('agy-allow-unauthorized');
        const fetchModelsBtn = document.getElementById('agy-fetch-models-btn');
        const fetchStatus = document.getElementById('agy-fetch-status');
        const urlError = document.getElementById('agy-url-error');
        // Element references for Step 2
        const step1Content = document.getElementById('agy-step-1-content');
        const step2Content = document.getElementById('agy-step-2-content');
        const step1Indicator = document.getElementById('agy-step-1-indicator');
        const step2Indicator = document.getElementById('agy-step-2-indicator');
        const step2Circle = document.getElementById('agy-step-2-circle');
        const step2Text = document.getElementById('agy-step-2-text');
        const modelsList = document.getElementById('agy-models-list');
        const backToStep1Btn = document.getElementById('agy-back-to-step1');
        const selectedModelsDiv = document.getElementById('agy-selected-models');
        const selectedListDiv = document.getElementById('agy-selected-list');
        const displayNameContainer = document.getElementById('agy-display-name-container');
        const displayNameSuffix = document.getElementById('agy-display-name-suffix');
        const saveBtn = document.getElementById('agy-btn-save');
        // Store fetched models and selected models
        let fetchedModels = [];
        let selectedModels = new Set();
        let apiConfig = { provider: '', apiUrl: '', apiKey: '', allowUnauthorized: false };
        // Step 1: Fetch models button
        fetchModelsBtn.addEventListener('click', async () => {
            const apiUrl = urlInput.value.trim();
            const apiKey = keyInput.value.trim();
            const provider = providerTypeSelect.value;
            if (!apiUrl) {
                urlError.textContent = 'Please enter an API URL';
                urlError.style.display = 'block';
                return;
            }
            urlError.style.display = 'none';
            fetchModelsBtn.disabled = true;
            fetchModelsBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> Fetching...';
            fetchStatus.textContent = 'Connecting to API...';
            fetchStatus.style.color = '#a1a1aa';
            fetchStatus.style.display = 'block';
            try {
                const result = await electron_1.ipcRenderer.invoke('storage:fetch-provider-models', {
                    apiUrl,
                    apiKey: apiKey || undefined,
                    provider,
                    allowUnauthorized: allowUnauthorized.checked,
                });
                if (result.success && result.models && result.models.length > 0) {
                    fetchedModels = result.models;
                    apiConfig = { provider, apiUrl, apiKey, allowUnauthorized: allowUnauthorized.checked };
                    fetchStatus.textContent = `Found ${result.models.length} model(s)`;
                    fetchStatus.style.color = '#22c55e';
                    // Transition to Step 2
                    setTimeout(() => {
                        step1Content.style.display = 'none';
                        step2Content.style.display = 'flex';
                        displayNameContainer.style.display = 'flex';
                        step2Circle.style.backgroundColor = '#3b82f6';
                        step2Circle.style.color = 'white';
                        step2Text.style.color = '#e4e4e7';
                        // Populate models list
                        modelsList.innerHTML = '';
                        fetchedModels.forEach((model) => {
                            const modelCard = document.createElement('div');
                            modelCard.style.cssText = 'padding: 12px; background-color: #27272a; border: 2px solid #3f3f46; border-radius: 8px; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; gap: 12px;';
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
                            checkbox.dataset.modelId = model.id;
                            const infoDiv = document.createElement('div');
                            infoDiv.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 4px;';
                            const modelName = document.createElement('div');
                            modelName.textContent = model.name || model.id;
                            modelName.style.cssText = 'font-size: 14px; font-weight: 500; color: #f4f4f5;';
                            const modelId = document.createElement('div');
                            modelId.textContent = model.id;
                            modelId.style.cssText = 'font-size: 12px; color: #71717a;';
                            infoDiv.appendChild(modelName);
                            if (model.name !== model.id)
                                infoDiv.appendChild(modelId);
                            // Show modalities badge
                            if (model.inputModalities && model.inputModalities.length > 0 && model.inputModalities.some(m => m !== 'text')) {
                                const badge = document.createElement('span');
                                badge.textContent = model.inputModalities.join(', ');
                                badge.style.cssText = 'font-size: 10px; padding: 2px 6px; background-color: #3b82f6; color: white; border-radius: 4px; display: inline-block;';
                                infoDiv.appendChild(badge);
                            }
                            modelCard.appendChild(checkbox);
                            modelCard.appendChild(infoDiv);
                            // Toggle selection
                            modelCard.addEventListener('click', (e) => {
                                if (e.target !== checkbox) {
                                    checkbox.checked = !checkbox.checked;
                                }
                                if (checkbox.checked) {
                                    selectedModels.add(model.id);
                                    modelCard.style.borderColor = '#22c55e';
                                    modelCard.style.backgroundColor = '#22c55e18';
                                }
                                else {
                                    selectedModels.delete(model.id);
                                    modelCard.style.borderColor = '#3f3f46';
                                    modelCard.style.backgroundColor = '#27272a';
                                }
                                updateSelectedDisplay();
                            });
                            modelsList.appendChild(modelCard);
                        });
                    }, 500);
                }
                else {
                    fetchStatus.textContent = result.error || 'No models found';
                    fetchStatus.style.color = '#ef4444';
                }
            }
            catch (err) {
                fetchStatus.textContent = 'Error: ' + err.message;
                fetchStatus.style.color = '#ef4444';
            }
            finally {
                setTimeout(() => {
                    fetchModelsBtn.disabled = false;
                    fetchModelsBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="16 8 12 12 8 8"/><line x1="12" y1="16" x2="12" y2="12"/></svg> Fetch Available Models';
                }, 1000);
            }
        });
        // Update selected models display
        const updateSelectedDisplay = () => {
            if (selectedModels.size > 0) {
                selectedModelsDiv.style.display = 'flex';
                selectedListDiv.textContent = `${selectedModels.size} model(s) selected`;
                saveBtn.style.display = 'block';
            }
            else {
                selectedModelsDiv.style.display = 'none';
                saveBtn.style.display = 'none';
            }
        };
        // Back to step 1
        backToStep1Btn.addEventListener('click', () => {
            step2Content.style.display = 'none';
            step1Content.style.display = 'flex';
            displayNameContainer.style.display = 'none';
            step2Circle.style.backgroundColor = '#3f3f46';
            step2Circle.style.color = '#71717a';
            step2Text.style.color = '#71717a';
            selectedModels.clear();
            updateSelectedDisplay();
        });
        // Save selected models
        saveBtn.addEventListener('click', async () => {
            if (selectedModels.size === 0) {
                fetchStatus.textContent = 'Please select at least one model';
                fetchStatus.style.color = '#ef4444';
                return;
            }
            saveBtn.disabled = true;
            saveBtn.textContent = 'Adding models...';
            const suffix = displayNameSuffix.value.trim();
            const modelsToAdd = fetchedModels.filter(m => selectedModels.has(m.id));
            try {
                for (const model of modelsToAdd) {
                    const displayName = model.name + (suffix ? ` ${suffix}` : '');
                    await electron_1.ipcRenderer.invoke('storage:save-custom-model', {
                        name: model.id,
                        displayName,
                        provider: apiConfig.provider,
                        apiKey: apiConfig.apiKey,
                        apiUrl: apiConfig.apiUrl,
                        externalModelName: model.id,
                        allowUnauthorized: apiConfig.allowUnauthorized,
                        inputModalities: model.inputModalities || ['text'],
                    });
                }
                // Success - reload models and close
                closeModal();
            }
            catch (err) {
                fetchStatus.textContent = 'Error: ' + err.message;
                fetchStatus.style.color = '#ef4444';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Add Selected Models';
            }
        });
    }
    ;
    // Close add model modal if open
    const closeAddModelModal = () => {
        const existingOverlay = document.getElementById('agy-modal-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
    };
    // Efficient DOM tracking via MutationObserver — instead of setInterval
    let injectionObserver = null;
    let injectionDebounceTimer = null;
    function setupInjectionObserver() {
        // Try immediately first
        void injectCustomModelsSection();
        // If already added, no need for observer
        if (document.getElementById('agy-custom-models-section'))
            return;
        // Set up observer: watch all changes under document.body
        injectionObserver = new MutationObserver(() => {
            // Debounce: coalesce consecutive mutations into a single attempt
            if (injectionDebounceTimer)
                clearTimeout(injectionDebounceTimer);
            injectionDebounceTimer = setTimeout(async () => {
                await injectCustomModelsSection();
                // If successfully injected, stop observing
                if (document.getElementById('agy-custom-models-section')) {
                    if (injectionObserver) {
                        injectionObserver.disconnect();
                        injectionObserver = null;
                    }
                }
            }, 200);
        });
        injectionObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }
    // URL tracking for re-injection on SPA page transitions
    let lastUrl = location.href;
    setInterval(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            // Page changed — clean up previous observer and re-initialize
            if (injectionObserver) {
                injectionObserver.disconnect();
                injectionObserver = null;
            }
            // Re-initialize after a short delay (for new DOM to render)
            setTimeout(setupInjectionObserver, 500);
        }
    }, 1500);
    // --- Contextual Error Toast UI ----------------------------------------
    function showErrorToast(diagnostic) {
        if (!document || !document.body)
            return;
        const existingToastId = `agy-toast-${diagnostic.errorType}`;
        const existing = document.getElementById(existingToastId);
        if (existing) {
            existing.style.animation = 'none';
            void existing.offsetWidth; // trigger reflow
            existing.style.animation = 'agy-toast-shake 0.4s ease-in-out, agy-toast-fade-in 0.3s ease-out';
            return;
        }
        let container = document.getElementById('agy-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'agy-toast-container';
            container.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 9999999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 420px;
        width: calc(100vw - 48px);
        pointer-events: none;
      `;
            document.body.appendChild(container);
            const style = document.createElement('style');
            style.textContent = `
        @keyframes agy-toast-fade-in {
          from { opacity: 0; transform: translateY(-20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes agy-toast-fade-out {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(0.9); }
        }
        @keyframes agy-toast-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
      `;
            document.head.appendChild(style);
        }
        const toast = document.createElement('div');
        toast.id = existingToastId;
        toast.style.cssText = `
      background-color: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.5);
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      pointer-events: auto;
      animation: agy-toast-fade-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
        let borderLeftColor = '#a855f7';
        let iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;
        if (diagnostic.errorType === 'billing') {
            borderLeftColor = '#ef4444';
            iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`;
        }
        else if (diagnostic.errorType === 'auth' || diagnostic.errorType === 'forbidden') {
            borderLeftColor = '#f97316';
            iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
        }
        else if (diagnostic.errorType === 'rate_limit') {
            borderLeftColor = '#eab308';
            iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
        }
        else if (diagnostic.errorType === 'timeout') {
            borderLeftColor = '#3b82f6';
            iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
        }
        else if (diagnostic.errorType === 'network' || diagnostic.errorType === 'dns') {
            borderLeftColor = '#64748b';
            iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.59 16a7.5 7.5 0 0 1 6.82 0M12 20h.01"/></svg>`;
        }
        else if (diagnostic.errorType === 'server') {
            borderLeftColor = '#ef4444';
            iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        }
        const accentLine = document.createElement('div');
        accentLine.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background-color: ${borderLeftColor};
    `;
        toast.appendChild(accentLine);
        const mainRow = document.createElement('div');
        mainRow.style.cssText = `
      display: flex;
      gap: 12px;
      align-items: flex-start;
    `;
        const iconContainer = document.createElement('div');
        iconContainer.style.cssText = `
      color: ${borderLeftColor};
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
    `;
        iconContainer.innerHTML = iconHtml;
        mainRow.appendChild(iconContainer);
        const textContainer = document.createElement('div');
        textContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    `;
        const title = document.createElement('div');
        title.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      color: #f4f4f5;
    `;
        title.textContent = diagnostic.title;
        textContainer.appendChild(title);
        const desc = document.createElement('div');
        desc.style.cssText = `
      font-size: 12px;
      color: #a1a1aa;
      line-height: 1.4;
    `;
        desc.textContent = diagnostic.message;
        textContainer.appendChild(desc);
        mainRow.appendChild(textContainer);
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #71717a;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 0 4px;
      margin-top: -2px;
      transition: color 0.15s ease;
    `;
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#f4f4f5');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#71717a');
        let autoDismissTimer = null;
        const dismissToast = () => {
            if (autoDismissTimer) {
                clearTimeout(autoDismissTimer);
            }
            toast.style.animation = 'agy-toast-fade-out 0.25s ease-in forwards';
            setTimeout(() => toast.remove(), 250);
        };
        closeBtn.addEventListener('click', dismissToast);
        mainRow.appendChild(closeBtn);
        toast.appendChild(mainRow);
        if (diagnostic.suggestions && diagnostic.suggestions.length > 0) {
            const suggBox = document.createElement('div');
            suggBox.style.cssText = `
        background-color: #1c1c1f;
        border-radius: 6px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-left: 30px;
      `;
            const suggTitle = document.createElement('div');
            suggTitle.style.cssText = `
        font-size: 10px;
        font-weight: 600;
        color: #71717a;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      `;
            suggTitle.textContent = 'Suggested Actions';
            suggBox.appendChild(suggTitle);
            const suggList = document.createElement('ul');
            suggList.style.cssText = `
        margin: 0;
        padding-left: 16px;
        font-size: 11px;
        color: #d4d4d8;
        display: flex;
        flex-direction: column;
        gap: 4px;
      `;
            diagnostic.suggestions.forEach((sug) => {
                const item = document.createElement('li');
                item.textContent = sug;
                suggList.appendChild(item);
            });
            suggBox.appendChild(suggList);
            toast.appendChild(suggBox);
        }
        const actionsRow = document.createElement('div');
        actionsRow.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
      margin-left: 30px;
    `;
        if (diagnostic.errorType === 'auth') {
            const configBtn = document.createElement('button');
            configBtn.textContent = 'Configure API Key';
            configBtn.style.cssText = `
        background-color: #3b82f6;
        border: none;
        color: white;
        font-size: 11px;
        font-weight: 500;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.15s ease;
      `;
            configBtn.addEventListener('mouseenter', () => configBtn.style.backgroundColor = '#2563eb');
            configBtn.addEventListener('mouseleave', () => configBtn.style.backgroundColor = '#3b82f6');
            configBtn.addEventListener('click', () => {
                openAddModelModal();
                dismissToast();
            });
            actionsRow.appendChild(configBtn);
        }
        if (diagnostic.actionUrl) {
            const billingBtn = document.createElement('button');
            billingBtn.textContent = 'Manage Billing';
            billingBtn.style.cssText = `
        background-color: #ef4444;
        border: none;
        color: white;
        font-size: 11px;
        font-weight: 500;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.15s ease;
      `;
            billingBtn.addEventListener('mouseenter', () => billingBtn.style.backgroundColor = '#dc2626');
            billingBtn.addEventListener('mouseleave', () => billingBtn.style.backgroundColor = '#ef4444');
            billingBtn.addEventListener('click', () => {
                window.open(diagnostic.actionUrl, '_blank');
                dismissToast();
            });
            actionsRow.appendChild(billingBtn);
        }
        const refreshBtn = findRefreshButton();
        if (refreshBtn && (diagnostic.errorType === 'rate_limit' || diagnostic.errorType === 'server' || diagnostic.errorType === 'network')) {
            const retryBtn = document.createElement('button');
            retryBtn.textContent = 'Retry Request';
            retryBtn.style.cssText = `
        background-color: #27272a;
        border: 1px solid #3f3f46;
        color: #d4d4d8;
        font-size: 11px;
        font-weight: 500;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
      `;
            retryBtn.addEventListener('mouseenter', () => {
                retryBtn.style.backgroundColor = '#3f3f46';
                retryBtn.style.borderColor = '#52525b';
            });
            retryBtn.addEventListener('mouseleave', () => {
                retryBtn.style.backgroundColor = '#27272a';
                retryBtn.style.borderColor = '#3f3f46';
            });
            retryBtn.addEventListener('click', () => {
                refreshBtn.click();
                dismissToast();
            });
            actionsRow.appendChild(retryBtn);
        }
        if (actionsRow.children.length > 0) {
            toast.appendChild(actionsRow);
        }
        container.appendChild(toast);
        if (diagnostic.errorType !== 'auth' && diagnostic.errorType !== 'billing') {
            autoDismissTimer = setTimeout(dismissToast, 10000);
        }
    }
    // --- Network Interceptor for Model Injection & Diagnostics -----------
    const customModelsCache = { models: [], ts: 0 };
    async function getCustomModelsForInjection() {
        if (Date.now() - customModelsCache.ts < 30000)
            return customModelsCache.models;
        try {
            customModelsCache.models = await storageAPI.getCustomModels();
            customModelsCache.ts = Date.now();
        }
        catch { /* ignore */ }
        return customModelsCache.models;
    }
    // Intercept XHR to inject custom models and capture errors
    const origXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, async, username, password) {
        this._agy_url = typeof url === 'string' ? url : url.toString();
        this._agy_method = method;
        return origXHROpen.call(this, method, url, async, username, password);
    };
    const origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
        const xhr = this;
        const url = xhr._agy_url || '';
        if (url.includes('GetAvailableModels') || url.includes('fetchAvailableModels')) {
            const origOnReady = xhr.onreadystatechange;
            xhr.onreadystatechange = async function (ev) {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    const customModels = await getCustomModelsForInjection();
                    if (customModels && customModels.length > 0) {
                        try {
                            const responseText = xhr.responseText;
                            if (responseText && responseText.length > 10) {
                                const parsed = JSON.parse(responseText);
                                const modelsObj = (parsed.models || parsed.availableModels || parsed.available_models || {});
                                for (const m of customModels) {
                                    const slug = (0, idGenerator_1.toSlug)(m);
                                    const placeholderId = (0, idGenerator_1.generateModelPlaceholderId)(m);
                                    modelsObj[slug] = {
                                        displayName: m.displayName || m.name,
                                        recommended: true,
                                        maxTokens: 1048576,
                                        maxOutputTokens: 4096,
                                        tokenizerType: 'LLAMA_WITH_SPECIAL',
                                        model: `MODEL_PLACEHOLDER_M${placeholderId}`,
                                        apiProvider: 'API_PROVIDER_GOOGLE_GEMINI',
                                        modelProvider: 'MODEL_PROVIDER_GOOGLE',
                                    };
                                }
                                // Override response
                                Object.defineProperty(xhr, 'responseText', { value: JSON.stringify(parsed), writable: true });
                                Object.defineProperty(xhr, 'response', { value: JSON.stringify(parsed), writable: true });
                            }
                        }
                        catch { /* ignore parse errors */ }
                    }
                }
                if (origOnReady)
                    origOnReady.call(xhr, ev);
            };
        }
        else if (url.includes('generateContent') || url.includes('streamGenerateContent')) {
            const origOnReady = xhr.onreadystatechange;
            xhr.onreadystatechange = async function (ev) {
                if (xhr.readyState === 4) {
                    if (xhr.status >= 400) {
                        try {
                            const parsed = JSON.parse(xhr.responseText);
                            if (parsed._agDiagnostic) {
                                showErrorToast(parsed._agDiagnostic);
                            }
                            else {
                                const diagnostic = (0, errorClassifier_1.classifyError)(xhr.status, null, xhr.responseText);
                                showErrorToast(diagnostic);
                            }
                        }
                        catch {
                            const diagnostic = (0, errorClassifier_1.classifyError)(xhr.status, null, xhr.responseText);
                            showErrorToast(diagnostic);
                        }
                    }
                }
                if (origOnReady)
                    origOnReady.call(xhr, ev);
            };
            const origOnError = xhr.onerror;
            xhr.onerror = function (ev) {
                const diagnostic = (0, errorClassifier_1.classifyError)(undefined, 'Network Error');
                showErrorToast(diagnostic);
                if (origOnError)
                    origOnError.call(xhr, ev);
            };
        }
        return origXHRSend.call(xhr, body);
    };
    // Intercept fetch responses for model endpoints and error capturing
    const origFetch = window.fetch;
    window.fetch = async function (input, init) {
        const url = typeof input === 'string' ? input : input.url;
        try {
            const response = await origFetch.call(window, input, init);
            if ((url.includes('GetAvailableModels') || url.includes('fetchAvailableModels')) && response.ok) {
                const customModels = await getCustomModelsForInjection();
                if (customModels && customModels.length > 0) {
                    try {
                        const cloned = response.clone();
                        const text = await cloned.text();
                        if (text && text.length > 10) {
                            const parsed = JSON.parse(text);
                            const modelsObj = (parsed.models || parsed.availableModels || parsed.available_models || {});
                            for (const m of customModels) {
                                const slug = (0, idGenerator_1.toSlug)(m);
                                const placeholderId = (0, idGenerator_1.generateModelPlaceholderId)(m);
                                modelsObj[slug] = {
                                    displayName: m.displayName || m.name,
                                    recommended: true,
                                    maxTokens: 1048576,
                                    maxOutputTokens: 4096,
                                    tokenizerType: 'LLAMA_WITH_SPECIAL',
                                    model: `MODEL_PLACEHOLDER_M${placeholderId}`,
                                    apiProvider: 'API_PROVIDER_GOOGLE_GEMINI',
                                    modelProvider: 'MODEL_PROVIDER_GOOGLE',
                                };
                            }
                            return new Response(JSON.stringify(parsed), {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers,
                            });
                        }
                    }
                    catch { /* ignore parse errors */ }
                }
            }
            else if (url.includes('generateContent') || url.includes('streamGenerateContent')) {
                if (!response.ok || response.status >= 400) {
                    try {
                        const cloned = response.clone();
                        const text = await cloned.text();
                        const parsed = JSON.parse(text);
                        if (parsed._agDiagnostic) {
                            showErrorToast(parsed._agDiagnostic);
                        }
                        else {
                            const diagnostic = (0, errorClassifier_1.classifyError)(response.status, null, text);
                            showErrorToast(diagnostic);
                        }
                    }
                    catch {
                        const diagnostic = (0, errorClassifier_1.classifyError)(response.status);
                        showErrorToast(diagnostic);
                    }
                }
            }
            return response;
        }
        catch (err) {
            if (url.includes('generateContent') || url.includes('streamGenerateContent')) {
                const diagnostic = (0, errorClassifier_1.classifyError)(undefined, err);
                showErrorToast(diagnostic);
            }
            throw err;
        }
    };
    // Start the observer
    setupInjectionObserver();
});
//# sourceMappingURL=preload.js.map