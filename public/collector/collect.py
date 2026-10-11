#!/usr/bin/env python3
"""Read a bounded sample of local agent logs into a small digest, then submit that summary."""

import argparse
import json
import os
import hashlib
import re
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

CLIENTS = ("codex", "claude-code", "antigravity", "cursor", "chatgpt", "other")
GAPS = (
    "web_history_unavailable",
    "no_artifact_inspection",
    "no_tokscale",
    "partial_window",
    "unattributed_runs",
    "other_sources_missing",
    "insufficient_records",
)
TOKSCALE_CLIENTS = {
    "codex": ("codex",),
    "claude-code": ("claude",),
    "antigravity": ("antigravity",),
    "cursor": ("cursor",),
    "chatgpt": (),
    "other": ("grok", "opencode", "hermes"),
}
TOKSCALE_CLIENT = {
    "codex": "codex",
    "claude": "claude-code",
    "antigravity": "antigravity",
    "cursor": "cursor",
    "grok": "other",
    "opencode": "other",
    "hermes": "other",
}
AUTO_WORDS = ("cron", "schedule", "heartbeat", "automation", "system")
TOOL_TYPES = {"tool_use", "tool_call", "function_call", "custom_tool_call"}
MESSAGE_TYPES = {"message", "agent_message"}
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
SECRET_RE = re.compile(r"sk-[A-Za-z0-9_\-]{8,}")
BEARER_RE = re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{8,}")
URL_RE = re.compile(r"https?://\S+")
PATH_RE = re.compile(r"/Users/\S+")
SPACE_RE = re.compile(r"\s+")
TOKEN_RE = re.compile(r"^[0-9a-f]{64}$")
SESSION_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
READ_HALF = 1024 * 1024
BYTE_CAP = 2 * READ_HALF
ROW_CAP = 4096
CANDIDATE_CAP = 24
TURN_CAP = 600
TURN_BUDGET = 24
INJECT_RE = re.compile(r"^\s*(<[A-Za-z][\w\-]*[\s>/]|#\s*AGENTS\.md|# (Browser|Files)\b|\[Request interrupted)")
TEMPLATE_RE = re.compile(r"\b(Task|Automation|Job|Run|Contract) ID:|kbctl work contract", re.I)
# The Agent MBTI prompt itself opens a session that only pastes instructions and approves them.
COLLECTOR_PROMPT_RE = re.compile(r"Agent MBTI.{0,80}?collect\.py", re.S)
SAMPLE_SALT = "agent-mbti-sample-v1"
SYSTEM_BUDGET = 6.0
LINE_CAP = 4 * 1024
USER_MARKERS = {"claude": b'"type":"user"', "codex": b'"role":"user"', "cursor": b'"role":"user"'}
TOOL_MARKERS = (b'"tool_use"', b'"function_call"', b'"custom_tool_call"', b'"local_shell_call"')
STAMP_RE = re.compile(rb'"(?:timestamp|createdAt)"\s*:\s*"([^"]{10,40})"')
PROMPT_SOURCE_RE = re.compile(rb'"promptSource"\s*:\s*"([a-z]+)"')
CODEX_CHILD_RE = re.compile(rb'"parent_thread_id"\s*:\s*"[^"]|"source"\s*:\s*\{\s*"subagent"')
PROMPT_TEXT_RE = re.compile(r'"(?:text|content)"\s*:\s*"((?:[^"\\]|\\.){1,1024})')
ESCAPE_RE = re.compile(r'\\+[nrt"]')
ASSET_RE = re.compile(
    r"(?:([\w.\-]+)/)?\b(SKILL\.md|AGENTS\.md|CLAUDE\.md)\b"
    r"|(\.cursor/rules/[\w.\-/]*[\w\-]"
    r"|scripts/[\w.\-/]*?\.(?:py|sh|js|mjs|ts)\b"
    r"|\.github/workflows/[\w.\-]+\.ya?ml\b"
    r"|\.git/hooks/[\w.\-]+|\.husky/[\w.\-]+|\.claude/hooks/[\w.\-]+|hooks\.json\b"
    r"|(?<![\w.\-])[\w.\-]+\.plist\b)"
)
WRITE_RE = re.compile(
    r'"name"\s*:\s*"(?:Write|Edit|MultiEdit|NotebookEdit|StrReplace|EditNotebook)"\s*,\s*"input"\s*:\s*\{[^{}]*?'
    r'"(?:file_path|path|notebook_path|target_notebook)"\s*:\s*"([^"]+)"'
)
PATCH_RE = re.compile(r"\*\*\* (?:Add|Update) File: (\S+)")
GEARS = (
    ("schedule", re.compile(r"\bcrontab\b|\blaunchctl\b|LaunchAgents/|\bschtasks\b|systemd-run|\.timer\b")),
    ("ci", re.compile(r"\.github/workflows/|\bgh (?:workflow|run)\b")),
    ("hook", re.compile(r"\.git/hooks/|\.husky/|\.claude/hooks/|hooks\.json|\bpre-commit\b|\bpre-push\b")),
    ("heartbeat", re.compile(r"heartbeat|watchdog|keepalive", re.I)),
)


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(2)


def parse_time(value):
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def local_day(moment, zone):
    return moment.astimezone(zone).strftime("%Y-%m-%d")


def family(model):
    if not isinstance(model, str) or not model:
        return "unknown"
    name = model.lower()
    if name.startswith(("gpt", "o1", "o3", "o4", "codex")) or "openai" in name:
        return "openai"
    if "claude" in name or "anthropic" in name:
        return "anthropic"
    if "gemini" in name or "gemma" in name or "google" in name:
        return "google"
    if "grok" in name or name.startswith("xai"):
        return "xai"
    if "deepseek" in name:
        return "deepseek"
    if "glm" in name or "zhipu" in name or name.startswith("zai"):
        return "zai"
    return "other"


def redact(text):
    cleaned = EMAIL_RE.sub("[email]", text or "")
    cleaned = SECRET_RE.sub("[secret]", cleaned)
    cleaned = BEARER_RE.sub("[secret]", cleaned)
    cleaned = URL_RE.sub("[link]", cleaned)
    cleaned = PATH_RE.sub("[path]", cleaned)
    return SPACE_RE.sub(" ", cleaned).strip()[:200]


def blocks(content, role=None):
    messages = []
    tools = []
    if isinstance(content, str):
        messages.append(content)
    elif isinstance(content, list):
        for part in content:
            if isinstance(part, str):
                messages.append(part)
            elif isinstance(part, dict):
                if part.get("type") in TOOL_TYPES:
                    tools.append(str(part.get("name") or part.get("tool") or "tool"))
                elif isinstance(part.get("text"), str):
                    messages.append(part["text"])
    elif isinstance(content, dict) and isinstance(content.get("text"), str):
        messages.append(content["text"])
    if role == "user":
        messages = [message for message in messages if not INJECT_RE.match(message)]
    turns = []
    message = redact("\n".join(messages))
    if message:
        turns.append(("message", message))
    for name in tools:
        label = redact(name)
        if label:
            turns.append(("tool", label))
    return turns


def open_file(path):
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    return os.fdopen(fd, "rb")


def load_json(raw):
    try:
        obj = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if isinstance(obj, dict):
        return obj
    return None


def file_birth(info):
    birth = getattr(info, "st_birthtime", None)
    if birth is None:
        return None
    return datetime.fromtimestamp(birth, timezone.utc)


def remember(days, moment, zone):
    if moment is not None:
        days.add(local_day(moment, zone))


def blank(truncated=False):
    return {"opened": False, "truncated": truncated, "gaps": set(), "days": set(), "samples": []}


def capped_bytes(path, size):
    try:
        handle = open_file(path)
    except OSError:
        return None
    with handle:
        if size <= BYTE_CAP:
            return handle.read()
        head = handle.read(READ_HALF)
        handle.seek(size - READ_HALF)
        tail = handle.read(READ_HALF)
    if b"\n" in head:
        head = head[:head.rfind(b"\n")]
    else:
        head = b""
    if b"\n" in tail:
        tail = tail[tail.find(b"\n") + 1:]
    else:
        tail = b""
    return head + b"\n" + tail


def objects_from(blob):
    objects = []
    if not blob:
        return objects
    for raw in blob.splitlines():
        if not raw:
            continue
        obj = load_json(raw)
        if obj is not None:
            objects.append(obj)
    return objects


def note_user_day(day, moment, zone):
    current = local_day(moment, zone)
    return current if day is None else min(day, current)


def pack(client, day, turns):
    users = [text for role, kind, text in turns if role == "user" and kind == "message"]
    agent_message = any(role == "agent" and kind == "message" for role, kind, _text in turns)
    if len(users) < 2 or day is None or not agent_message:
        return None
    if TEMPLATE_RE.search(users[0]) or COLLECTOR_PROMPT_RE.search(users[0]):
        return None
    chosen = choose_turns(turns)
    if not chosen:
        return None
    return {"client": client, "day": day, "turns": chosen, "key": users[0][:120]}


def collapse(turns):
    grouped = []
    for role, kind, text in turns:
        if kind == "tool" and grouped and grouped[-1][1] == "tool" and grouped[-1][0] == role:
            grouped[-1][3].append(text)
        else:
            grouped.append([role, kind, text, [text] if kind == "tool" else None])
    result = []
    for role, kind, text, names in grouped:
        if kind == "tool":
            unique = list(dict.fromkeys(names))
            text = ", ".join(unique[:4])
            if len(unique) > 4:
                text += f" (+{len(unique) - 4})"
            if len(names) > 1:
                text += f" x{len(names)}"
        result.append((role, kind, text))
    return result


def choose_turns(turns):
    turns = collapse(turns)
    count = len(turns)
    users = [index for index, turn in enumerate(turns) if turn[0] == "user" and turn[1] == "message"]
    agent_messages = [index for index, turn in enumerate(turns) if turn[0] == "agent" and turn[1] == "message"]
    if not users or not agent_messages:
        return []

    def after(index):
        for agent in agent_messages:
            if agent > index:
                return agent
        return None

    def before(index):
        found = None
        for agent in agent_messages:
            if agent < index:
                found = agent
        return found

    def with_tool(index):
        picked = [index]
        if index + 1 < count and turns[index + 1][1] == "tool":
            picked.append(index + 1)
        return picked

    first = [users[0]]
    opening = after(users[0])
    if opening is not None:
        first += with_tool(opening)
    middle = []
    for user in users[1:]:
        group = []
        earlier = before(user)
        if earlier is not None:
            group.append(earlier)
        group.append(user)
        later = after(user)
        if later is not None:
            group += with_tool(later)
        middle.append(group)
    last = [agent_messages[-1]]
    budget = TURN_BUDGET - len(first) - len(last)
    slots = 0
    if middle:
        average = max(1, round(sum(len(group) for group in middle) / len(middle)))
        slots = max(1, budget // average)
    while True:
        kept = spaced(middle, slots)
        chosen = sorted({index for group in [first, *kept, last] for index in group})
        if len(chosen) <= TURN_BUDGET + 4 or not kept:
            return [turns[index] for index in chosen]
        slots = len(kept) - 1


def spaced(groups, slots):
    if slots >= len(groups):
        return groups
    step = len(groups) / max(slots, 1)
    return [groups[int(slot * step)] for slot in range(slots)]


def extend_turns(turns, role, content):
    if len(turns) >= TURN_CAP:
        return False
    for kind, text in blocks(content, role):
        turns.append((role, kind, text))
        if len(turns) >= TURN_CAP:
            return False
    return True


def claude_user_class(obj):
    if obj.get("isMeta") is True:
        return None
    if obj.get("isSidechain") is True:
        return "side"
    origin = obj.get("origin") if isinstance(obj.get("origin"), dict) else {}
    kind = str(origin.get("kind") or "")
    turn = str(obj.get("turnOrigin") or "")
    source = str(obj.get("promptSource") or "")
    if kind.startswith("auto") or turn in {"sdk", "auto"} or source == "sdk":
        return "auto"
    if kind == "human" or turn == "human" or source == "typed":
        return "human"
    return None


def message_moment(obj):
    raw = obj.get("timestamp") if isinstance(obj.get("timestamp"), str) else None
    return parse_time(raw) if raw else None


def read_claude(item, start, stop, zone):
    blob = capped_bytes(item["path"], item["size"])
    result = blank()
    if blob is None:
        return result
    result["opened"] = True
    turns = []
    day = None
    for obj in objects_from(blob):
        moment = message_moment(obj)
        kind = obj.get("type")
        if kind in {"user", "assistant"} and moment is None:
            result["gaps"].add("unattributed_runs")
            continue
        if moment is None or not (start <= moment < stop):
            continue
        remember(result["days"], moment, zone)
        message = obj.get("message") if isinstance(obj.get("message"), dict) else {}
        if kind == "user" and claude_user_class(obj) == "human":
            before = len(turns)
            extend_turns(turns, "user", message.get("content"))
            if any(role == "user" and turn_kind == "message" for role, turn_kind, _text in turns[before:]):
                day = note_user_day(day, moment, zone)
        elif kind == "assistant":
            extend_turns(turns, "agent", message.get("content"))
        if len(turns) >= TURN_CAP:
            break
    sample = pack("claude-code", day, turns)
    if sample:
        result["samples"].append(sample)
    return result


def codex_subagent(payload):
    source = payload.get("source")
    return bool(payload.get("parent_thread_id")) or (isinstance(source, dict) and "subagent" in source)


def read_codex(item, start, stop, zone):
    blob = capped_bytes(item["path"], item["size"])
    result = blank()
    if blob is None:
        return result
    result["opened"] = True
    objects = objects_from(blob)
    subagent = False
    for obj in objects:
        payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else {}
        if obj.get("type") == "session_meta" and codex_subagent(payload):
            subagent = True
    turns = []
    day = None
    for obj in objects:
        payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else {}
        moment = message_moment(obj)
        ptype = payload.get("type")
        message_like = ptype in MESSAGE_TYPES or ptype in TOOL_TYPES
        if message_like and moment is None:
            result["gaps"].add("unattributed_runs")
            continue
        if moment is None or not (start <= moment < stop) or not message_like:
            continue
        remember(result["days"], moment, zone)
        if subagent:
            continue
        role = payload.get("role")
        if ptype == "message" and role == "user":
            before = len(turns)
            extend_turns(turns, "user", payload.get("content"))
            if any(turn_role == "user" and kind == "message" for turn_role, kind, _text in turns[before:]):
                day = note_user_day(day, moment, zone)
        elif ptype in {"function_call", "custom_tool_call"}:
            if len(turns) < TURN_CAP:
                turns.append(("agent", "tool", redact(str(payload.get("name") or "tool"))))
        elif ptype == "agent_message" or (ptype == "message" and role == "assistant") or ptype in TOOL_TYPES:
            extend_turns(turns, "agent", payload.get("content"))
        if len(turns) >= TURN_CAP:
            break
    if not subagent:
        sample = pack("codex", day, turns)
        if sample:
            result["samples"].append(sample)
    return result


def read_cursor(item, start, stop, zone):
    blob = capped_bytes(item["path"], item["size"])
    result = blank()
    if blob is None:
        return result
    result["opened"] = True
    objects = objects_from(blob)
    has_clock = b'"timestamp"' in blob or b'"createdAt"' in blob
    turns = []
    day = None
    if not has_clock:
        born = item["birth"]
        modified = datetime.fromtimestamp(item["mtime"], timezone.utc)
        if born is not None and start <= born < stop and start <= modified < stop:
            day = local_day(born, zone)
            result["days"].add(day)
            for obj in objects:
                if obj.get("role") not in {"user", "assistant"}:
                    continue
                message = obj.get("message") if isinstance(obj.get("message"), dict) else {}
                role = "user" if obj.get("role") == "user" else "agent"
                extend_turns(turns, role, message.get("content"))
                if len(turns) >= TURN_CAP:
                    break
        else:
            result["gaps"].add("unattributed_runs")
    else:
        for obj in objects:
            if obj.get("role") not in {"user", "assistant"}:
                continue
            raw = obj.get("timestamp") or obj.get("createdAt")
            moment = parse_time(raw) if isinstance(raw, str) else None
            message = obj.get("message") if isinstance(obj.get("message"), dict) else {}
            if moment is None:
                result["gaps"].add("unattributed_runs")
                continue
            if not (start <= moment < stop):
                continue
            remember(result["days"], moment, zone)
            role = "user" if obj.get("role") == "user" else "agent"
            before = len(turns)
            extend_turns(turns, role, message.get("content"))
            if role == "user" and any(turn_role == "user" and kind == "message" for turn_role, kind, _text in turns[before:]):
                day = note_user_day(day, moment, zone)
            if len(turns) >= TURN_CAP:
                break
    sample = pack("cursor", day, turns)
    if sample:
        result["samples"].append(sample)
    return result


def grok_bounds(turns):
    moments = []
    for turn in turns:
        if isinstance(turn, dict):
            moment = parse_time(turn.get("endedAt")) if isinstance(turn.get("endedAt"), str) else None
            if moment is not None:
                moments.append(moment)
    return moments


def read_grok(item, start, stop, zone):
    result = blank()
    blob = capped_bytes(item["path"], item["size"])
    if blob is None:
        return result
    result["opened"] = True
    usage_path = os.path.join(os.path.dirname(item["path"]), "usage.json")
    try:
        with open_file(usage_path) as handle:
            usage = json.load(handle)
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        result["gaps"].add("unattributed_runs")
        return result
    moments = grok_bounds(usage.get("turns") if isinstance(usage, dict) else None)
    if not moments:
        result["gaps"].add("unattributed_runs")
        return result
    inside = [moment for moment in moments if start <= moment < stop]
    for moment in inside:
        remember(result["days"], moment, zone)
    if min(moments) < start or max(moments) >= stop:
        result["gaps"].add("partial_window")
        return result
    day = local_day(min(moments), zone)
    turns = []
    for obj in objects_from(blob):
        if obj.get("type") == "user":
            extend_turns(turns, "user", obj.get("content") if isinstance(obj.get("content"), str) else "")
        elif obj.get("type") == "assistant":
            extend_turns(turns, "agent", obj.get("content") if isinstance(obj.get("content"), str) else "")
            if obj.get("tool_calls"):
                turns.append(("agent", "tool", "tool"))
        if len(turns) >= TURN_CAP:
            break
    sample = pack("other", day, turns)
    if sample:
        result["samples"].append(sample)
    return result


def connect_db(path):
    if not os.path.isfile(path) or os.path.islink(path):
        return None
    quoted = urllib.parse.quote(path, safe="/")
    return sqlite3.connect(f"file:{quoted}?mode=ro", uri=True)


def read_opencode(item, start, stop, zone):
    result = blank()
    connection = connect_db(item["path"])
    if connection is None:
        return result
    result["opened"] = True
    start_ms = int(start.timestamp() * 1000)
    stop_ms = int(stop.timestamp() * 1000)
    only = item.get("session")
    try:
        sessions = connection.execute(
            "SELECT id, parent_id, time_created FROM session WHERE time_updated >= ? AND time_created < ? ORDER BY id",
            (start_ms, stop_ms),
        ).fetchall()
        parents = {}
        for sid, parent, created in sessions:
            if only is not None and sid != only:
                continue
            if created is not None:
                remember(result["days"], datetime.fromtimestamp(created / 1000, timezone.utc), zone)
            if not parent:
                parents[sid] = {"turns": [], "day": None}
        rows = connection.execute(
            "SELECT id, session_id, time_created, data FROM message WHERE time_created >= ? AND time_created < ?"
            + (" AND session_id = ?" if only is not None else "") + " ORDER BY time_created ASC LIMIT ?",
            (start_ms, stop_ms) + ((only,) if only is not None else ()) + (ROW_CAP + 1,),
        ).fetchall()
        if len(rows) > ROW_CAP:
            result["truncated"] = True
            rows = rows[:ROW_CAP]
        for mid, sid, created, data in rows:
            info = parents.get(sid)
            if created is None:
                continue
            moment = datetime.fromtimestamp(created / 1000, timezone.utc)
            remember(result["days"], moment, zone)
            if info is None or len(info["turns"]) >= TURN_CAP:
                continue
            try:
                payload = json.loads(data) if isinstance(data, str) else {}
            except json.JSONDecodeError:
                payload = {}
            role_name = payload.get("role") if isinstance(payload, dict) else None
            role = "user" if role_name == "user" else "agent" if role_name == "assistant" else None
            if role is None:
                continue
            parts = connection.execute(
                "SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC",
                (mid,),
            ).fetchall()
            content = []
            for (raw,) in parts:
                try:
                    part = json.loads(raw) if isinstance(raw, str) else {}
                except json.JSONDecodeError:
                    continue
                if isinstance(part, dict):
                    content.append(part)
            before = len(info["turns"])
            extend_turns(info["turns"], role, content)
            if role == "user" and any(turn_role == "user" and kind == "message" for turn_role, kind, _text in info["turns"][before:]):
                info["day"] = note_user_day(info["day"], moment, zone)
        for sid in sorted(parents):
            sample = pack("other", parents[sid]["day"], parents[sid]["turns"])
            if sample:
                result["samples"].append(sample)
    except sqlite3.Error:
        result["gaps"].add("unattributed_runs")
    finally:
        connection.close()
    return result


def hermes_scale(connection):
    maximum = connection.execute("SELECT max(started_at) FROM sessions").fetchone()[0] or 0
    return 1000.0 if maximum > 1e11 else 1.0


def hermes_auto(source, created):
    text = f"{source or ''} {created or ''}".lower()
    return any(word in text for word in AUTO_WORDS)


def read_hermes(item, start, stop, zone):
    result = blank()
    connection = connect_db(item["path"])
    if connection is None:
        return result
    result["opened"] = True
    try:
        scale = hermes_scale(connection)
        start_n = start.timestamp() * scale
        stop_n = stop.timestamp() * scale
        only = item.get("session")
        sessions = connection.execute(
            "SELECT id, parent_session_id, started_at, source, created_source FROM sessions "
            "WHERE COALESCE(last_activity_at, ended_at, started_at) >= ? AND started_at < ? ORDER BY id",
            (start_n, stop_n),
        ).fetchall()
        parents = {}
        for sid, parent, started, source, created in sessions:
            if only is not None and sid != only:
                continue
            if started is not None and start_n <= started < stop_n:
                remember(result["days"], datetime.fromtimestamp(started / scale, timezone.utc), zone)
            if not parent and not hermes_auto(source, created):
                parents[sid] = {"turns": [], "day": None}
        rows = connection.execute(
            "SELECT session_id, role, content, tool_name, timestamp FROM messages WHERE timestamp >= ? AND timestamp < ?"
            + (" AND session_id = ?" if only is not None else "") + " ORDER BY timestamp ASC LIMIT ?",
            (start_n, stop_n) + ((only,) if only is not None else ()) + (ROW_CAP + 1,),
        ).fetchall()
        if len(rows) > ROW_CAP:
            result["truncated"] = True
            rows = rows[:ROW_CAP]
        for sid, role_name, content, tool_name, stamp in rows:
            info = parents.get(sid)
            if stamp is None:
                continue
            moment = datetime.fromtimestamp(stamp / scale, timezone.utc)
            remember(result["days"], moment, zone)
            if info is None or len(info["turns"]) >= TURN_CAP:
                continue
            if role_name == "user":
                before = len(info["turns"])
                extend_turns(info["turns"], "user", content if isinstance(content, str) else "")
                if any(role == "user" and kind == "message" for role, kind, _text in info["turns"][before:]):
                    info["day"] = note_user_day(info["day"], moment, zone)
            elif role_name == "assistant":
                extend_turns(info["turns"], "agent", content if isinstance(content, str) else "")
            elif role_name == "tool":
                label = redact(tool_name if isinstance(tool_name, str) and tool_name else "tool")
                if label:
                    info["turns"].append(("agent", "tool", label))
        for sid in sorted(parents):
            sample = pack("other", parents[sid]["day"], parents[sid]["turns"])
            if sample:
                result["samples"].append(sample)
    except sqlite3.Error:
        result["gaps"].add("unattributed_runs")
    finally:
        connection.close()
    return result


READERS = {
    "claude": read_claude,
    "codex": read_codex,
    "cursor": read_cursor,
    "grok": read_grok,
    "opencode": read_opencode,
    "hermes": read_hermes,
}


def directory_exists(path):
    return os.path.isdir(path) and not os.path.islink(path)


def add_file(files, client, kind, path, start, stop):
    if os.path.islink(path):
        return
    try:
        info = os.lstat(path)
    except OSError:
        return
    if not stat.S_ISREG(info.st_mode):
        return
    if not (start.timestamp() <= info.st_mtime < stop.timestamp()):
        return
    files.append({
        "client": client,
        "kind": kind,
        "path": path,
        "mtime": info.st_mtime,
        "birth": file_birth(info),
        "size": info.st_size,
    })


def walk_files(root):
    if not directory_exists(root):
        return
    for directory, names, filenames in os.walk(root, followlinks=False):
        names[:] = [name for name in names if not os.path.islink(os.path.join(directory, name))]
        for name in filenames:
            path = os.path.join(directory, name)
            if os.path.islink(path):
                continue
            yield directory, name, path


def list_jsonl(root, client, kind, start, stop, files, marker=None, children=None):
    if not directory_exists(root):
        return False
    for _directory, name, path in walk_files(root):
        if not name.endswith(".jsonl"):
            continue
        parts = path.split(os.sep)
        if "subagents" in parts:
            if children is not None:
                add_file(children, client, kind, path, start, stop)
            continue
        if marker is not None and marker not in parts:
            continue
        add_file(files, client, kind, path, start, stop)
    return True


def list_grok(home, start, stop, files):
    root = os.path.join(home, ".grok", "sessions")
    if not directory_exists(root):
        return False
    for _directory, name, path in walk_files(root):
        if name == "chat_history.jsonl":
            add_file(files, "other", "grok", path, start, stop)
    return True


def db_sessions(connection, kind, start, stop):
    if kind == "opencode":
        rows = connection.execute(
            "SELECT id, parent_id FROM session WHERE time_updated >= ? AND time_created < ? ORDER BY id",
            (int(start.timestamp() * 1000), int(stop.timestamp() * 1000)),
        ).fetchall()
        return [sid for sid, parent in rows if not parent]
    scale = hermes_scale(connection)
    rows = connection.execute(
        "SELECT id, parent_session_id, source, created_source FROM sessions "
        "WHERE COALESCE(last_activity_at, ended_at, started_at) >= ? AND started_at < ? ORDER BY id",
        (start.timestamp() * scale, stop.timestamp() * scale),
    ).fetchall()
    return [sid for sid, parent, source, created in rows if not parent and not hermes_auto(source, created)]


def list_db(path, client, kind, start, stop, files):
    if not os.path.isfile(path) or os.path.islink(path):
        return False
    # Each top-level session is its own item, so one database cannot fill every candidate slot with its oldest sessions.
    found = []
    add_file(found, client, kind, path, start, stop)
    if not found:
        return True
    connection = connect_db(path)
    try:
        sessions = db_sessions(connection, kind, start, stop)
    except sqlite3.Error:
        files.append(found[0])
        return True
    finally:
        connection.close()
    for sid in sessions:
        files.append(dict(found[0], session=sid))
    return True


def agent_homes(home, name, variable):
    # The default home, sibling profiles such as ~/.codex-work, and the directory the variable names, each once.
    paths = [os.path.join(home, name)]
    try:
        paths += sorted(os.path.join(home, entry) for entry in os.listdir(home) if entry.startswith(name + "-"))
    except OSError:
        pass
    named = os.environ.get(variable, "").strip()
    if named:
        paths.append(os.path.expanduser(named))
    homes = []
    seen = set()
    for path in paths:
        real = os.path.realpath(path)
        if directory_exists(path) and real not in seen:
            seen.add(real)
            homes.append(path)
    return homes


def list_files(home, sources, start, stop, gaps, children):
    files = []
    if "claude-code" in sources:
        found = False
        for root in agent_homes(home, ".claude", "CLAUDE_CONFIG_DIR"):
            found = list_jsonl(os.path.join(root, "projects"), "claude-code", "claude", start, stop, files, children=children) or found
        if not found:
            gaps.add("other_sources_missing")
    if "codex" in sources:
        found = False
        for root in agent_homes(home, ".codex", "CODEX_HOME"):
            for folder in ("sessions", "archived_sessions"):
                found = list_jsonl(os.path.join(root, folder), "codex", "codex", start, stop, files) or found
        if not found:
            gaps.add("other_sources_missing")
    if "cursor" in sources and not list_jsonl(os.path.join(home, ".cursor", "projects"), "cursor", "cursor", start, stop, files, "agent-transcripts"):
        gaps.add("other_sources_missing")
    if "other" in sources:
        found = list_grok(home, start, stop, files)
        found = list_db(os.path.join(home, ".local", "share", "opencode", "opencode.db"), "other", "opencode", start, stop, files) or found
        found = list_db(os.path.join(home, ".hermes", "state.db"), "other", "hermes", start, stop, files) or found
        if not found:
            gaps.add("other_sources_missing")
    if "antigravity" in sources or "chatgpt" in sources:
        gaps.add("other_sources_missing")
    return files


def sample_order(files, home):
    # Rank each file by a hash of its path under home: the order looks random across files,
    # but a repeat scan of the same logs reads the same sessions, and a new log only takes
    # the slots it outranks.
    salt = SAMPLE_SALT
    raw = os.environ.get("COLLECTOR_SAMPLE_SEED", "").strip()
    if raw:
        try:
            salt = SAMPLE_SALT + ":" + str(int(raw))
        except ValueError:
            fail("invalid_sample_seed")

    def rank(item):
        relative = os.path.relpath(item["path"], home)
        if "session" in item:
            relative += "#" + str(item["session"])
        return hashlib.sha256((salt + "\0" + relative).encode("utf-8", "surrogateescape")).hexdigest(), relative

    return sorted(files, key=rank)


def budget_elapsed():
    # A fixed elapsed sequence keeps the budget test independent of the machine clock.
    raw = os.environ.get("COLLECTOR_FAKE_ELAPSED")
    if not raw:
        started = time.perf_counter()
        return lambda: time.perf_counter() - started
    values = []
    for part in raw.split(","):
        text = part.strip()
        if text:
            values.append(float(text))
    state = {"n": 0}

    def elapsed():
        index = state["n"]
        state["n"] += 1
        if not values:
            return 0.0
        return values[min(index, len(values) - 1)]

    return elapsed


def sample_files(order, start, stop, zone, budget):
    elapsed = budget_elapsed()
    samples = []
    days = set()
    gaps = set()
    files_read = 0
    short = False
    seen = set()
    for item in order:
        if len(samples) >= CANDIDATE_CAP:
            break
        if elapsed() >= budget:
            short = True
            break
        result = READERS[item["kind"]](item, start, stop, zone)
        if result["opened"]:
            files_read += 1
        if result["truncated"]:
            short = True
        days.update(result["days"])
        gaps.update(result["gaps"])
        for sample in result["samples"]:
            if sample["key"] in seen:
                continue
            seen.add(sample["key"])
            samples.append(sample)
            if len(samples) >= CANDIDATE_CAP:
                break
    return samples[:CANDIDATE_CAP], files_read, days, gaps, short


def asset_key(match):
    if match.group(2):
        return (match.group(1) + "/" if match.group(1) else "") + match.group(2)
    return match.group(3)


def written_asset(path):
    found = None
    for match in ASSET_RE.finditer(path):
        found = match
    if found is None or found.end() != len(path):
        return None
    return asset_key(found)


def line_moment(line):
    match = STAMP_RE.search(line[-1024:]) or STAMP_RE.search(line[:1024])
    if match is None:
        return None
    return parse_time(match.group(1).decode("ascii", "ignore"))


def opening_prompt(line, facts):
    if b'"isMeta":true' in line:
        return False
    anchor = line.find(b'"message"')
    window = line[max(anchor, 0):max(anchor, 0) + LINE_CAP].decode("utf-8", "ignore")
    match = PROMPT_TEXT_RE.search(window)
    if match is None:
        return False
    text = match.group(1).replace("\\n", "\n")
    if text.startswith("<user_query>"):
        text = text[len("<user_query>"):]
    if INJECT_RE.match(text):
        return False
    source = PROMPT_SOURCE_RE.search(line)
    if TEMPLATE_RE.search(text) or (source and source.group(1) in (b"sdk", b"system")):
        facts["automation"] = True
    return True


def inspect_tool(raw, moment, facts):
    written = set()
    for match in WRITE_RE.finditer(raw):
        key = written_asset(match.group(1))
        if key:
            written.add(key)
    text = ESCAPE_RE.sub(" ", raw)
    for match in PATCH_RE.finditer(text):
        key = written_asset(match.group(1))
        if key:
            written.add(key)
    for match in ASSET_RE.finditer(text):
        key = asset_key(match)
        if key not in written:
            facts["touches"].add(key)
    for key in written:
        if key not in facts["writes"] or moment < facts["writes"][key]:
            facts["writes"][key] = moment
    for name, pattern in GEARS:
        if pattern.search(text):
            facts["gears"].add(name)


def codex_child(path):
    try:
        with open_file(path) as handle:
            head = handle.read(LINE_CAP)
    except OSError:
        return None
    return b'"session_meta"' in head[:256] and CODEX_CHILD_RE.search(head) is not None


def system_facts(item, start, stop):
    kind = item["kind"]
    facts = {"moment": None, "automation": False, "subagent": False, "writes": {}, "touches": set(), "gears": set()}
    if kind == "codex":
        child = codex_child(item["path"])
        if child is None:
            return None
        if child:
            facts["subagent"] = True
            return facts
    blob = capped_bytes(item["path"], item["size"])
    if blob is None:
        return None
    born = item["birth"]
    modified = datetime.fromtimestamp(item["mtime"], timezone.utc)
    fallback = born if born is not None and start <= born < stop and start <= modified < stop else None
    opened = False
    for line in blob.split(b"\n"):
        tool = -1
        for marker in TOOL_MARKERS:
            tool = line.find(marker)
            if tool >= 0:
                break
        user = not opened and USER_MARKERS[kind] in line
        if tool < 0 and not user:
            continue
        moment = line_moment(line) or fallback
        if moment is None or not (start <= moment < stop):
            continue
        if facts["moment"] is None or moment < facts["moment"]:
            facts["moment"] = moment
        if user:
            if b'"isSidechain":true' in line:
                facts["subagent"] = True
            opened = opening_prompt(line, facts)
        if tool >= 0:
            inspect_tool(line[tool:tool + LINE_CAP].decode("utf-8", "ignore"), moment, facts)
    return facts


def scan_system(order, start, stop):
    elapsed = budget_elapsed()
    listed = [item for item in order if item["kind"] in USER_MARKERS]
    sessions = []
    for item in listed:
        if elapsed() >= SYSTEM_BUDGET:
            break
        facts = system_facts(item, start, stop)
        if facts is not None:
            sessions.append(facts)
    return sessions, len(listed)


def system_evidence(sessions, listed, children, zone):
    evidence = {
        "automationSessions": None,
        "subagentSessions": None,
        "automationSpanDays": None,
        "assetWriteSessions": None,
        "assetReuseSessions": None,
        "assetMaintainedAfterAutomation": None,
        "gearKinds": None,
        "filesScanned": len(sessions),
        "filesListed": listed,
    }
    if not sessions:
        return evidence
    owners = [facts for facts in sessions if not facts["subagent"]]
    automated = sorted(facts["moment"] for facts in owners if facts["automation"] and facts["moment"])
    writers = defaultdict(set)
    for number, facts in enumerate(owners):
        for key in facts["writes"]:
            writers[key].add(number)
    evidence["automationSessions"] = sum(1 for facts in owners if facts["automation"])
    evidence["subagentSessions"] = len(sessions) - len(owners) + children
    evidence["assetWriteSessions"] = sum(1 for facts in owners if facts["writes"])
    evidence["assetReuseSessions"] = sum(
        1 for number, facts in enumerate(owners)
        if any(writers[key] - {number} for key in facts["touches"] | set(facts["writes"]) if key in writers)
    )
    evidence["gearKinds"] = len(set().union(*(facts["gears"] for facts in sessions)))
    if automated:
        first = automated[0]
        days = datetime.fromisoformat(local_day(automated[-1], zone)) - datetime.fromisoformat(local_day(first, zone))
        evidence["automationSpanDays"] = days.days
        evidence["assetMaintainedAfterAutomation"] = sum(
            1 for facts in owners for moment in facts["writes"].values() if moment > first
        )
    return evidence


def candidates_from(samples):
    candidates = []
    for number, sample in enumerate(samples, start=1):
        candidates.append({
            "ref": f"C{number:02d}",
            "client": sample["client"],
            "date": sample["day"],
            "turns": [
                {"n": index, "role": role, "kind": kind, "text": text}
                for index, (role, kind, text) in enumerate(sample["turns"], start=1)
            ],
        })
    return candidates


def tokscale_clients(sources):
    names = []
    for source in sources:
        for name in TOKSCALE_CLIENTS[source]:
            if name not in names:
                names.append(name)
    return names


def tokscale_empty(seconds):
    return {
        "input": None,
        "output": None,
        "source": "unavailable",
        "usage": [],
        "unit": "unknown",
        "family": "unknown",
        "client": "unknown",
        "clients": [],
        "gaps": {"no_tokscale"},
        "seconds": seconds,
    }


def tokscale_paths(out_path):
    return out_path + ".tokscale.json", out_path + ".tokscale.pending"


def tokscale_command(mode, home, zone, sources, start, stop):
    if mode == "off":
        return None
    clients = tokscale_clients(sources)
    if not clients:
        return None
    binary = shutil.which("tokscale")
    if binary:
        command = [binary]
    elif mode == "install":
        command = ["npm", "exec", "--yes", "@tokscale/cli@4.18.0", "--"]
    else:
        return None
    since = local_day(start, zone)
    until = local_day(stop - timedelta(milliseconds=1), zone)
    command += [
        "models", "--json", "--no-spinner", "--home", home, "--client", ",".join(clients),
        "--since", since, "--until", until, "--group-by", "client,model",
    ]
    return command


def launch_tokscale(mode, home, zone, sources, start, stop, out_path):
    command = tokscale_command(mode, home, zone, sources, start, stop)
    if command is None:
        return False
    output_path, pending_path = tokscale_paths(out_path)
    flags = os.O_CREAT | os.O_WRONLY | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(output_path, flags, 0o600)
    except OSError:
        return False
    try:
        os.chmod(output_path, 0o600)
        env = os.environ.copy()
        env["TZ"] = getattr(zone, "key", None) or "UTC"
        started = time.time()
        proc = subprocess.Popen(
            command,
            stdout=fd,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            env=env,
            start_new_session=True,
        )
    except OSError:
        return False
    finally:
        os.close(fd)
    write_digest(pending_path, {"pid": proc.pid, "started": started, "sources": list(sources)})
    return True


def ranked_name(totals):
    usage = [{"family": name, "count": count} for name, count in sorted(totals.items(), key=lambda item: (-item[1], item[0])) if count > 0]
    if not usage:
        return [], "unknown", "unknown"
    unit = "reported_tokens"
    if len(usage) == 1 or usage[0]["count"] > usage[1]["count"]:
        return usage[:8], usage[0]["family"], unit
    return usage[:8], "unknown", unit


def tokens_from_entries(entries, sources):
    model_totals = defaultdict(int)
    client_totals = defaultdict(int)
    input_tokens = 0
    output_tokens = 0
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        incoming = entry.get("input") if isinstance(entry.get("input"), int) and not isinstance(entry.get("input"), bool) else 0
        outgoing = entry.get("output") if isinstance(entry.get("output"), int) and not isinstance(entry.get("output"), bool) else 0
        input_tokens += incoming
        output_tokens += outgoing
        name = family(entry.get("model"))
        if name != "unknown":
            model_totals[name] += incoming + outgoing
        client = TOKSCALE_CLIENT.get(entry.get("client"))
        if client in sources:
            client_totals[client] += incoming + outgoing
    usage, top, unit = ranked_name(model_totals)
    client_usage, top_client, _unit = ranked_name(client_totals)
    return {
        "input": input_tokens,
        "output": output_tokens,
        "source": "tokscale",
        "usage": usage,
        "unit": unit if usage else "unknown",
        "family": top if usage else "unknown",
        "client": top_client if client_usage else "unknown",
        "clients": [item["family"] for item in client_usage],
        "gaps": set(),
        "seconds": 0,
    }


def tokens_from_file(path, sources):
    try:
        with open_file(path) as handle:
            payload = json.loads(handle.read().decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    entries = payload.get("entries")
    if not isinstance(entries, list):
        return None
    return tokens_from_entries(entries, sources)


def read_pending(path):
    if os.path.islink(path) or not os.path.isfile(path):
        return None
    try:
        with open_file(path) as handle:
            payload = json.loads(handle.read().decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    pid = payload.get("pid")
    started = payload.get("started")
    sources = payload.get("sources")
    if isinstance(pid, bool) or not isinstance(pid, int) or pid <= 0:
        return None
    if isinstance(started, bool) or not isinstance(started, (int, float)):
        return None
    if not isinstance(sources, list) or any(name not in CLIENTS for name in sources):
        return None
    payload["abandoned"] = payload.get("abandoned") is True
    return payload


def signal_alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def pid_alive(pid):
    try:
        text = subprocess.check_output(
            ["ps", "-p", str(pid), "-o", "stat="],
            text=True,
            stderr=subprocess.DEVNULL,
            env={**os.environ, "LC_ALL": "C"},
        ).strip()
    except subprocess.CalledProcessError:
        return False
    except OSError:
        return signal_alive(pid)
    return bool(text) and not text.split()[0].startswith("Z")


def tokscale_identity(pid, started):
    if not pid_alive(pid):
        return "dead"
    try:
        text = subprocess.check_output(
            ["ps", "-p", str(pid), "-o", "lstart="],
            text=True,
            stderr=subprocess.DEVNULL,
            env={**os.environ, "LC_ALL": "C"},
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    parts = text.split()
    if len(parts) != 5:
        return "unknown"
    try:
        stamp = datetime.strptime(" ".join(parts), "%a %b %d %H:%M:%S %Y").timestamp()
    except ValueError:
        return "unknown"
    if abs(stamp - float(started)) <= 2:
        return "ours"
    return "other"


def kill_group(pid):
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            os.kill(pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            return
    for _ in range(50):
        if not pid_alive(pid):
            return
        time.sleep(0.02)


def await_tokscale(out_path, wait_seconds):
    output_path, pending_path = tokscale_paths(out_path)
    record = read_pending(pending_path)
    started_wait = time.perf_counter()
    if record is None or record["abandoned"]:
        return tokscale_empty(0), time.perf_counter() - started_wait
    sources = record["sources"]
    pid = record["pid"]
    begun = record["started"]
    deadline = time.perf_counter() + wait_seconds
    while True:
        state = tokscale_identity(pid, begun)
        if state in {"dead", "other"}:
            waited = time.perf_counter() - started_wait
            parsed = tokens_from_file(output_path, sources)
            return (parsed if parsed is not None else tokscale_empty(waited)), waited
        remaining = deadline - time.perf_counter()
        if remaining <= 0:
            record["abandoned"] = True
            write_digest(pending_path, record)
            if state == "ours":
                kill_group(pid)
            waited = time.perf_counter() - started_wait
            return tokscale_empty(waited), waited
        time.sleep(min(0.05, remaining))


def align_token_rules(metrics, sources):
    if metrics["tokenSource"] == "unavailable":
        metrics["inputTokens"] = None
        metrics["outputTokens"] = None
    if metrics["modelUsageUnit"] == "unknown":
        metrics["modelUsage"] = []
    usage = []
    for item in metrics["modelUsage"]:
        if not isinstance(item, dict):
            continue
        count = item.get("count")
        family_name = item.get("family")
        if isinstance(family_name, str) and isinstance(count, int) and not isinstance(count, bool):
            usage.append({"family": family_name, "count": count})
    metrics["modelUsage"] = usage
    ranked = sorted(usage, key=lambda item: -item["count"])
    if ranked and ranked[0]["count"] > 0 and (len(ranked) == 1 or ranked[0]["count"] > ranked[1]["count"]):
        metrics["mostUsedModelFamily"] = ranked[0]["family"]
    else:
        metrics["mostUsedModelFamily"] = "unknown"
    if metrics["mostUsedClient"] != "unknown" and metrics["mostUsedClient"] not in sources:
        metrics["mostUsedClient"] = "unknown"


def apply_tokens(summary, tokens):
    metrics = summary.get("metrics")
    coverage = summary.get("coverage")
    if not isinstance(metrics, dict) or not isinstance(coverage, dict):
        fail("summary_unreadable")
    seen = set()
    current = coverage.get("sources")
    if isinstance(current, list):
        for name in current:
            if name in CLIENTS:
                seen.add(name)
    for name in tokens["clients"]:
        if name in CLIENTS:
            seen.add(name)
    coverage["sources"] = [name for name in CLIENTS if name in seen]
    gaps = set()
    current_gaps = coverage.get("gaps")
    if isinstance(current_gaps, list):
        for gap in current_gaps:
            if gap in GAPS:
                gaps.add(gap)
    if tokens["source"] == "tokscale":
        gaps.discard("no_tokscale")
    else:
        gaps.add("no_tokscale")
    coverage["gaps"] = [gap for gap in GAPS if gap in gaps]
    metrics["inputTokens"] = tokens["input"]
    metrics["outputTokens"] = tokens["output"]
    metrics["tokenSource"] = tokens["source"]
    metrics["modelUsage"] = tokens["usage"]
    metrics["modelUsageUnit"] = tokens["unit"]
    metrics["mostUsedModelFamily"] = tokens["family"]
    if tokens["client"] != "unknown" or metrics.get("mostUsedClient") not in CLIENTS:
        metrics["mostUsedClient"] = tokens["client"]
    align_token_rules(metrics, coverage["sources"])


def build_digest(home, sources, start, stop, zone, window_from, window_to, zone_name, budget):
    gaps = {"web_history_unavailable", "no_artifact_inspection"}
    children = []
    files = list_files(home, sources, start, stop, gaps, children)
    order = sample_order(files, home)
    samples, files_read, days, sample_gaps, short = sample_files(order, start, stop, zone, budget)
    sessions, listed = scan_system(order, start, stop)
    gaps.update(sample_gaps)
    tokens = tokscale_empty(0)
    gaps.update(tokens["gaps"])
    if not samples:
        gaps.add("insufficient_records")
        scope = "insufficient"
    elif gaps or short:
        scope = "partial"
    else:
        scope = "adequate"
    seen = {sample["client"] for sample in samples}
    seen.update(tokens["clients"])
    active = [client for client in CLIENTS if client in sources and client in seen]
    # Without Tokscale, the client with the most session files in the window stands in as the most used.
    session_files = defaultdict(int)
    for item in files:
        if item["client"] in active and item["kind"] in USER_MARKERS:
            session_files[item["client"]] += 1
    _usage, busiest_client, _unit = ranked_name(session_files)
    ordered_days = sorted(days)
    if ordered_days:
        period = {"from": ordered_days[0], "to": ordered_days[-1]}
    else:
        period = {"from": local_day(start, zone), "to": local_day(start, zone)}
    metrics = {
        "humanSessions": None,
        "automatedSessions": None,
        "subagentSessions": None,
        "userMessages": None,
        "inputTokens": tokens["input"],
        "outputTokens": tokens["output"],
        "tokenSource": tokens["source"],
        "modelUsage": tokens["usage"],
        "modelUsageUnit": tokens["unit"],
        "mostUsedModelFamily": tokens["family"],
        "mostUsedClient": tokens["client"] if tokens["client"] != "unknown" else busiest_client,
    }
    digest = {
        "window": {"from": window_from, "to": window_to, "timeZone": zone_name},
        "observedPeriod": period,
        "coverage": {
            "scope": scope,
            "sources": active,
            "gaps": [gap for gap in GAPS if gap in gaps],
            "sampledSessions": files_read,
        },
        "metrics": metrics,
        "systemEvidence": system_evidence(sessions, listed, len(children), zone),
        "candidates": candidates_from(samples),
    }
    counts = {client: 0 for client in sources}
    for sample in samples:
        if sample["client"] in counts:
            counts[sample["client"]] += 1
    return digest, counts


def write_digest(path, digest):
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(digest, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    os.chmod(path, 0o600)


def command_scan(args):
    start = parse_time(args.time_from)
    stop = parse_time(args.time_to)
    if start is None or stop is None or start >= stop:
        fail("invalid_window")
    if args.budget_seconds < 0 or args.budget_seconds != args.budget_seconds:
        fail("invalid_budget")
    try:
        zone = ZoneInfo(args.tz)
    except Exception:
        fail("invalid_timezone")
    sources = []
    for name in args.sources.split(","):
        if name not in CLIENTS or name in sources:
            fail("invalid_sources")
        sources.append(name)
    if not sources:
        fail("invalid_sources")
    home = os.environ.get("HOME")
    if not home:
        fail("missing_home")
    started = time.perf_counter()
    digest, counts = build_digest(
        home, sources, start, stop, zone, args.time_from, args.time_to, args.tz, args.budget_seconds,
    )
    write_digest(args.out, digest)
    launched = launch_tokscale(args.tokscale, home, zone, sources, start, stop, args.out)
    elapsed = time.perf_counter() - started
    client_counts = " ".join(f"{client}={counts[client]}" for client in sources)
    print(f"candidates={len(digest['candidates'])}")
    print(f"files_read={digest['coverage']['sampledSessions']}")
    print(f"candidates_by_client {client_counts}")
    system = digest["systemEvidence"]
    print(f"system_files={system['filesScanned']}/{system['filesListed']}")
    print(f"digest_bytes={os.path.getsize(args.out)}")
    print(f"seconds={elapsed:.2f}")
    print(f"tokscale={'started' if launched else 'skipped'}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_token():
    token = sys.stdin.readline().strip()
    if not TOKEN_RE.fullmatch(token):
        fail("token_rejected")
    return token


def check_origin(origin):
    parsed = urllib.parse.urlsplit(origin)
    local = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        fail("invalid_origin")
    if not (local or parsed.scheme == "https"):
        fail("invalid_origin")
    return origin.rstrip("/")


def idempotency_key(summary_path):
    path = summary_path + ".idempotency"
    if os.path.exists(path):
        if os.path.islink(path):
            fail("idempotency_unreadable")
        try:
            with open_file(path) as handle:
                key = handle.read().decode("ascii").strip()
        except (OSError, UnicodeError):
            fail("idempotency_unreadable")
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,80}", key):
            fail("idempotency_unreadable")
        return key
    key = uuid.uuid4().hex
    with open(path, "w", encoding="ascii") as handle:
        handle.write(key + "\n")
    os.chmod(path, 0o600)
    return key


def post_json(origin, path, body, token, idempotency=None):
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + token, "User-Agent": "agent-mbti-collector"}
    if idempotency:
        headers["Idempotency-Key"] = idempotency
    opener = urllib.request.build_opener(NoRedirect)
    delays = (0, 1, 2)
    for attempt, delay in enumerate(delays):
        if delay:
            time.sleep(delay)
        request = urllib.request.Request(origin + path, data=body, method="POST", headers=headers)
        try:
            with opener.open(request, timeout=8) as response:
                response.read(64)
                code = response.status
        except urllib.error.HTTPError as error:
            error.read(64)
            code = error.code
        except Exception:
            code = None
        if code in {409, 404, 410}:
            print(f"http {code}")
            return
        if code is not None and code != 503:
            print(f"http {code}")
            return
        if attempt == 2:
            print("network_error" if code is None else "http 503")
            return


def require_regular(path, message):
    if os.path.islink(path):
        fail(message)
    try:
        info = os.stat(path)
    except OSError:
        fail(message)
    if not stat.S_ISREG(info.st_mode):
        fail(message)


def write_private(path, body):
    temporary = path + ".tmp"
    fd = os.open(temporary, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    try:
        os.write(fd, body)
    finally:
        os.close(fd)
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    os.chmod(path, 0o600)


def command_submit(args):
    origin = check_origin(args.origin)
    if not SESSION_RE.fullmatch(args.session):
        fail("invalid_session")
    if args.wait_seconds < 0 or args.wait_seconds != args.wait_seconds:
        fail("invalid_wait")
    if os.path.islink(args.summary):
        fail("summary_unreadable")
    try:
        with open_file(args.summary) as handle:
            body = handle.read()
        summary = json.loads(body.decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        fail("summary_unreadable")
    if args.digest is not None:
        if not isinstance(summary, dict):
            fail("summary_unreadable")
        require_regular(args.digest, "digest_unreadable")
        tokens, waited = await_tokscale(args.digest, args.wait_seconds)
        apply_tokens(summary, tokens)
        body = json.dumps(summary, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
        write_private(args.summary, body)
        print(f"tokscale_wait_seconds={waited:.2f}")
        print(f"tokens_filled={'true' if tokens['source'] == 'tokscale' else 'false'}")
    if len(body) > 24 * 1024:
        fail("summary_too_large")
    token = read_token()
    post_json(origin, "/api/collect/" + args.session, body, token, idempotency_key(args.summary))


def command_status(args):
    origin = check_origin(args.origin)
    if not SESSION_RE.fullmatch(args.session):
        fail("invalid_session")
    if args.sequence < 1 or args.sequence > 1000:
        fail("invalid_progress")
    phases = {"analyzing", "validating", "awaiting_host_approval", "submitting", "paused"}
    if args.phase not in phases:
        fail("invalid_progress")
    kind = args.approval_kind
    if args.phase == "awaiting_host_approval":
        if kind not in {"local_read", "network", "command"}:
            fail("approval_kind_required")
    elif kind is not None:
        fail("invalid_progress")
    token = read_token()
    body = json.dumps({"sequence": args.sequence, "phase": args.phase, "approvalKind": kind}, separators=(",", ":")).encode()
    post_json(origin, "/api/collect/" + args.session + "/status", body, token)


def parser():
    tool = argparse.ArgumentParser(prog="collect.py")
    commands = tool.add_subparsers(dest="command", required=True)
    scan = commands.add_parser("scan")
    scan.add_argument("--from", dest="time_from", required=True)
    scan.add_argument("--to", dest="time_to", required=True)
    scan.add_argument("--tz", required=True)
    scan.add_argument("--sources", required=True)
    scan.add_argument("--tokscale", choices=("off", "existing", "install"), required=True)
    scan.add_argument("--budget-seconds", type=float, default=20)
    scan.add_argument("--out", required=True)
    scan.set_defaults(func=command_scan)
    submit = commands.add_parser("submit")
    submit.add_argument("--origin", required=True)
    submit.add_argument("--session", required=True)
    submit.add_argument("--summary", required=True)
    submit.add_argument("--digest", default=None)
    submit.add_argument("--wait-seconds", dest="wait_seconds", type=float, default=20)
    submit.set_defaults(func=command_submit)
    status = commands.add_parser("status")
    status.add_argument("--origin", required=True)
    status.add_argument("--session", required=True)
    status.add_argument("--sequence", type=int, required=True)
    status.add_argument("--phase", required=True)
    status.add_argument("--approval-kind", dest="approval_kind", default=None)
    status.set_defaults(func=command_status)
    return tool


def main():
    args = parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
