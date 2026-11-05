#!/usr/bin/env python3
"""
apply_telegram_topic_icons.py - Habille automatiquement les 12 sujets Telegram d'un groupe
avec les vrais visages ExpertYelema via le compte Telegram Premium configuré (MTProto).

Usage:
  python3 apply_telegram_topic_icons.py <chat_id> [--leave]

Options:
  --leave   Quitte automatiquement le groupe après avoir appliqué les visages (sans altérer les icônes).

Variables d'environnement requises:
  - TELEGRAM_API_ID
  - TELEGRAM_API_HASH
  - TELEGRAM_SESSION_STRING
"""

import asyncio
import json
import os
import sys
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.functions.messages import GetForumTopicsRequest, EditForumTopicRequest
from telethon.tl.functions.channels import LeaveChannelRequest
from telethon.errors import RPCError

# Les identifiants des émojis du pack ExpertYelema (https://t.me/addemoji/ExpertYelema)
EXPERT_FACES = {
    "adjoua": 5969576054027722422,
    "alioune": 5969618157592128985,
    "awa": 5969774936783330236,
    "djeneba": 5969914433026138152,
    "fatima": 5969999881400491290,
    "fatou": 5969791682860819040,
    "ibrahim": 5971938685472481742,
    "koffi": 5969991635063283359,
    "kouassi": 5969773764257258928,
    "mamadou": 5969755441926777485,
    "nadia": 5972007623992548834,
    "salif": 5969881847109262972,
    "yele": 5312536423851630001,
}

async def apply_icons(chat_id_arg: str, leave_after: bool = False):
    api_id = os.environ.get("TELEGRAM_API_ID")
    api_hash = os.environ.get("TELEGRAM_API_HASH")
    session_str = os.environ.get("TELEGRAM_SESSION_STRING")

    if not api_id or not api_hash or not session_str:
        print(json.dumps({
            "ok": False,
            "error": "missing_credentials",
            "message": "TELEGRAM_API_ID, TELEGRAM_API_HASH ou TELEGRAM_SESSION_STRING manquant dans l'environnement."
        }))
        sys.exit(1)

    try:
        api_id_int = int(api_id)
    except ValueError:
        print(json.dumps({
            "ok": False,
            "error": "invalid_api_id",
            "message": "TELEGRAM_API_ID doit être un entier."
        }))
        sys.exit(1)

    client = TelegramClient(StringSession(session_str), api_id_int, api_hash)
    await client.connect()

    if not await client.is_user_authorized():
        print(json.dumps({
            "ok": False,
            "error": "unauthorized",
            "message": "Session Telegram expirée ou non autorisée."
        }))
        await client.disconnect()
        sys.exit(1)

    try:
        try:
            target_id = int(chat_id_arg)
        except ValueError:
            target_id = chat_id_arg

        peer = await client.get_input_entity(target_id)

        # Récupération de tous les sujets du groupe
        topics_res = await client(GetForumTopicsRequest(
            peer=peer,
            offset_date=None,
            offset_id=0,
            offset_topic=0,
            limit=100
        ))

        applied = []
        errors = []

        for topic in topics_res.topics:
            title = getattr(topic, "title", "").strip().lower()
            topic_id = topic.id

            # Correspondance par nom de profil d'expert
            matched_profile = None
            for profile in EXPERT_FACES.keys():
                if profile in title or title in profile:
                    matched_profile = profile
                    break

            if not matched_profile:
                continue

            target_emoji = EXPERT_FACES[matched_profile]
            current_emoji = getattr(topic, "icon_emoji_id", None)

            # Si l'icône est déjà la bonne, rien à faire
            if current_emoji == target_emoji:
                applied.append({"profile": matched_profile, "topic_id": topic_id, "status": "already_set"})
                continue

            try:
                await client(EditForumTopicRequest(
                    peer=peer,
                    topic_id=topic_id,
                    icon_emoji_id=target_emoji
                ))
                applied.append({"profile": matched_profile, "topic_id": topic_id, "status": "updated"})
                await asyncio.sleep(0.3)
            except RPCError as rpc_err:
                desc = str(rpc_err)
                if "TOPIC_NOT_MODIFIED" in desc:
                    applied.append({"profile": matched_profile, "topic_id": topic_id, "status": "not_modified"})
                else:
                    errors.append({"profile": matched_profile, "topic_id": topic_id, "error": desc})

        left_group = False
        if leave_after:
            try:
                await client(LeaveChannelRequest(peer))
                left_group = True
            except Exception as e:
                errors.append({"action": "leave_group", "error": str(e)})

        print(json.dumps({
            "ok": len(errors) == 0,
            "chat_id": chat_id_arg,
            "applied": applied,
            "errors": errors,
            "left_group": left_group
        }))

    except Exception as exc:
        print(json.dumps({
            "ok": False,
            "error": "apply_failed",
            "message": str(exc)
        }))
        sys.exit(1)
    finally:
        await client.disconnect()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "ok": False,
            "error": "missing_chat_id",
            "message": "Usage: apply_telegram_topic_icons.py <chat_id> [--leave]"
        }))
        sys.exit(1)

    chat_id = sys.argv[1].strip()
    leave = "--leave" in sys.argv
    asyncio.run(apply_icons(chat_id, leave_after=leave))
