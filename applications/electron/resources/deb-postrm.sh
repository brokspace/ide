#!/bin/sh
# Brokspace IDE (deb): remove the links created at install.
set -e
case "$1" in
    remove|purge)
        [ "$(readlink /usr/bin/brokspace-ide 2>/dev/null)" = "/opt/Brokspace IDE/brokspace-ide" ] && rm -f /usr/bin/brokspace-ide
        [ "$(readlink /usr/bin/brok 2>/dev/null)" = "/opt/Brokspace IDE/resources/bin/brok" ] && rm -f /usr/bin/brok
        ;;
esac
exit 0
