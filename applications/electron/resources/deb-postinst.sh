#!/bin/sh
# Brokspace IDE (deb): put the IDE and the bundled brok on PATH.
set -e
APP_DIR="/opt/Brokspace IDE"
ln -sf "$APP_DIR/brokspace-ide" /usr/bin/brokspace-ide
# Do not override a brok installed separately (install.sh, cargo, apt).
if [ ! -e /usr/bin/brok ] || [ -L /usr/bin/brok ]; then
    ln -sf "$APP_DIR/resources/bin/brok" /usr/bin/brok
fi
# Chromium's sandbox helper needs the setuid bit.
if [ -f "$APP_DIR/chrome-sandbox" ]; then
    chmod 4755 "$APP_DIR/chrome-sandbox" || true
fi
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi
exit 0
