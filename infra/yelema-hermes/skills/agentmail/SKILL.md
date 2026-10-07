---
name: agentmail
description: "Send, reply to, read, and manage professional emails directly using the expert's autonomous AgentMail inbox ({expert}.{workspace}@agentmail.to). Supports attaching files (PDF, documents, images) generated during the session."
version: 1.0.0
author: Yelema AI
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [Email, AgentMail, Messaging, Communication, Deliverables]
---

# AgentMail Autonomous Email

Each expert on Yelema has their own dedicated professional email inbox powered by AgentMail (`{expert}.{workspace}@agentmail.to`, e.g. `djeneba.mstudio@agentmail.to`).

Whenever the user asks you to send an email, share a document/deliverable via email, write to someone, or notify a collaborator, use the `agentmail-send` CLI tool.

## When to Use

- "Envoie ce document/PDF par e-mail à [adresse]"
- "Envoie un e-mail à [contact] pour [sujet]"
- "Partage le compte-rendu / rapport par mail à [email]"
- "Écris un mail à [destinataire]"

## How to Send an Email

Run the `agentmail-send` command in your terminal / bash:

```bash
agentmail-send --to "destinataire@exemple.com" --subject "Objet de l'e-mail" --body "Contenu du message..."
```

### Sending with Attachments

If a document, report, or PDF was generated (e.g. in `~/Livrables/`):

```bash
agentmail-send --to "destinataire@exemple.com" --subject "Objet" --body "Message..." --attach "~/Livrables/Djeneba/Mon-Fichier.pdf"
```

### Specifying Sender Profile (if needed)

```bash
agentmail-send --profile "djeneba" --to "destinataire@exemple.com" --subject "Objet" --body "Message..."
```

## Guidelines

1. **Always execute the send command**: Do NOT tell the user that you cannot send emails. You have direct autonomous sending capability through `agentmail-send`.
2. **Attach relevant files**: When sharing a deliverable that was created (like a PDF or summary), include the file path with `--attach`.
3. **Confirm clearly**: In your response, confirm that the email was successfully sent, stating the recipient and the sender address (e.g. `djeneba.mstudio@agentmail.to`).
