import argparse
import datetime
import getpass
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request


def remove_accents(text: str) -> str:
    """Retire les accents pour aligner sur le nom de dossier ASCII (ex: Djénéba -> Djeneba)."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def detect_expert() -> str:
    """Détecte dynamiquement le vrai nom de l'expert courant (Fatima, Mamadou, Djeneba, etc.)."""
    # 1. Variables d'environnement injectées par le runtime
    for var in ("EXPERT_NAME", "HERMES_PROFILE", "PROFILE", "EXPERT", "AGENT_NAME", "HERMES_AGENT_NAME"):
        val = os.environ.get(var)
        if val and val.strip():
            return remove_accents(val.strip()).capitalize()

    # 2. Lecture directe de SOUL.md dans le dossier courant ou les dossiers parents
    cwd = os.getcwd()
    curr = cwd
    for _ in range(4):
        soul = os.path.join(curr, "SOUL.md")
        if os.path.exists(soul):
            try:
                with open(soul, "r", encoding="utf-8") as f:
                    txt = f.read(600)
                    m = re.search(r"^name:\s*['\"]?([^'\"\r\n]+)", txt, re.MULTILINE)
                    if m and m.group(1).strip():
                        return remove_accents(m.group(1).strip()).capitalize()
            except Exception:
                pass
        parent = os.path.dirname(curr)
        if parent == curr:
            break
        curr = parent

    # 3. Déduction par le chemin d'exécution (agents/<expert>, .hermes/profiles/<expert>, etc.)
    system_reserved = {
        "workspace", "default", "node", "home", "root", "scripts", "skills", "shared", "videos",
        getpass.getuser().lower(),
    }
    patterns = [
        r"/\.hermes/profiles/([^/]+)",
        r"/hermes-experts/([^/]+)",
        r"/agents/([^/]+)",
        r"/\.openclaw/workspace-([^/]+)",
        r"/Livrables/([^/]+)",
    ]
    for p in patterns:
        m = re.search(p, cwd)
        if m:
            val = m.group(1).lower()
            if val not in system_reserved and not val.startswith("."):
                return remove_accents(m.group(1)).capitalize()

    # 4. Fichier de profil actif Hermes s'il existe
    home = os.path.expanduser("~")
    for active_f in (os.path.join(home, ".hermes", "active_profile"), os.path.join(home, ".hermes", "profile")):
        if os.path.exists(active_f):
            try:
                with open(active_f, "r", encoding="utf-8") as f:
                    name = f.read().strip()
                    if name:
                        return remove_accents(name).capitalize()
            except Exception:
                pass

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
    expert_dir = os.path.join(home, "Livrables", expert)

    # L'arborescence standard est ~/Livrables/<expert>/Videos/
    videos_dir = os.path.join(expert_dir, "Videos")
    os.makedirs(videos_dir, exist_ok=True)

    return os.path.join(videos_dir, filename)


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


def ensure_server_running(api_url: str):
    """Vérifie si MoneyPrinterTurbo répond, sinon tente un démarrage automatique."""
    try:
        req = urllib.request.Request(f"{api_url}/ping", headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            if resp.status in (200, 404):
                return
    except Exception:
        pass

    # Vérification présence de l'installation locale sur l'instance
    mpt_dirs = [
        "/home/node/MoneyPrinterTurbo",
        os.path.expanduser("~/MoneyPrinterTurbo"),
        "/opt/MoneyPrinterTurbo"
    ]
    for d in mpt_dirs:
        mpt_main = os.path.join(d, "main.py")
        if os.path.exists(mpt_main) and any(h in api_url for h in ("localhost", "127.0.0.1")):
            print("⚡ [MoneyPrinterTurbo] Démarrage automatique du moteur de montage sur le port 8088...")
            mpt_py = os.path.join(d, ".venv/bin/python")
            py_bin = mpt_py if os.path.exists(mpt_py) else sys.executable
            log_f = open(os.path.join(d, "server.log"), "a")
            try:
                subprocess.Popen(
                    [py_bin, "main.py"],
                    cwd=d,
                    stdout=log_f,
                    stderr=subprocess.STDOUT,
                    start_new_session=True
                )
                time.sleep(3)
                return
            except Exception as e:
                print(f"⚠️ Échec du démarrage automatique : {e}")
                break


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

    api_url = (args.api_url or os.environ.get("MONEYPRINTER_API_URL") or "http://localhost:8088").rstrip("/")
    api_key = args.api_key or os.environ.get("MONEYPRINTER_API_KEY") or ""
    voice_name = args.voix or os.environ.get("MONEYPRINTER_DEFAULT_VOICE") or "fr-FR-VivienneMultilingualNeural"

    # Auto-démarrage si besoin
    ensure_server_running(api_url)

    expert = remove_accents(args.expert.strip()).capitalize() if args.expert else detect_expert()
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

    task_id = None
    if isinstance(init_res, dict):
        data = init_res.get("data")
        if isinstance(data, dict):
            task_id = data.get("task_id") or data.get("taskId")
        if not task_id:
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

        if not isinstance(status_res, dict):
            continue

        data = status_res.get("data") if isinstance(status_res.get("data"), dict) else status_res

        # État MoneyPrinterTurbo : state = 1 (succès/terminé), -1 (échec), 4 (en cours)
        state = data.get("state")
        progress = data.get("progress") if data.get("progress") is not None else status_res.get("progress", 0)
        videos = data.get("videos") or []
        err_msg = data.get("error") or status_res.get("error") or ""

        raw_status = status_res.get("status")
        status_str = str(raw_status).lower() if isinstance(raw_status, str) else ""

        if progress != last_progress:
            state_label = f"state={state}" if state is not None else status_str
            print(f"   Progression : {progress}% [{state_label}]")
            last_progress = progress

        # Terminé avec succès (state == 1 ou statut textuel)
        if state == 1 or status_str in ("completed", "success", "done"):
            if videos and isinstance(videos, list) and len(videos) > 0:
                video_url = videos[0]
            else:
                res_obj = data.get("result") or status_res.get("result") or {}
                video_url = res_obj.get("video_url") or data.get("video_url") or status_res.get("video_url") or res_obj.get("file_path")
            break
        # Échec de la tâche (state == -1 ou statut failed/error)
        elif state == -1 or status_str in ("failed", "error"):
            print(f"❌ La génération a échoué : {err_msg or 'Erreur inconnue'}", file=sys.stderr)
            sys.exit(1)

    if not video_url:
        print(f"❌ Délai d'attente dépassé ({args.timeout_attente}s).", file=sys.stderr)
        sys.exit(1)

    # Résolution de l'URL absolue si relative
    if not (video_url.startswith("http://") or video_url.startswith("https://")):
        video_url = f"{api_url}/{video_url.lstrip('/')}"

    print(f"📥 Rapatriement de la vidéo depuis : {video_url}")

    # 3. Téléchargement vers ~/Livrables/<expert>/Videos/
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
