#!/usr/bin/env python3
# Turns on Hermes's API server, the keyed API the Yelema app manages the experts' routines through
# (its Jobs API, /p/<expert>/api/jobs). It listens on 8642 on every interface, so the instance's
# preview URL reaches it behind the Agent37 key; Hermes then checks its own key, API_SERVER_KEY.
#
# The key is made here, once per instance, and kept in ~/.yelema/api-server-key; the app reads it
# from there through the Agent37 files API. At each start it is written into the default profile's
# .env (which turns the server on) and into every expert profile's .env (Hermes accepts
# /p/<expert>/ only with that profile's own key), so a profile installed later gets it too.
import glob
import os
import secrets

home = os.path.expanduser("~")
key_path = os.path.join(home, ".yelema", "api-server-key")
os.makedirs(os.path.dirname(key_path), exist_ok=True)
try:
    with open(key_path, encoding="utf-8") as f:
        key = f.read().strip()
except OSError:
    key = ""
if len(key) < 32:
    key = secrets.token_hex(32)
    fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(key + "\n")


def set_env(path, values):
    lines = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            lines = [line for line in f.read().splitlines() if line.split("=", 1)[0].strip() not in values]
    lines += [f"{name}={value}" for name, value in values.items()]
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


hermes = os.path.join(home, ".hermes")
os.makedirs(hermes, exist_ok=True)
set_env(os.path.join(hermes, ".env"), {"API_SERVER_KEY": key, "API_SERVER_HOST": "0.0.0.0"})
for profile in sorted(glob.glob(os.path.join(hermes, "profiles", "*", ""))):
    set_env(os.path.join(profile, ".env"), {"API_SERVER_KEY": key})
