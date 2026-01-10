let callbackCounter = 0;
function getUniqueCallbackName(prefix) {
    return `${prefix}_callback_${Date.now()}_${callbackCounter++}`;
}

async function exec(command) {
    if (typeof ksu === 'undefined') {
        console.error("ksu object is undefined");
        return null;
    }

    return new Promise((resolve, reject) => {
        const callbackFuncName = getUniqueCallbackName("exec");

        window[callbackFuncName] = (errno, stdout, stderr) => {
            delete window[callbackFuncName];

            if (errno !== 0) {
                console.error(`Command failed (errno ${errno}): ${command}`, stderr);
                resolve(null);
            } else {
                resolve(stdout ? stdout.trim() : '');
            }
        };

        try {
            ksu.exec(command, JSON.stringify({}), callbackFuncName);
        } catch (e) {
            delete window[callbackFuncName];
            console.error("KSU exec error", e);
            resolve(null);
        }
    });
}




const VARIANTS = {
    'V': 'Vanilla',
    'KN': 'KernelSU Next',
    'RKS': 'RKSU',
    'SKS': 'SukiSU Ultra'
};

const FLOPPY1280_DEVICES = ['a25x', 'a33x', 'a53x', 'm33x', 'm34x', 'gta4xls', 'a26xs'];

async function init() {
    const navItems = document.querySelectorAll('.nav-item');
    const sliderTrack = document.getElementById('slider-track');
    const TAB_COUNT = 4; // Status, Features, Tweaks, About
    let currentIndex = 0;

    function updateSlide(index) {
        currentIndex = index;
        // Update Bottom Nav

        navItems.forEach((nav, i) => {
            if (i === index) nav.classList.add('active');
            else nav.classList.remove('active');
        });

        // Slide Track
        // 0 -> 0%, 1 -> -25%, 2 -> -50%, 3 -> -75%
        const percentage = index * -25;
        sliderTrack.style.transform = `translateX(${percentage}%)`;

        // Handle FAB visibility logic here (centralized)
        // Status=0, Features=1, Tweaks=2, About=3
        const fabContainer = document.querySelector('.fab-container');
        if (fabContainer) {
            fabContainer.style.display = (index === 1) ? 'flex' : 'none';
        }

        // Auto-load features when entering Features tab (index 1)
        if (index === 1) {
            const featuresContainer = document.getElementById('features-container');
            // Refresh if empty or error, but let's allow manual refresh for now to avoid loops
            // just check if simple refresh is needed
            if (featuresContainer && featuresContainer.childElementCount <= 1) {
                if (window.loadFeatures) window.loadFeatures();
            }
        }
    }

    navItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            updateSlide(index);
        });
    });

    // Touch / Swipe Logic
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;
    let isHorizontalSwipe = null; // null = undetermined, true = horizontal, false = vertical


    const minSwipeDistance = 80;
    const swipeAngleThreshold = 0.5; // Horizontal movement threshold

    const sliderContainer = document.querySelector('.slider-container');

    sliderContainer.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        currentX = startX;
        currentY = startY;
        isDragging = true;
        isHorizontalSwipe = null;
        sliderTrack.style.transition = 'none'; // Disable transition for direct follow
    }, { passive: true });

    sliderContainer.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;

        const diffX = Math.abs(currentX - startX);
        const diffY = Math.abs(currentY - startY);

        // Determine swipe direction on first significant movement
        if (isHorizontalSwipe === null && (diffX > 10 || diffY > 10)) {
            isHorizontalSwipe = diffX > diffY * swipeAngleThreshold;
        }

        // Only handle horizontal swipes
        if (!isHorizontalSwipe) {
            return;
        }

        const diff = currentX - startX;

        // Calculate resistance or limit
        // Current translate percentage
        const baseTranslate = currentIndex * -25; // %
        // Convert diff to percentage of container width
        const containerWidth = sliderContainer.offsetWidth;
        const diffPercent = (diff / containerWidth) * 100 / 4; // /4 because track is 400%

        let newTranslate = baseTranslate + diffPercent;

        // Form boundaries with resistance
        if (newTranslate > 0) newTranslate = newTranslate * 0.3;
        if (newTranslate < -75) newTranslate = -75 + (newTranslate + 75) * 0.3;

        sliderTrack.style.transform = `translateX(${newTranslate}%)`;
    }, { passive: true });

    sliderContainer.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        sliderTrack.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)'; // Restore transition

        const diff = currentX - startX;

        // Only change slide if it was a deliberate horizontal swipe
        if (isHorizontalSwipe && Math.abs(diff) > minSwipeDistance) {
            if (diff < 0 && currentIndex < TAB_COUNT - 1) {
                currentIndex++;
            } else if (diff > 0 && currentIndex > 0) {
                currentIndex--;
            }
        }

        updateSlide(currentIndex);
    });

    // Sync state on init if needed (defaults to 0)
    updateSlide(0);

    const statusCard = document.getElementById('status-card');
    const errorCard = document.getElementById('error-card');
    const deviceEl = document.getElementById('device-name');
    const linuxVerEl = document.getElementById('linux-version');
    const versionEl = document.getElementById('kernel-version');
    const variantEl = document.getElementById('kernel-variant');
    const buildTypeEl = document.getElementById('build-type');
    // const kernelNameEl = document.getElementById('kernel-name'); // Removed as title is static or handled elsewhere
    const subtitleEl = document.getElementById('managed-kernel-subtitle');

    // 1. Check Device Name & Model
    // Note: User confirmed sec_detect exposes device_model
    // Try to read device name from various potential paths
    let deviceName = null;
    let deviceModel = null;

    const namePaths = [
        '/sys/kernel/sec_detect/device_name',
        '/sys/kernel/mi_detect/device_name'
    ];
    const modelPaths = [
        '/sys/kernel/sec_detect/device_model',
        '/sys/kernel/mi_detect/device_model'
    ];

    for (const path of namePaths) {
        deviceName = await exec(`cat ${path}`);
        if (deviceName) break;
    }
    for (const path of modelPaths) {
        deviceModel = await exec(`cat ${path}`);
        if (deviceModel) break;
    }

    let isTrinketMi = false;
    let is1280 = false;

    if (deviceName) {
        const displayName = deviceModel ? `${deviceModel} (${deviceName})` : deviceName;
        deviceEl.textContent = displayName;

        // Theme & Identification Logic
        const TRINKET_DEVICES = ['ginkgo', 'willow', 'sm6125', 'trinket', 'laurel_sprout']; // FloppyTrinketMi family
        const deviceCode = (deviceName || '').toLowerCase();

        isTrinketMi = TRINKET_DEVICES.some(code => deviceCode.includes(code));
        is1280 = FLOPPY1280_DEVICES.includes(deviceName);

        if (isTrinketMi) {
            document.body.classList.add('theme-orange');
            if (subtitleEl) subtitleEl.textContent = "Managing: FloppyTrinketMi";
        } else if (is1280) {
            // Apply "Exynos Blue" specific styling if needed via class
            document.body.classList.add('theme-exynos-blue');
            if (subtitleEl) subtitleEl.textContent = 'Managing: Floppy1280';
        } else {
            if (subtitleEl) subtitleEl.textContent = 'Managing: FloppyKernel'; // Generic fallback
        }
    } else {
        deviceEl.textContent = 'Unknown';
    }

    // --- Platform specific features ---

    // AOSP Mode (Floppy1280 Only)
    // Deprecated distinct logic was here: Now handled by generic card renderer via "info" type or "toggle" type if editable.
    // If the card is in JSON, it renders there.

    // Setup Exit Button
    const exitBtn = document.getElementById('exit-btn');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            if (typeof ksu !== 'undefined' && ksu.exit) {
                ksu.exit();

            }
        });
    }

    // External Link Handling
    const ghLink = document.getElementById('github-link');
    if (ghLink) {
        ghLink.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = ghLink.dataset.url;
            if (url) {
                await exec(`am start -a android.intent.action.VIEW -d "${url}"`);
            }
        });
    }

    // --- Features Tab Logic ---

    // Feature Definitions
    // Feature definitions now loaded from JSON


    let currentFeatures = {}; // Loaded from kernel
    let pendingChanges = {};  // User edits
    let showExperimental = false; // Experimental features toggle
    let currentSchema = null; // Current feature schema
    let currentProcCmdline = null; // Current /proc/cmdline

    const featuresContainer = document.getElementById('features-container');
    const fabRefresh = document.getElementById('fab-refresh');
    const fabApply = document.getElementById('fab-apply');
    const modal = document.getElementById('processing-modal');
    const terminalOutput = document.getElementById('terminal-output');
    const modalClose = document.getElementById('modal-close');
    const experimentalToggle = document.getElementById('experimental-toggle');

    // Reusable Confirmation Modal Elements
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalIcon = document.getElementById('confirm-modal-icon');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalBody = document.getElementById('confirm-modal-body');
    const confirmModalCancel = document.getElementById('confirm-modal-cancel');
    const confirmModalConfirm = document.getElementById('confirm-modal-confirm');

    /**
     * Show a confirmation modal dialog (returns a Promise)
     * @param {Object} options - { title, body, icon, iconClass, confirmText, cancelText }
     * @returns {Promise<boolean>} - true if confirmed, false if cancelled
     */
    function showConfirmModal(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Confirmation',
                body = 'Are you sure?',
                icon = '<svg viewBox="0 0 24 24" width="48" height="48"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/></svg>',
                iconClass = '',
                confirmText = 'Confirm',
                cancelText = 'Cancel'
            } = options;

            confirmModalTitle.textContent = title;
            confirmModalBody.innerHTML = body;
            confirmModalIcon.innerHTML = icon;
            confirmModalIcon.className = 'modal-icon' + (iconClass ? ' ' + iconClass : '');

            // Query buttons fresh each time (they may have been cloned/replaced)
            let cancelBtn = document.getElementById('confirm-modal-cancel');
            let confirmBtn = document.getElementById('confirm-modal-confirm');

            cancelBtn.textContent = cancelText;
            confirmBtn.textContent = confirmText;

            confirmModal.classList.remove('hidden');

            // Clone and replace buttons to remove old event listeners
            const newCancel = cancelBtn.cloneNode(true);
            const newConfirm = confirmBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

            newCancel.addEventListener('click', () => {
                confirmModal.classList.add('hidden');
                resolve(false);
            });

            newConfirm.addEventListener('click', () => {
                confirmModal.classList.add('hidden');
                resolve(true);
            });
        });
    }

    // Handle experimental toggle
    if (experimentalToggle) {
        experimentalToggle.addEventListener('change', async (e) => {
            if (e.target.checked) {
                e.target.checked = false; // Reset until confirmed

                const confirmed = await showConfirmModal({
                    title: 'Experimental Features',
                    body: '<p>Features exposed by enabling this toggle might be unfinished, unsupported, or dangerous.</p><p><strong>Proceed with caution.</strong></p>',
                    icon: '<svg viewBox="0 0 24 24" width="48" height="48"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/></svg>',
                    iconClass: 'warning',
                    confirmText: 'Enable',
                    cancelText: 'Cancel'
                });

                if (confirmed) {
                    experimentalToggle.checked = true;
                    showExperimental = true;
                    if (currentSchema && currentProcCmdline !== null) {
                        renderFeatures(currentSchema, currentProcCmdline);
                    }
                }
            } else {
                showExperimental = false;
                if (currentSchema && currentProcCmdline !== null) {
                    renderFeatures(currentSchema, currentProcCmdline);
                }
            }
        });
    }

    async function runBackend(action, ...args) {
        const scriptPath = '/data/adb/modules/floppy_companion/backend.sh';

        let cmd = `sh "${scriptPath}" ${action}`;
        if (args.length) {
            cmd += ' "' + args.join('" "') + '"';
        }

        // Stream output if possible? exec returns string.
        // For "Processing..." window, we might want real-time.
        // standard exec awaits completion. 
        // We'll fake progress or use multiple calls if needed.
        // For now, await full result.

        return await exec(cmd);
    }

    function logToModal(text) {
        terminalOutput.textContent += text + '\n';
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }

    function openModal() {
        modal.classList.remove('hidden');
        terminalOutput.textContent = '';
        modalClose.classList.add('hidden');
    }

    async function loadFeatures() {
        if (!featuresContainer) return;

        featuresContainer.innerHTML = '<div class="loading-spinner"></div>';
        if (fabApply) {
            fabApply.style.display = 'none';
            updateBottomPadding(false);
        }
        pendingChanges = {};

        try {
            // Load Feature Definitions
            // fetch is strictly relative in standard web, but in KSU WebView it loads from module assets if properly handled
            const response = await fetch('features.json');
            if (!response.ok) throw new Error("Failed to load features.json");
            const featureData = await response.json();

            const schema = isTrinketMi ? featureData.features_trinket : featureData.features_1280;

            // Retrieve cmdline
            const procCmdline = await exec('cat /proc/cmdline');

            // Unpack
            const rawFeatures = await runBackend('unpack');

            if (!rawFeatures || !rawFeatures.includes('Unpack successful')) {
                // Try to be more descriptive
                featuresContainer.innerHTML = `<div class="p-4 text-center">Failed to unpack.<br><small>${rawFeatures || 'No output'}</small></div>`;
                return;
            }

            // Read
            const featureOutput = await runBackend('read_features');

            const startMarker = '---FEATURES_START---';
            const endMarker = '---FEATURES_END---';

            if (!featureOutput.includes(startMarker)) {
                featuresContainer.innerHTML = `<div class="p-4 text-center">Failed to read features.<br><small>${featureOutput}</small></div>`;
                return;
            }

            const content = featureOutput.split(startMarker)[1].split(endMarker)[0].trim();

            currentFeatures = {};
            const tokens = content.split(/\s+/);
            tokens.forEach(token => {
                if (token.includes('=')) {
                    const [k, v] = token.split('=');
                    currentFeatures[k] = v;
                }
            });

            renderFeatures(schema, procCmdline);

        } catch (e) {
            featuresContainer.innerHTML = `<div class="p-4 text-center">Error: ${e.message}</div>`;
        }
    }

    function renderFeatures(schema, procCmdline) {
        // Store for re-render when experimental toggle changes
        currentSchema = schema;
        currentProcCmdline = procCmdline;

        featuresContainer.innerHTML = '';

        if (!schema || schema.length === 0) {
            featuresContainer.innerHTML = '<p class="text-center p-4">No features defined for this device.</p>';
            return;
        }

        schema.forEach(item => {
            // Skip entire feature if it's experimental and toggle is off
            if (item.experimental && !showExperimental) {
                return;
            }

            const el = document.createElement('div');
            el.className = 'feature-card';

            const currentVal = currentFeatures[item.key] || '0';

            // Int Toggle Logic: ON if currentVal is not '0' (disabled)
            const isOn = currentVal !== '0';

            // Default Value Logic for toggle ON
            let defaultVal = '1';
            if (item.type === 'select' && item.options && item.options.length > 0) {
                defaultVal = item.options[0].val;
            }

            let liveVal = null;
            if (procCmdline && item.key) {
                const match = procCmdline.match(new RegExp(`${item.key}=(\\d+)`));
                if (match) liveVal = match[1];
            }

            let warningHtml = '';
            if (item.warnIfMismatch && liveVal !== null && liveVal !== currentVal) {
                warningHtml = `<div class="feature-warning" onclick="alert('Running value (${liveVal}) differs from Image value (${currentVal}). Reboot required.')">
                    <svg class="icon-svg" viewBox="0 0 24 24" style="width:16px;height:16px;margin:0;"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                    <span>Restart pending</span>
                </div>`;
            }

            // --- Switch Construction ---
            // If info type, no switch.
            let headerControl = '';

            if (item.type !== 'info') {
                headerControl = `
                    <label class="m3-switch" style="display:inline-block; margin:0;">
                        <input type="checkbox" id="switch-${item.key}" ${isOn ? 'checked' : ''} 
                            onchange="updateFeature('${item.key}', this.checked ? '${defaultVal}' : '0', this)">
                        <span class="m3-switch-track">
                             <span class="m3-switch-thumb"></span>
                        </span>
                    </label>
                `;
            }

            let bodyControls = '';

            if (item.type === 'select') {
                // Add "Disabled" option
                const optionsWithDisabled = [
                    { val: '0', label: 'Disabled', desc: '', experimental: false },
                    ...item.options
                ];

                // Filter options based on experimental flag
                const visibleOptions = optionsWithDisabled.filter(opt => showExperimental || !opt.experimental);
                const chipsHtml = visibleOptions.map(opt => {
                    const expBadge = opt.experimental ? '<span class="experimental-badge">Exp</span>' : '';
                    return `
                    <button class="chip-btn ${opt.val === currentVal ? 'selected' : ''}" 
                        data-val="${opt.val}"
                        onclick="updateFeature('${item.key}', '${opt.val}', this)"
                        title="${opt.desc || ''}">
                        ${opt.label}${expBadge}
                    </button>
                    `;
                }).join('');

                let optionDesc = '';
                const currentOpt = optionsWithDisabled.find(o => o.val === currentVal);
                if (currentOpt && currentOpt.desc) {
                    optionDesc = `<div class="text-sm text-dim" style="margin-top:8px;">${currentOpt.desc}</div>`;
                }

                bodyControls = `<div class="feature-controls" id="ctrl-${item.key}" style="margin-top:12px;">${chipsHtml}</div>${optionDesc}`;
            }

            // Current Value Display
            let displayValText = currentVal;
            if (currentVal === '0') {
                displayValText += ' (Disabled)';
            }
            const currentValueHtml = `<div class="current-value-display">Current: ${displayValText}</div>`;

            // Render
            el.innerHTML = `
                <div class="feature-header">
                    <div class="feature-info">
                        <h3 class="feature-title">${item.title}</h3>
                        <div class="feature-key">${item.key || ''}</div>
                        <div class="feature-desc">${item.desc || ''}</div>
                    </div>
                    <div class="feature-action">
                        ${headerControl}
                    </div>
                </div>
                ${bodyControls}
                ${warningHtml}
                ${currentValueHtml}
            `;

            featuresContainer.appendChild(el);
        });
    }

    // Expose to window for inline onclick
    window.updateFeature = (key, val, target) => {
        pendingChanges[key] = val;

        const switchInput = document.getElementById(`switch-${key}`);

        if (target.type === 'checkbox') {
            // Handle Switch Toggle
            const controls = document.getElementById(`ctrl-${key}`);
            if (controls) {
                if (val === '0') {
                    // Turned OFF: Select Disabled option (val 0)
                    Array.from(controls.children).forEach(c => {
                        if (c.dataset.val === '0') c.classList.add('selected');
                        else c.classList.remove('selected');
                    });
                } else {
                    // Turned ON: Select chip matching val
                    Array.from(controls.children).forEach(c => {
                        if (c.dataset.val === val) c.classList.add('selected');
                        else c.classList.remove('selected');
                    });
                }
            }
        } else {
            // Handle Chip Click
            const container = target.parentElement;
            Array.from(container.children).forEach(c => c.classList.remove('selected'));
            target.classList.add('selected');

            // Sync Switch
            if (switchInput) {
                switchInput.checked = (val !== '0');
            }
        }

        fabApply.style.display = 'flex'; // Show Apply FAB
        updateBottomPadding(true);
    };

    // Helper: Update bottom padding based on FAB visibility
    function updateBottomPadding(hasApplyButton) {
        const switchContainer = document.querySelector('.experimental-switch-container');
        if (switchContainer) {
            // More padding when Apply button is visible (two FABs stacked)
            switchContainer.style.marginBottom = hasApplyButton ? '140px' : '80px';
        }
    }

    async function applyChanges() {
        if (Object.keys(pendingChanges).length === 0) return;

        const proceed = await showConfirmModal({
            title: 'Apply changes?',
            body: '<p>This will flash the patched kernel to your device.</p><p><strong>This involves risks.</strong></p>',
            icon: '<svg viewBox="0 0 24 24" width="48" height="48"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/></svg>',
            iconClass: 'warning',
            confirmText: 'Apply',
            cancelText: 'Cancel'
        });
        if (!proceed) return;

        openModal();
        logToModal("Starting patch process...");

        // Construct args: key=val
        const patches = Object.entries(pendingChanges).map(([k, v]) => `${k}=${v}`);

        try {
            logToModal("Applying patches: " + patches.join(", "));
            const res = await runBackend('patch', ...patches);
            logToModal(res);

            if (res.includes("Success")) {
                logToModal("\nAll done! Please reboot.");
                modalClose.classList.remove('hidden');
                fabApply.style.display = 'none';
                updateBottomPadding(false);
                loadFeatures(); // Reload to sync
            } else {
                logToModal("\nFailed!");
                modalClose.classList.remove('hidden');
            }
        } catch (e) {
            logToModal("Error: " + e.message);
            modalClose.classList.remove('hidden');
        }
    }

    // Listeners
    if (fabRefresh) fabRefresh.addEventListener('click', async () => {
        if (Object.keys(pendingChanges).length > 0) {
            const discard = await showConfirmModal({
                title: 'Discard changes?',
                body: '<p>You have unsaved changes that will be lost.</p>',
                icon: '<svg viewBox="0 0 24 24" width="48" height="48"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/></svg>',
                iconClass: 'warning',
                confirmText: 'Discard',
                cancelText: 'Cancel'
            });
            if (!discard) return;
        }
        loadFeatures();
    });

    if (fabApply) fabApply.addEventListener('click', applyChanges);
    if (modalClose) modalClose.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Load on init if active tab is features? Or lazy load?
    // We'll load when tab switches to features, or just once.
    // For now, call it if we enter features tab.
    // Hook into tab switching logic? 
    // Expose loadFeatures
    window.loadFeatures = loadFeatures;

    // --- End Features Logic ---
    // Format: 5.10.247-Floppy-v6.2-RKS-g4184e67c28bf-dirty
    const uname = await exec('uname -r');

    if (!uname) {
        statusCard.classList.add('hidden');
        errorCard.classList.remove('hidden');
        return;
    }

    // Parse Linux Version (always present in uname)
    // "5.10.247-..." -> "5.10.247"
    const linuxVer = uname.split('-')[0];
    if (linuxVerEl) linuxVerEl.textContent = linuxVer;

    if (uname.includes('Floppy')) {
        // Family handling moved to subtitle logic above

        // Parse Version
        // Regex to capture: v[Number]
        const versionMatch = uname.match(/-v(\d+\.\d+)/);
        if (versionMatch) {
            versionEl.textContent = `v${versionMatch[1]}`;
        } else {
            versionEl.textContent = uname;
        }

        // Parse Variant (RKS, V, KN, SKS)
        // We look for the part after the version
        // Example: ...-v6.2-RKS-...
        let variantFound = 'Standard';
        for (const [code, name] of Object.entries(VARIANTS)) {
            // Regex: -CODE- or -CODE$ (end of string)
            const regex = new RegExp(`-${code}(-|$)`);
            if (regex.test(uname)) {
                variantFound = name;
                break;
            }
        }
        variantEl.textContent = variantFound;

        // Parse Release Status
        if (uname.includes('-release')) {
            buildTypeEl.textContent = 'Release Build';
            buildTypeEl.style.color = 'var(--md-sys-color-primary)';
        } else {
            // Unofficial/Testing build
            let label = 'Testing';

            // Extract hash: looks for -g[hash]
            // Example: ...-RKS-g4184e67c28bf...
            const hashMatch = uname.match(/-g([0-9a-f]+)/);
            if (hashMatch) {
                label += ` (${hashMatch[1]})`; // hash without 'g'
            } else {
                label += ' (Git)';
            }

            if (uname.includes('dirty')) {
                label += ' (Dirty)';
                buildTypeEl.style.color = '#e2b349'; // Warning color
            }

            buildTypeEl.textContent = label;
        }

    } else {
        // Not FloppyKernel
        statusCard.classList.add('hidden');
        errorCard.classList.remove('hidden');
    }
}

// Initialize
if (typeof ksu !== 'undefined') {
    init();
} else {
    window.addEventListener('load', init);
}
