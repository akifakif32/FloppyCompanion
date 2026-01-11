// tweaks.js - Tweaks Tab Logic

// ZRAM State
let zramCurrentState = {};
let zramSavedState = {};
let zramPendingState = {};

// Helper: Convert bytes to MiB for display
function bytesToMiB(bytes) {
    return Math.round(bytes / 1048576);
}

// Helper: Convert MiB to bytes
function mibToBytes(mib) {
    return mib * 1048576;
}

// Run ZRAM backend command
async function runZramBackend(action, ...args) {
    const scriptPath = '/data/adb/modules/floppy_companion/tweaks/zram.sh';
    let cmd = `sh "${scriptPath}" ${action}`;
    if (args.length > 0) {
        cmd += ' "' + args.join('" "') + '"';
    }
    return await exec(cmd);
}

// Parse key=value output
function parseKeyValue(output) {
    const result = {};
    if (!output) return result;
    output.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length) {
            result[key.trim()] = valueParts.join('=').trim();
        }
    });
    return result;
}

// Load ZRAM state
async function loadZramState() {
    try {
        const currentOutput = await runZramBackend('get_current');
        const savedOutput = await runZramBackend('get_saved');

        zramCurrentState = parseKeyValue(currentOutput);
        zramSavedState = parseKeyValue(savedOutput);

        // Initialize pending state from saved if available, else from current
        zramPendingState = {
            disksize: zramSavedState.disksize || zramCurrentState.disksize || '0',
            algorithm: zramSavedState.algorithm || zramCurrentState.algorithm || 'lz4',
            enabled: zramSavedState.enabled !== undefined ? zramSavedState.enabled : (zramCurrentState.enabled || '1')
        };

        renderZramCard();
    } catch (e) {
        console.error('Failed to load ZRAM state:', e);
    }
}

// Render ZRAM card UI
function renderZramCard() {
    // Enable toggle
    const enableToggle = document.getElementById('zram-enable-toggle');
    if (enableToggle) {
        enableToggle.checked = zramPendingState.enabled !== '0';
    }

    // Disk size options
    const sizeOptions = document.getElementById('zram-size-options');
    const customBtn = document.getElementById('zram-size-custom-btn');
    const customInputRow = document.getElementById('zram-custom-input-row');
    const customInput = document.getElementById('zram-custom-size');

    if (sizeOptions) {
        const pendingSize = zramPendingState.disksize;
        const currentMiB = bytesToMiB(parseInt(zramCurrentState.disksize) || 0);
        let matchedPreset = false;

        sizeOptions.querySelectorAll('.option-btn').forEach(btn => {
            btn.classList.remove('selected');
            const btnSize = btn.dataset.size;

            if (btnSize !== 'custom' && btnSize === pendingSize) {
                btn.classList.add('selected');
                matchedPreset = true;
            }
        });

        // If no preset matched, select Custom
        if (!matchedPreset && customBtn && pendingSize) {
            customBtn.classList.add('selected');
            if (customInputRow) customInputRow.classList.remove('hidden');
            if (customInput) {
                customInput.placeholder = currentMiB.toString();
                // Only set value if it's a custom (non-preset) size
                const pendingMiB = bytesToMiB(parseInt(pendingSize) || 0);
                if (pendingMiB > 0 && ![1536, 2048, 3072, 4096, 6144, 8192].includes(pendingMiB)) {
                    customInput.value = pendingMiB;
                }
            }
        } else if (customInputRow) {
            customInputRow.classList.add('hidden');
        }
    }

    // Algorithm options - populate dynamically
    const algoOptions = document.getElementById('zram-algo-options');
    if (algoOptions && zramCurrentState.available) {
        const algos = zramCurrentState.available.split(',').filter(a => a);
        algoOptions.innerHTML = '';

        algos.forEach(algo => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.dataset.algo = algo;
            btn.textContent = algo;

            if (algo === zramPendingState.algorithm) {
                btn.classList.add('selected');
            }

            btn.addEventListener('click', () => selectZramAlgorithm(algo));
            algoOptions.appendChild(btn);
        });
    }

    // Active values display
    const currentDisksize = document.getElementById('zram-current-disksize');
    const currentAlgorithm = document.getElementById('zram-current-algorithm');

    if (currentDisksize) {
        const sizeMiB = bytesToMiB(parseInt(zramCurrentState.disksize) || 0);
        currentDisksize.textContent = `${sizeMiB} MiB`;
    }
    if (currentAlgorithm) {
        currentAlgorithm.textContent = zramCurrentState.algorithm || '--';
    }

    // Hide options if disabled
    const optionsSection = document.getElementById('zram-options');
    if (optionsSection) {
        if (zramPendingState.enabled === '0') {
            optionsSection.classList.add('hidden');
        } else {
            optionsSection.classList.remove('hidden');
        }
    }

    // Update pending indicator
    updateZramPendingIndicator();
}

// Update pending indicator
function updateZramPendingIndicator() {
    const indicator = document.getElementById('zram-pending-indicator');
    if (!indicator) return;

    // Check if pending differs from saved
    // If nothing is saved, compare pending to current (initial) values
    const savedDisksize = zramSavedState.disksize || zramCurrentState.disksize;
    const savedAlgorithm = zramSavedState.algorithm || zramCurrentState.algorithm;
    const savedEnabled = zramSavedState.enabled !== undefined ? zramSavedState.enabled : zramCurrentState.enabled;

    const hasPending =
        (zramPendingState.disksize !== savedDisksize) ||
        (zramPendingState.algorithm !== savedAlgorithm) ||
        (zramPendingState.enabled !== savedEnabled);

    if (hasPending) {
        indicator.classList.remove('hidden');
    } else {
        indicator.classList.add('hidden');
    }
}

// Select disk size
function selectZramDisksize(sizeBytes) {
    zramPendingState.disksize = sizeBytes.toString();
    renderZramCard();
}

// Select algorithm
function selectZramAlgorithm(algo) {
    zramPendingState.algorithm = algo;
    renderZramCard();
}

// Toggle enable/disable
async function toggleZramEnabled(enabled) {
    if (!enabled) {
        // Show warning before disabling
        const confirmed = await showConfirmModal({
            title: 'Disable ZRAM?',
            body: '<p>This will have a <strong>major negative impact on performance</strong> and your device may experience freezes.</p><p>Only disable ZRAM if you know what you are doing!</p>',
            iconClass: 'warning',
            confirmText: 'Disable'
        });

        if (!confirmed) {
            const toggle = document.getElementById('zram-enable-toggle');
            if (toggle) toggle.checked = true;
            return;
        }
    }

    zramPendingState.enabled = enabled ? '1' : '0';
    renderZramCard();
}

// Save ZRAM config
async function saveZram() {
    const result = await runZramBackend('save',
        zramPendingState.disksize,
        zramPendingState.algorithm,
        zramPendingState.enabled
    );

    if (result && result.includes('saved')) {
        zramSavedState = { ...zramPendingState };
        showToast('ZRAM settings saved');
        updateZramPendingIndicator();
    } else {
        showToast('Failed to save ZRAM settings', true);
    }
}

// Apply ZRAM config (now, without saving)
async function applyZram() {
    const result = await runZramBackend('apply',
        zramPendingState.disksize,
        zramPendingState.algorithm,
        zramPendingState.enabled
    );

    if (result && result.includes('applied')) {
        showToast('ZRAM settings applied');
        // Reload current state
        const currentOutput = await runZramBackend('get_current');
        zramCurrentState = parseKeyValue(currentOutput);
        renderZramCard();
    } else {
        showToast('Failed to apply ZRAM settings', true);
    }
}

// Save and Apply
async function saveAndApplyZram() {
    await saveZram();
    await applyZram();
}

// Initialize ZRAM tweak UI
function initZramTweak() {
    // Enable toggle
    const enableToggle = document.getElementById('zram-enable-toggle');
    if (enableToggle) {
        enableToggle.addEventListener('change', (e) => {
            toggleZramEnabled(e.target.checked);
        });
    }

    // Disk size preset buttons
    const sizeOptions = document.getElementById('zram-size-options');
    if (sizeOptions) {
        sizeOptions.querySelectorAll('.option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const size = btn.dataset.size;
                if (size === 'custom') {
                    const customInputRow = document.getElementById('zram-custom-input-row');
                    if (customInputRow) customInputRow.classList.toggle('hidden');
                    // Select custom button
                    sizeOptions.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                } else {
                    selectZramDisksize(size);
                }
            });
        });
    }

    // Custom size input
    const customInput = document.getElementById('zram-custom-size');
    if (customInput) {
        customInput.addEventListener('input', () => {
            const mib = parseInt(customInput.value) || 0;
            if (mib >= 1 && mib <= 65536) {
                zramPendingState.disksize = mibToBytes(mib).toString();
                updateZramPendingIndicator();
            }
        });
    }

    // Action buttons
    const btnSave = document.getElementById('zram-btn-save');
    const btnApply = document.getElementById('zram-btn-apply');
    const btnSaveApply = document.getElementById('zram-btn-save-apply');

    if (btnSave) btnSave.addEventListener('click', saveZram);
    if (btnApply) btnApply.addEventListener('click', applyZram);
    if (btnSaveApply) btnSaveApply.addEventListener('click', saveAndApplyZram);

    // Load initial state
    loadZramState();

    // Register with TWEAK_REGISTRY for preset system
    if (typeof window.registerTweak === 'function') {
        window.registerTweak('zram', {
            getState: () => ({ ...zramPendingState }),
            setState: (config) => {
                zramPendingState = { ...config };
                renderZramCard();
            },
            render: renderZramCard,
            save: saveZram,
            apply: applyZram
        });
    }
}

// Expose toast function if not already available
if (typeof showToast === 'undefined') {
    window.showToast = function (message, isError = false) {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'toast' + (isError ? ' error' : '');
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };
}

// Memory State
let memoryCurrentState = {};
let memorySavedState = {};
let memoryPendingState = {};
let memoryDirtyMode = 'ratio'; // 'ratio' or 'bytes'

// Run Memory backend command
async function runMemoryBackend(action, ...args) {
    const scriptPath = '/data/adb/modules/floppy_companion/tweaks/memory.sh';
    let cmd = `sh "${scriptPath}" ${action}`;
    if (args.length > 0) {
        cmd += ' "' + args.join('" "') + '"';
    }
    return await exec(cmd);
}

// Load Memory state
async function loadMemoryState() {
    try {
        const currentOutput = await runMemoryBackend('get_current');
        const savedOutput = await runMemoryBackend('get_saved');

        memoryCurrentState = parseKeyValue(currentOutput);
        memorySavedState = parseKeyValue(savedOutput);

        // Initialize pending state
        memoryPendingState = { ...memoryCurrentState, ...memorySavedState };

        // Determine initial Dirty Mode
        // If bytes are non-zero, use bytes. Otherwise default to ratio.
        const dBytes = parseInt(memoryPendingState.dirty_bytes || '0');
        const dbBytes = parseInt(memoryPendingState.dirty_background_bytes || '0');

        if (dBytes > 0 || dbBytes > 0) {
            memoryDirtyMode = 'bytes';
        } else {
            memoryDirtyMode = 'ratio';
        }

        renderMemoryCard();
    } catch (e) {
        console.error('Failed to load Memory state:', e);
    }
}

// Render Memory Card UI
function renderMemoryCard() {
    // 1. Swappiness
    const swappinessInput = document.getElementById('mem-swappiness');
    const swappinessVal = document.getElementById('mem-val-swappiness');
    if (swappinessInput) {
        swappinessInput.placeholder = memoryCurrentState.swappiness || '';
        swappinessInput.value = memoryPendingState.swappiness !== memoryCurrentState.swappiness ? memoryPendingState.swappiness : '';
    }
    if (swappinessVal) swappinessVal.textContent = memoryCurrentState.swappiness || '--';

    // 2. Dirty Mode Toggle
    const modeRatio = document.getElementById('mem-mode-ratio');
    const modeBytes = document.getElementById('mem-mode-bytes');
    if (modeRatio && modeBytes) {
        modeRatio.checked = memoryDirtyMode === 'ratio';
        modeBytes.checked = memoryDirtyMode === 'bytes';
    }

    // Toggle visibility based on mode
    const groupRatio = document.getElementById('mem-group-ratio');
    const groupBytes = document.getElementById('mem-group-bytes');
    if (groupRatio) groupRatio.classList.toggle('hidden', memoryDirtyMode !== 'ratio');
    if (groupBytes) groupBytes.classList.toggle('hidden', memoryDirtyMode !== 'bytes');

    // 3. Ratio Inputs
    if (memoryDirtyMode === 'ratio') {
        updateMemInput('dirty_ratio');
        updateMemInput('dirty_background_ratio');
    } else {
        updateMemInput('dirty_bytes');
        updateMemInput('dirty_background_bytes');
    }

    // 4. Other VM Params
    updateMemInput('dirty_writeback_centisecs');
    updateMemInput('dirty_expire_centisecs');
    updateMemInput('stat_interval');
    updateMemInput('vfs_cache_pressure');
    updateMemInput('watermark_scale_factor');

    updateMemoryPendingIndicator();
}

// Helper to update individual input and value label
function updateMemInput(key) {
    const input = document.getElementById(`mem-${key}`);
    const label = document.getElementById(`mem-val-${key}`);

    if (input) {
        input.placeholder = memoryCurrentState[key] || '';
        // Only show value if it differs from current
        if (memoryPendingState[key] && memoryPendingState[key] !== memoryCurrentState[key]) {
            input.value = memoryPendingState[key];
        } else {
            input.value = '';
        }
    }
    if (label) label.textContent = memoryCurrentState[key] || '--';
}

function updateMemoryPendingIndicator() {
    const indicator = document.getElementById('mem-pending-indicator');
    if (!indicator) return;

    // Simple check: compare JSON strings of interesting keys
    // In a real generic system we'd do deep compare, but here we know the keys
    const paramKeys = ['swappiness', 'dirty_ratio', 'dirty_bytes', 'dirty_background_ratio',
        'dirty_background_bytes', 'dirty_writeback_centisecs', 'dirty_expire_centisecs',
        'stat_interval', 'vfs_cache_pressure', 'watermark_scale_factor'];

    let hasPending = false;
    // Check against saved if exists, else current
    for (const key of paramKeys) {
        const savedVal = memorySavedState[key] || memoryCurrentState[key];
        const pendingVal = memoryPendingState[key] || savedVal; // Fallback to saved if not in pending
        if (pendingVal != savedVal) {
            hasPending = true;
            break;
        }
    }

    if (hasPending) indicator.classList.remove('hidden');
    else indicator.classList.add('hidden');
}

// Input Change Handlers
function handleMemInput(key, value) {
    if (value === '' || value === undefined) {
        // Revert to saved/current
        memoryPendingState[key] = memorySavedState[key] || memoryCurrentState[key];
    } else {
        memoryPendingState[key] = value;
    }

    // Handle mutual exclusivity for pending state immediately
    if (key === 'dirty_ratio' && value !== '0') memoryPendingState.dirty_bytes = '0';
    if (key === 'dirty_bytes' && value !== '0') memoryPendingState.dirty_ratio = '0';
    if (key === 'dirty_background_ratio' && value !== '0') memoryPendingState.dirty_background_bytes = '0';
    if (key === 'dirty_background_bytes' && value !== '0') memoryPendingState.dirty_background_ratio = '0';

    updateMemoryPendingIndicator();
}

function setMemoryMode(mode) {
    memoryDirtyMode = mode;
    renderMemoryCard();
}

async function saveMemory() {
    // Construct args from pending state
    // We only save keys that are relevant.
    // Ensure mutual exclusivity is enforced in the saved data
    const args = [];
    const keys = ['swappiness', 'dirty_writeback_centisecs', 'dirty_expire_centisecs',
        'stat_interval', 'vfs_cache_pressure', 'watermark_scale_factor'];

    keys.forEach(k => args.push(`${k}=${memoryPendingState[k] || memoryCurrentState[k]}`));

    if (memoryDirtyMode === 'ratio') {
        args.push(`dirty_ratio=${memoryPendingState.dirty_ratio || '0'}`);
        args.push(`dirty_background_ratio=${memoryPendingState.dirty_background_ratio || '0'}`);
        args.push(`dirty_bytes=0`);
        args.push(`dirty_background_bytes=0`);
    } else {
        args.push(`dirty_bytes=${memoryPendingState.dirty_bytes || '0'}`);
        args.push(`dirty_background_bytes=${memoryPendingState.dirty_background_bytes || '0'}`);
        args.push(`dirty_ratio=0`);
        args.push(`dirty_background_ratio=0`);
    }

    const result = await runMemoryBackend('save', ...args);
    if (result && result.includes('Saved')) {
        showToast('Memory settings saved');
        memorySavedState = { ...memoryPendingState };
        // Sync mutual exclusions to saved state
        if (memoryDirtyMode === 'ratio') {
            memorySavedState.dirty_bytes = '0';
            memorySavedState.dirty_background_bytes = '0';
        } else {
            memorySavedState.dirty_ratio = '0';
            memorySavedState.dirty_background_ratio = '0';
        }
        updateMemoryPendingIndicator();
    } else {
        showToast('Failed to save Memory settings', true);
    }
}

async function applyMemory() {
    // Similar to save but just apply
    const args = [];
    const keys = ['swappiness', 'dirty_writeback_centisecs', 'dirty_expire_centisecs',
        'stat_interval', 'vfs_cache_pressure', 'watermark_scale_factor'];

    keys.forEach(k => args.push(`${k}=${memoryPendingState[k] || memoryCurrentState[k]}`));

    if (memoryDirtyMode === 'ratio') {
        args.push(`dirty_ratio=${memoryPendingState.dirty_ratio || '0'}`);
        args.push(`dirty_background_ratio=${memoryPendingState.dirty_background_ratio || '0'}`);
        args.push(`dirty_bytes=0`);
        args.push(`dirty_background_bytes=0`);
    } else {
        args.push(`dirty_bytes=${memoryPendingState.dirty_bytes || '0'}`);
        args.push(`dirty_background_bytes=${memoryPendingState.dirty_background_bytes || '0'}`);
        args.push(`dirty_ratio=0`);
        args.push(`dirty_background_ratio=0`);
    }

    const result = await runMemoryBackend('apply', ...args);
    if (result && result.includes('Applied')) {
        showToast('Memory settings applied');
        const currentOutput = await runMemoryBackend('get_current');
        memoryCurrentState = parseKeyValue(currentOutput);
        renderMemoryCard();
    } else {
        showToast('Failed to apply Memory settings', true);
    }
}

function initMemoryTweak() {
    // Mode toggles
    const modeRatio = document.getElementById('mem-mode-ratio');
    if (modeRatio) modeRatio.addEventListener('change', () => setMemoryMode('ratio'));

    const modeBytes = document.getElementById('mem-mode-bytes');
    if (modeBytes) modeBytes.addEventListener('change', () => setMemoryMode('bytes'));

    // Inputs
    const paramKeys = ['swappiness', 'dirty_ratio', 'dirty_bytes', 'dirty_background_ratio',
        'dirty_background_bytes', 'dirty_writeback_centisecs', 'dirty_expire_centisecs',
        'stat_interval', 'vfs_cache_pressure', 'watermark_scale_factor'];

    paramKeys.forEach(key => {
        const input = document.getElementById(`mem-${key}`);
        if (input) {
            input.addEventListener('input', (e) => handleMemInput(key, e.target.value));
        }
    });

    // Buttons
    const btnSave = document.getElementById('mem-btn-save');
    const btnApply = document.getElementById('mem-btn-apply');
    const btnSaveApply = document.getElementById('mem-btn-save-apply');

    if (btnSave) btnSave.addEventListener('click', saveMemory);
    if (btnApply) btnApply.addEventListener('click', applyMemory);
    if (btnSaveApply) btnSaveApply.addEventListener('click', async () => {
        await saveMemory();
        await applyMemory();
    });

    loadMemoryState();

    // Register
    if (typeof window.registerTweak === 'function') {
        window.registerTweak('memory', {
            getState: () => ({ ...memoryPendingState }),
            setState: (config) => {
                memoryPendingState = { ...config };
                // Update mode based on config
                if (parseInt(config.dirty_bytes) > 0 || parseInt(config.dirty_background_bytes) > 0) {
                    memoryDirtyMode = 'bytes';
                } else {
                    memoryDirtyMode = 'ratio';
                }
                renderMemoryCard();
            },
            render: renderMemoryCard,
            save: saveMemory,
            apply: applyMemory
        });
    }
}


// Initialize tweaks tab
async function initTweaksTab() {
    // Initialize individual tweaks
    initZramTweak();
    initMemoryTweak();

    // Initialize preset system (after tweaks are registered)
    if (typeof window.initPresets === 'function') {
        await window.initPresets();
    }
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTweaksTab);
} else {
    initTweaksTab();
}
