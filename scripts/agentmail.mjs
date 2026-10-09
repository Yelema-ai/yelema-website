/**
 * AgentMail Provisioning Helper
 * Module dédié pour l'attribution des boîtes e-mails et la configuration des instances Hermes.
 */

export function getCleanSlug(workspaceName) {
  return (workspaceName || "mstudio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Script CLI Python autonome déposé sur l'instance pour permettre aux agents
 * d'envoyer des e-mails en ligne de commande via l'API AgentMail.
 */
export const AGENTMAIL_SEND_CLI = `#!/usr/bin/env python3
import sys, os, json, argparse, mimetypes, base64, urllib.request, urllib.error

def find_config():
    paths = [
        os.environ.get("AGENTMAIL_CONFIG_PATH"),
        os.path.expanduser("~/.yelema/agentmail.json"),
        "/home/node/.yelema/agentmail.json",
    ]
    for p in paths:
        if p and os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    return None

def resolve_path(p):
    if not p:
        return None
    expanded = os.path.expanduser(p)
    if os.path.exists(expanded):
        return expanded
    if p.startswith("~/Livrables") or p.startswith("Livrables"):
        node_livrables = os.path.join("/home/node", p.lstrip("~/"))
        if os.path.exists(node_livrables):
            return node_livrables
    return expanded

def resolve_expert_profile(from_expert_arg=None):
    if from_expert_arg and from_expert_arg.strip():
        return from_expert_arg.strip().lower()

    # 1. Variables d'environnement éventuelles
    for var in ["HERMES_PROFILE", "AGENT_NAME", "PROFILE"]:
        val = os.environ.get(var)
        if val and val.strip():
            return val.strip().lower()

    # 2. Détection par chemin du dossier profil
    home = os.path.expanduser("~")
    if "/profiles/" in home:
        return home.split("/profiles/")[1].split("/")[0].strip().lower()

    # 3. Dossier de travail courant
    cwd = os.getcwd()
    if "/profiles/" in cwd:
        return cwd.split("/profiles/")[1].split("/")[0].strip().lower()

    return None

def main():
    parser = argparse.ArgumentParser(description="Envoyer un e-mail via AgentMail")
    parser.add_argument("--to", required=True, help="Adresse e-mail du destinataire")
    parser.add_argument("--subject", required=True, help="Objet de l'e-mail")
    parser.add_argument("--body", required=True, help="Corps du message (texte)")
    parser.add_argument("--attach", action="append", default=[], help="Chemin du fichier à joindre (optionnel)")
    parser.add_argument("--from-expert", dest="from_expert", help="Identifiant de l'expert (optionnel, détecté automatiquement)")

    args = parser.parse_args()

    cfg = find_config()
    if not cfg:
        print("Erreur : Configuration AgentMail introuvable (~/.yelema/agentmail.json)", file=sys.stderr)
        sys.exit(1)

    api_key = cfg.get("api_key")
    slug = cfg.get("workspace_slug", "mstudio")
    if not api_key:
        print("Erreur : Clé d'API AgentMail manquante dans la configuration", file=sys.stderr)
        sys.exit(1)

    expert_key = resolve_expert_profile(args.from_expert)
    if not expert_key:
        print("Erreur : Impossible d'identifier l'expert expéditeur (profil non détecté).", file=sys.stderr)
        sys.exit(1)

    expert_key = expert_key.lower().strip()
    inbox_id = f"{expert_key}.{slug}@agentmail.to"

    attachments = []
    for att_path in args.attach:
        full_path = resolve_path(att_path)
        if not full_path or not os.path.exists(full_path):
            print(f"Avertissement : Le fichier à joindre '{att_path}' est introuvable, ignoré.", file=sys.stderr)
            continue

        filename = os.path.basename(full_path)
        content_type, _ = mimetypes.guess_type(full_path)
        if not content_type:
            content_type = "application/octet-stream"

        try:
            with open(full_path, "rb") as af:
                b64_content = base64.b64encode(af.read()).decode("utf-8")
            attachments.append({
                "filename": filename,
                "content": b64_content,
                "contentType": content_type
            })
        except Exception as e:
            print(f"Avertissement : Impossible de lire '{full_path}': {e}", file=sys.stderr)

    payload = {
        "to": [args.to.strip()],
        "subject": args.subject.strip(),
        "text": args.body.strip(),
        "html": f"<div style='font-family: sans-serif; line-height: 1.6;'>{args.body.strip().replace(chr(10), '<br/>')}</div>"
    }
    if attachments:
        payload["attachments"] = attachments

    # Endpoint officiel AgentMail pour l'envoi de messages
    url = f"https://api.agentmail.to/v0/inboxes/{inbox_id}/messages/send"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }, method="POST")

    try:
        with urllib.request.urlopen(req) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
            msg_id = resp_data.get("message_id") or "ok"
            print(f"✓ E-mail envoyé avec succès à {args.to} depuis {inbox_id} (Message ID: {msg_id})")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"Erreur envoi e-mail AgentMail ({e.code}): {err_body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Erreur inattendue lors de l'envoi de l'e-mail: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

/**
 * Commande shell pour déposer la configuration et l'outil CLI sur l'instance.
 */
export function agentmailInstanceConfig(apiKey, workspaceName) {
  if (!apiKey?.trim()) return "";
  const cleanSlug = getCleanSlug(workspaceName);
  const state = JSON.stringify({ api_key: apiKey.trim(), workspace_slug: cleanSlug });

  return [
    'mkdir -p "$HOME/.yelema" "$HOME/.local/bin"',
    `cat > "$HOME/.yelema/agentmail.json" <<'EOF'\n${state}\nEOF`,
    `cat > "$HOME/.local/bin/agentmail-send" <<'EOF'\n${AGENTMAIL_SEND_CLI}\nEOF`,
    'chmod +x "$HOME/.local/bin/agentmail-send"',
    'for d in "$HOME/.hermes/profiles"/*; do if [ -d "$d" ]; then mkdir -p "$d/home/.local/bin" "$d/home/.yelema"; ln -sf "$HOME/.local/bin/agentmail-send" "$d/home/.local/bin/agentmail-send"; ln -sf "$HOME/.yelema/agentmail.json" "$d/home/.yelema/agentmail.json"; ln -sf "$HOME/Livrables" "$d/home/Livrables"; fi; done',
    'grep -q "$HOME/.local/bin" "$HOME/.bashrc" 2>/dev/null || echo \'export PATH="$HOME/.local/bin:$PATH"\' >> "$HOME/.bashrc"',
  ].join("\n");
}

/**
 * Bloc d'instructions AgentMail pour SOUL.md de chaque profil expert.
 */
export function agentmailSoulSnippet(expertKey, workspaceName) {
  const cleanSlug = getCleanSlug(workspaceName);
  const email = `${expertKey}.${cleanSlug}@agentmail.to`;
  return [
    "",
    "## E-mails et Messagerie Autonome (AgentMail)",
    `Tu disposes d'une boîte e-mail professionnelle dédiée : ${email}.`,
    "Tu n'utilises PAS Gmail : tu utilises directement la commande agentmail-send via ton outil terminal.",
    "Quand l'utilisateur te demande d'envoyer un e-mail ou de partager un livrable :",
    'agentmail-send --to "<email>" --subject "<objet>" --body "<texte>" [--attach "<chemin_fichier>"]',
    "Exécute cette commande sans hésiter et confirme l'envoi une fois terminé.",
    "",
  ].join("\n");
}

/**
 * Section de documentation AgentMail pour AGENTS.md.
 */
export function agentmailAgentsMdSection() {
  return [
    "## E-mails et Messagerie (AgentMail)",
    "",
    "Chaque expert dispose d'une adresse e-mail professionnelle dédiée : `{expertKey}.{workspaceSlug}@agentmail.to`.",
    "Tu as la capacité d'envoyer des e-mails en direct avec la commande agentmail-send via ton outil terminal.",
    "",
    "Quand l'utilisateur te demande d'envoyer un e-mail :",
    "1. Exécute immédiatement la commande :",
    '   agentmail-send --to "<email>" --subject "<sujet>" --body "<texte>" [--attach "<chemin_fichier>"]',
    "2. Si un fichier a été créé dans ~/Livrables/ ou est cité, joins-le avec --attach.",
    "3. Réponds ensuite à l'utilisateur en confirmant que l'e-mail a été envoyé depuis ton adresse dédiée.",
  ].join("\n");
}

/**
 * Crée les boîtes e-mails chez AgentMail pour tous les experts déployés.
 */
export async function provisionExpertInboxes({ apiKey, experts, workspaceName }) {
  if (!apiKey?.trim()) {
    console.log("  ! AGENTMAIL_API_KEY non configurée, attribution des e-mails différée");
    return;
  }

  const cleanSlug = getCleanSlug(workspaceName);
  console.log(`  Attribution automatique des e-mails pour ${Object.keys(experts).length} profil(s)...`);

  for (const [key, folder] of Object.entries(experts)) {
    const username = `${key}.${cleanSlug}`;
    const displayName = `${folder} - Expert Yelema`;
    try {
      const res = await fetch("https://api.agentmail.to/v0/inboxes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          display_name: displayName,
          metadata: { expertKey: key, workspaceSlug: cleanSlug },
        }),
      });

      if (res.ok) {
        console.log(`    ✓ E-mail attribué : ${username}@agentmail.to`);
      } else if (res.status === 409 || res.status === 400) {
        console.log(`    ✓ E-mail opérationnel : ${username}@agentmail.to`);
      } else if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body.code === "limit_exceeded") {
          console.warn(`    ! Quota AgentMail atteint pour ${username}@agentmail.to`);
        }
      }
    } catch (err) {
      console.warn(`    ! Erreur attribution e-mail pour ${key}: ${err.message}`);
    }
  }
}
