# yelema-hermes: the Agent37 Hermes image plus the PDF tools the experts' skills call
# (livrable-html-pdf, note-de-recherche): `weasyprint`, `pdfinfo`, `pdftoppm`, and Jinja2, and
# Yelema's own Composio in place of Agent37's (yelema-entrypoint.sh, yelema-apps-mcp.py), and
# one Hermes fix (hermes-heartbeat-fix.py).
# Rebuild it every time the stock image moves (a new b2b-hermes tag), or the experts miss
# gateway and Hermes fixes. See README.md next to this file.
ARG HERMES_TAG=2026.10.03a
FROM ghcr.io/agent37-platform/hermes:${HERMES_TAG}

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    weasyprint poppler-utils python3-jinja2 \
    fonts-dejavu fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/* \
  && weasyprint --version && pdfinfo -v
# Lets GPT models run ordinary commands again (see the script; drop it once Hermes ships the fix).
COPY hermes-heartbeat-fix.py /tmp/
RUN /usr/local/lib/hermes/hermes-agent/venv/bin/python /tmp/hermes-heartbeat-fix.py && rm /tmp/hermes-heartbeat-fix.py
COPY --chmod=0755 yelema-entrypoint.sh yelema-apps-mcp.py /usr/local/bin/
USER node
ENTRYPOINT ["/usr/local/bin/yelema-entrypoint.sh"]
