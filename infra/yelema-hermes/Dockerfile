# yelema-hermes: the Agent37 Hermes image plus the PDF tools the experts' skills call
# (livrable-html-pdf, note-de-recherche): `weasyprint`, `pdfinfo`, `pdftoppm`, and Jinja2, and
# Yelema's own Composio in place of Agent37's (yelema-entrypoint.sh, yelema-apps-mcp.py), Hermes's
# API server for the Routines tab (yelema-api-server.py), the experts' screen for "Son ordinateur"
# (yelema-desktop.sh), and one Hermes fix (hermes-heartbeat-fix.py).
# Rebuild it every time the stock image moves (a new b2b-hermes tag), or the experts miss
# gateway and Hermes fixes. See README.md next to this file.
ARG HERMES_TAG=2026.10.05a
FROM ghcr.io/agent37-platform/hermes:${HERMES_TAG}

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    weasyprint poppler-utils python3-jinja2 \
    fonts-dejavu fonts-liberation fonts-noto-color-emoji \
    x11vnc novnc websockify x11-utils \
  && rm -rf /var/lib/apt/lists/* \
  && weasyprint --version && pdfinfo -v
# Lets GPT models run ordinary commands again (see the script; drop it once Hermes ships the fix).
COPY hermes-heartbeat-fix.py /tmp/
RUN /usr/local/lib/hermes/hermes-agent/venv/bin/python /tmp/hermes-heartbeat-fix.py && rm /tmp/hermes-heartbeat-fix.py
# The stock browser tool runs its own headless Chromium, which the screen can't show; this points
# every expert at the visible one yelema-desktop.sh starts.
ENV BROWSER_CDP_URL=http://127.0.0.1:9222
COPY --chmod=0755 yelema-entrypoint.sh yelema-apps-mcp.py yelema-api-server.py yelema-desktop.sh /usr/local/bin/
USER node
ENTRYPOINT ["/usr/local/bin/yelema-entrypoint.sh"]
