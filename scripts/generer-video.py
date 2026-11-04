#!/usr/bin/env python3
"""
Script utilitaire universel pour les Agents Yelema : Génération et rapatriement de vidéos MoneyPrinterTurbo.
Utilisation :
  python3 scripts/generer-video.py --sujet "3 conseils pour entrepreneurs" --aspect "9:16"
"""

import argparse
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def detect_expert() -> str:
    """Détecte dynamiquement le nom de l'expert courant sans valeur en dur."""
    for var in ("EXPERT_NAME", "HERMES_PROFILE", "PROFILE", "EXPERT", "AGENT_NAME"):
        val = os.environ.get(var)
        if val and val.strip():
            return val.strip().capitalize()

    cwd = os.getcwd()
    match_profile = re.search(r"/\.hermes/profiles/([^/]+)", cwd)
    if match_profile:
        return match_profile.group(1).capitalize()

    match_experts = re.search(r"hermes-experts/([^/]+)", cwd)
    if match_experts:
        return match_experts.group(1).capitalize()

    return "Contenu"


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text).strip("-")
    return text[:40] or "video"


def get_default_dest(expert: str, sujet: str) -> str:
    now = datetime.datetime.now()
    prefix = now.strftime("%y%m%d")
    slug = slugify(sujet)
    filename = f"{prefix}_{slug}.mp4"
    home = os.path.expanduser("~")
    return os.path.join(home, "Livrables", expert, "Videos", filename)


def request_json(url: str, method: str = "GET", data: dict = None, headers: dict = None):
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)

    body_bytes = None
    if data is not None:
        body_bytes = json.dumps(data).encode("utf-8")
        req_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body_bytes, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser(description="Générateur de vidéo universel via MoneyPrinterTurbo")
    parser.add_argument("--sujet", required=True, help="Sujet ou titre de la vidéo")
    parser.add_argument("--script", default="", help="Script détaillé de la vidéo (optionnel)")
    parser.add_argument("--expert", default=None, help="Nom de l'expert (détecté automatiquement si omis)")
    parser.add_argument("--aspect", choices=["9:16", "16:9", "1:1"], default="9:16", help="Format vidéo")
    parser.add_argument("--voix", default=None, help="Voix TTS (défaut: MONEYPRINTER_DEFAULT_VOICE ou Vivienne)")
    parser.add_argument("--sortie", default="", help="Chemin du fichier de sortie .mp4")
    parser.add_argument("--api-url", default="", help="URL MoneyPrinterTurbo (override)")
    parser.add_argument("--api-key", default="", help="Clé API MoneyPrinterTurbo (override)")
    parser.add_argument("--timeout-attente", type=int, default=300, help="Délai max d'attente en secondes")

    args = parser.parse_args()

    api_url = (args.api_url or os.environ.get("MONEYPRINTER_API_URL") or "http://localhost:8080").rstrip("/")
    api_key = args.api_key or os.environ.get("MONEYPRINTER_API_KEY") or ""
    voice_name = args.voix or os.environ.get("MONEYPRINTER_DEFAULT_VOICE") or "fr-FR-VivienneMultilingualNeural"

    expert = args.expert or detect_expert()
    dest_path = args.sortie or get_default_dest(expert, args.sujet)
    dest_path = os.path.expanduser(dest_path)

    headers = {}
    if api_key:
        headers["x-api-key"] = api_key
        headers["Authorization"] = f"Bearer {api_key}"

    print(f"🎬 [MoneyPrinterTurbo] Lancement de la génération pour : '{args.sujet}'")
    print(f"   Format : {args.aspect} | Voix : {voice_name} | Expert : {expert}")

    payload = {
        "video_subject": args.sujet,
        "video_aspect": args.aspect,
        "voice_name": voice_name,
        "subtitle_enabled": True,
        "video_count": 1,
    }
    if args.script:
        payload["video_script"] = args.script

    # 1. Création de la tâche
    try:
        init_res = request_json(f"{api_url}/api/v1/videos", method="POST", data=payload, headers=headers)
    except Exception as e:
        print(f"❌ Erreur lors de la connexion à MoneyPrinterTurbo ({api_url}) : {e}", file=sys.stderr)
        sys.exit(1)

    task_id = init_res.get("task_id") or init_res.get("taskId")
    if not task_id:
        print(f"❌ Réponse inattendue du service : {init_res}", file=sys.stderr)
        sys.exit(1)

    print(f"⏳ Tâche créée avec succès (ID: {task_id}). En attente du rendu...")

    # 2. Polling du statut
    start_time = time.time()
    video_url = None
    last_progress = -1

    while time.time() - start_time < args.timeout_attente:
        time.sleep(3)
        try:
            status_res = request_json(f"{api_url}/api/v1/tasks/{urllib.parse.quote(task_id)}", headers=headers)
        except Exception as e:
            print(f"⚠️ Erreur temporaire lors de la vérification : {e}")
            continue

        raw_status = (status_res.get("status") or "").lower()
        progress = status_res.get("progress", 0)

        if progress != last_progress:
            print(f"   Progression : {progress}% [{raw_status}]")
            last_progress = progress

        if raw_status in ("completed", "success", "done"):
            res_obj = status_res.get("result") or {}
            video_url = res_obj.get("video_url") or status_res.get("video_url") or res_obj.get("file_path")
            break
        elif raw_status in ("failed", "error"):
            err_msg = status_res.get("error") or "Erreur inconnue"
            print(f"❌ La génération a échoué : {err_msg}", file=sys.stderr)
            sys.exit(1)

    if not video_url:
        print(f"❌ Délai d'attente dépassé ({args.timeout_attente}s).", file=sys.stderr)
        sys.exit(1)

    # Résolution de l'URL absolue si relative
    if not (video_url.startswith("http://") or video_url.startswith("https://")):
        video_url = f"{api_url}/{video_url.lstrip('/')}"

    print(f"📥 Rapatriement de la vidéo depuis : {video_url}")

    # 3. Téléchargement vers ~/Livrables
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    try:
        download_req = urllib.request.Request(video_url, headers=headers)
        with urllib.request.urlopen(download_req, timeout=120) as resp, open(dest_path, "wb") as out_file:
            while chunk := resp.read(64 * 1024):
                out_file.write(chunk)
    except Exception as e:
        print(f"❌ Échec du téléchargement du fichier vidéo : {e}", file=sys.stderr)
        sys.exit(1)

    size_mb = os.path.getsize(dest_path) / (1024 * 1024)
    print(f"✅ Vidéo enregistrée dans vos Livrables !")
    print(f"   Fichier : {dest_path} ({size_mb:.2f} Mo)")

    # Sortie JSON structurée pour l'agent
    result = {
        "ok": True,
        "taskId": task_id,
        "file": dest_path,
        "filename": os.path.basename(dest_path),
        "sizeMb": round(size_mb, 2),
    }
    print(f"\nRESULT_JSON:{json.dumps(result)}")


if __name__ == "__main__":
    main()
