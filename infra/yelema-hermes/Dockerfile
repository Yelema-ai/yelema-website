# yelema-hermes: the Agent37 Hermes image plus the PDF tools the experts' skills call
# (livrable-html-pdf, note-de-recherche): `weasyprint`, `pdfinfo`, `pdftoppm`, and Jinja2.
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
USER node
