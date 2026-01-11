#!/system/bin/sh
# FloppyCompanion service script
# This script applies saved tweaks after boot completes

MODDIR="${0%/*}"

# Wait for boot to complete
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 1
done

# Additional delay for vendor scripts to finish
sleep 3

# --- Capture Kernel Defaults (before any tweaks) ---
if [ -f "$MODDIR/tweaks/capture_defaults.sh" ]; then
    sh "$MODDIR/tweaks/capture_defaults.sh"
fi

# --- Apply Saved Tweaks ---

# ZRAM
if [ -f "$MODDIR/tweaks/zram.sh" ]; then
    sh "$MODDIR/tweaks/zram.sh" apply_saved
fi

# Memory
if [ -f "$MODDIR/tweaks/memory.sh" ]; then
    sh "$MODDIR/tweaks/memory.sh" apply_saved
fi
