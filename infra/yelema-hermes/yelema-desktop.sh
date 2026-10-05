#!/bin/bash
# The experts' screen, which the app shows under "Son ordinateur": Agent37's hermes-vnc-desktop
# recipe (agent37-platform/examples, custom-images/hermes-vnc-desktop). The stock entrypoint starts
# Xvfb on :99 and openbox; once the display is up this attaches, each one respawned if it exits:
#   x11vnc     screencasts :99 on loopback port 5900 (-threads: it greets a new viewer in 0.1 s
#              instead of 1.2 s, so the screen opens faster)
#   websockify serves it on 6901, where the app's noVNC client connects with a signed URL
#   chromium   runs headed on the display, DevTools on loopback 9222: the browser every expert
#              drives (BROWSER_CDP_URL in the Dockerfile), so the screen shows their work
# Runs in the background and returns at once; the stock entrypoint carries on.
set -euo pipefail

# Chromium's profile lives on the persisted home, so a login done on the screen survives restarts.
PROFILE_DIR="${HOME}/.config/desktop-chromium"

# Absolute paths throughout: the image PATH puts the persisted home first.
respawn() {
  local log="$1"
  shift
  while true; do
    "$@" >"${log}" 2>&1 || true
    sleep 2
  done
}

# The last run's profile lock can name a pid that is alive again after a restart, and Chromium then
# refuses the profile. Chromium's own sandbox cannot start under gVisor; --test-type hides the
# warning bar about that.
run_chromium() {
  rm -f "${PROFILE_DIR}"/Singleton{Lock,Socket,Cookie}
  /usr/bin/chromium --no-sandbox --test-type --disable-dev-shm-usage \
    --no-first-run --no-default-browser-check --hide-crash-restore-bubble \
    --remote-debugging-port=9222 --user-data-dir="${PROFILE_DIR}" \
    --start-maximized about:blank
}

# /tmp survives a restart, and Xvfb refuses to start while the last boot's lock names a pid that
# happens to be alive again. This runs before the stock entrypoint starts Xvfb.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

(
  export DISPLAY=:99
  until /usr/bin/xdpyinfo >/dev/null 2>&1; do sleep 1; done
  respawn /tmp/x11vnc.log /usr/bin/x11vnc -display :99 -rfbport 5900 -localhost \
    -forever -shared -nopw -quiet -threads &
  respawn /tmp/novnc.log /usr/bin/websockify --web /usr/share/novnc 6901 localhost:5900 &
  respawn /tmp/chromium.log run_chromium &
  wait
) >/dev/null 2>&1 &
