#!/system/bin/sh
# Capture kernel defaults for all tweaks
# Called at boot BEFORE any tweaks are applied

MODDIR="${0%/*}/.."
OUTPUT_FILE="$MODDIR/presets/.defaults.json"

# Create presets directory
mkdir -p "$MODDIR/presets"

# --- ZRAM Defaults ---
ZRAM_DEV=""
if [ -e /dev/block/zram0 ]; then
    ZRAM_DEV="/dev/block/zram0"
elif [ -e /dev/zram0 ]; then
    ZRAM_DEV="/dev/zram0"
fi

if [ -n "$ZRAM_DEV" ]; then
    ZRAM_DISKSIZE=$(cat /sys/block/zram0/disksize 2>/dev/null || echo "0")
    ZRAM_ALGO_FULL=$(cat /sys/block/zram0/comp_algorithm 2>/dev/null || echo "lz4")
    ZRAM_ALGO=$(echo "$ZRAM_ALGO_FULL" | grep -o '\[.*\]' | tr -d '[]')
    [ -z "$ZRAM_ALGO" ] && ZRAM_ALGO=$(echo "$ZRAM_ALGO_FULL" | awk '{print $1}')
    
    # Check if swap is enabled
    ZRAM_ENABLED=0
    if swapon 2>/dev/null | grep -q zram0; then
        ZRAM_ENABLED=1
    fi
else
    ZRAM_DISKSIZE="0"
    ZRAM_ALGO="lz4"
    ZRAM_ENABLED="0"
fi

# --- Output JSON ---
cat > "$OUTPUT_FILE" << EOF
{
  "name": "Default",
  "version": 1,
  "builtIn": true,
  "capturedAt": "$(date -Iseconds)",
  "tweaks": {
    "zram": {
      "enabled": "$ZRAM_ENABLED",
      "disksize": "$ZRAM_DISKSIZE",
      "algorithm": "$ZRAM_ALGO"
    },
    "memory": {
      "swappiness": "$(cat /proc/sys/vm/swappiness 2>/dev/null || echo 60)",
      "dirty_ratio": "$(cat /proc/sys/vm/dirty_ratio 2>/dev/null || echo 20)",
      "dirty_bytes": "$(cat /proc/sys/vm/dirty_bytes 2>/dev/null || echo 0)",
      "dirty_background_ratio": "$(cat /proc/sys/vm/dirty_background_ratio 2>/dev/null || echo 10)",
      "dirty_background_bytes": "$(cat /proc/sys/vm/dirty_background_bytes 2>/dev/null || echo 0)",
      "dirty_writeback_centisecs": "$(cat /proc/sys/vm/dirty_writeback_centisecs 2>/dev/null || echo 500)",
      "dirty_expire_centisecs": "$(cat /proc/sys/vm/dirty_expire_centisecs 2>/dev/null || echo 3000)",
      "stat_interval": "$(cat /proc/sys/vm/stat_interval 2>/dev/null || echo 1)",
      "vfs_cache_pressure": "$(cat /proc/sys/vm/vfs_cache_pressure 2>/dev/null || echo 100)",
      "watermark_scale_factor": "$(cat /proc/sys/vm/watermark_scale_factor 2>/dev/null || echo 10)"
    }
  }
}
EOF

echo "Defaults captured to $OUTPUT_FILE"
