#!/usr/bin/env python3
"""Read known local agent logs into a small digest, then submit that summary."""

import argparse
import json
import os
import re
import shutil
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
from datetime import datetime, timezone
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
AUTO_WORDS = ("cron", "schedule", "heartbeat", "automation", "system")
TOOL_TYPES = {"tool_use", "tool_call", "function_call", "custom_tool_call"}
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
SECRET_RE = re.compile(r"sk-[A-Za-z0-9_\-]{8,}")
BEARER_RE = re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{8,}")
URL_RE = re.compile(r"https?://\S+")
PATH_RE = re.compile(r"/Users/\S+")
SPACE_RE = re.compile(r"\s+")
TOKEN_RE = re.compile(r"^[0-9a-f]{64}$")
SESSION_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
ISO_SID_RE = re.compile(r"(20\d{2}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})")
COMPACT_SID_RE = re.compile(r"(20\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})")


class Session:
    def __init__(self, client, bucket, day, user_n, saw_agent, key, kind):
        self.client = client
        self.bucket = bucket
        self.day = day
        self.user_n = user_n
        self.saw_agent = saw_agent
        self.key = key
        self.kind = kind


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


def iso_week(day):
    year, week, _ = datetime.fromisoformat(day).isocalendar()
    return f"{year}-W{week:02d}"


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


def blocks(content):
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


def each_jsonl(root):
    if not os.path.isdir(root) or os.path.islink(root):
        return
    for directory, names, files in os.walk(root, followlinks=False):
        names[:] = [name for name in names if not os.path.islink(os.path.join(directory, name))]
        for name in files:
            path = os.path.join(directory, name)
            if not name.endswith(".jsonl") or os.path.islink(path):
                continue
            try:
                info = os.lstat(path)
            except OSError:
                continue
            if not stat.S_ISREG(info.st_mode):
                continue
            yield path, info.st_mtime


def iter_objects(path):
    try:
        handle = open_file(path)
    except OSError:
        return
    with handle:
        for raw in handle:
            try:
                yield json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue


def fresh(mtime, start):
    return mtime >= start


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


def scan_claude(home, start, stop, zone, scan):
    root = os.path.join(home, ".claude", "projects")
    if not os.path.isdir(root) or os.path.islink(root):
        scan["gaps"].add("other_sources_missing")
        return
    for path, mtime in each_jsonl(root):
        if not fresh(mtime, start.timestamp()):
            continue
        human = auto = saw_agent = saw = False
        user_n = 0
        day = None
        subagent = "subagents" in path.split(os.sep)
        for obj in iter_objects(path) or ():
            if not isinstance(obj, dict):
                continue
            moment = parse_time(obj.get("timestamp")) if isinstance(obj.get("timestamp"), str) else None
            kind = obj.get("type")
            if kind in {"user", "assistant"} and moment is None:
                scan["gaps"].add("unattributed_runs")
                continue
            if moment is None or not (start <= moment < stop):
                continue
            scan["days"].add(local_day(moment, zone))
            saw = True
            if kind == "user":
                role = claude_user_class(obj)
                if role == "human" and not subagent:
                    user_n += 1
                    human = True
                    current = local_day(moment, zone)
                    day = current if day is None else min(day, current)
                elif role == "auto":
                    auto = True
            elif kind == "assistant":
                message = obj.get("message") if isinstance(obj.get("message"), dict) else {}
                if blocks(message.get("content")):
                    saw_agent = True
        if not saw:
            continue
        if subagent:
            scan["sessions"].append(Session("claude-code", "subagent", day, 0, False, path, "claude"))
        elif human:
            scan["sessions"].append(Session("claude-code", "human", day, user_n, saw_agent, path, "claude"))
        elif auto:
            scan["sessions"].append(Session("claude-code", "automated", day, 0, False, path, "claude"))


def codex_subagent(payload):
    source = payload.get("source")
    return bool(payload.get("parent_thread_id")) or (isinstance(source, dict) and "subagent" in source)


def scan_codex(home, start, stop, zone, scan):
    roots = [os.path.join(home, ".codex", "sessions"), os.path.join(home, ".codex", "archived_sessions")]
    if not any(os.path.isdir(root) and not os.path.islink(root) for root in roots):
        scan["gaps"].add("other_sources_missing")
        return
    for root in roots:
        for path, mtime in each_jsonl(root):
            if not fresh(mtime, start.timestamp()):
                continue
            subagent = human = saw_agent = saw = False
            user_n = 0
            day = None
            for obj in iter_objects(path) or ():
                if not isinstance(obj, dict):
                    continue
                payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else {}
                if obj.get("type") == "session_meta" and codex_subagent(payload):
                    subagent = True
                moment = parse_time(obj.get("timestamp")) if isinstance(obj.get("timestamp"), str) else None
                ptype = payload.get("type")
                message_like = ptype in {"message", "agent_message"} or ptype in TOOL_TYPES
                if message_like and moment is None:
                    scan["gaps"].add("unattributed_runs")
                    continue
                if moment is None or not (start <= moment < stop):
                    continue
                if not message_like:
                    continue
                scan["days"].add(local_day(moment, zone))
                saw = True
                role = payload.get("role")
                if ptype == "message" and role == "user" and not subagent:
                    user_n += 1
                    human = True
                    current = local_day(moment, zone)
                    day = current if day is None else min(day, current)
                elif blocks(payload.get("content")) and (ptype == "agent_message" or role == "assistant" or ptype in TOOL_TYPES):
                    saw_agent = True
            if not saw:
                continue
            if subagent:
                scan["sessions"].append(Session("codex", "subagent", day, 0, False, path, "codex"))
            elif human:
                scan["sessions"].append(Session("codex", "human", day, user_n, saw_agent, path, "codex"))


def scan_cursor(home, start, stop, zone, scan):
    root = os.path.join(home, ".cursor", "projects")
    if not os.path.isdir(root) or os.path.islink(root):
        scan["gaps"].add("other_sources_missing")
        return
    for path, mtime in each_jsonl(root):
        if "agent-transcripts" not in path.split(os.sep) or not fresh(mtime, start.timestamp()):
            continue
        subagent = "subagents" in path.split(os.sep)
        human = saw_agent = saw = timed = False
        user_n = 0
        day = None
        for obj in iter_objects(path) or ():
            if not isinstance(obj, dict) or obj.get("role") not in {"user", "assistant"}:
                continue
            raw = obj.get("timestamp") or obj.get("createdAt")
            moment = parse_time(raw) if isinstance(raw, str) else None
            if moment is None:
                scan["gaps"].add("unattributed_runs")
                continue
            timed = True
            if not (start <= moment < stop):
                continue
            message = obj.get("message") if isinstance(obj.get("message"), dict) else {}
            produced = blocks(message.get("content"))
            if not produced:
                continue
            scan["days"].add(local_day(moment, zone))
            saw = True
            if obj.get("role") == "user" and not subagent:
                user_n += 1
                human = True
                current = local_day(moment, zone)
                day = current if day is None else min(day, current)
            elif obj.get("role") == "assistant":
                saw_agent = True
        if not timed:
            scan["gaps"].add("unattributed_runs")
        if not saw:
            continue
        if subagent:
            scan["sessions"].append(Session("cursor", "subagent", day, 0, False, path, "cursor"))
        elif human:
            scan["sessions"].append(Session("cursor", "human", day, user_n, saw_agent, path, "cursor"))


def grok_bounds(turns):
    moments = []
    for turn in turns:
        if isinstance(turn, dict):
            moment = parse_time(turn.get("endedAt")) if isinstance(turn.get("endedAt"), str) else None
            if moment is not None:
                moments.append(moment)
    return moments


def scan_grok(home, start, stop, zone, scan):
    root = os.path.join(home, ".grok", "sessions")
    if not os.path.isdir(root) or os.path.islink(root):
        return False
    found = False
    for directory, names, files in os.walk(root, followlinks=False):
        names[:] = [name for name in names if not os.path.islink(os.path.join(directory, name))]
        if "usage.json" not in files:
            continue
        usage_path = os.path.join(directory, "usage.json")
        if os.path.islink(usage_path):
            continue
        found = True
        try:
            info = os.lstat(usage_path)
            if not stat.S_ISREG(info.st_mode) or not fresh(info.st_mtime, start.timestamp()):
                continue
            with open_file(usage_path) as handle:
                usage = json.load(handle)
        except (OSError, json.JSONDecodeError, UnicodeDecodeError):
            scan["gaps"].add("unattributed_runs")
            continue
        moments = grok_bounds(usage.get("turns") if isinstance(usage, dict) else None)
        if not moments:
            scan["gaps"].add("unattributed_runs")
            continue
        inside = [moment for moment in moments if start <= moment < stop]
        if not inside:
            continue
        for moment in inside:
            scan["days"].add(local_day(moment, zone))
        # Chat lines have no timestamps, so only a fully contained session is usable.
        if min(moments) < start or max(moments) >= stop:
            scan["gaps"].add("partial_window")
            continue
        chat = os.path.join(directory, "chat_history.jsonl")
        user_n = 0
        saw_agent = False
        if os.path.isfile(chat) and not os.path.islink(chat):
            for obj in iter_objects(chat) or ():
                if not isinstance(obj, dict):
                    continue
                if obj.get("type") == "user" and redact(obj.get("content") if isinstance(obj.get("content"), str) else ""):
                    user_n += 1
                elif obj.get("type") == "assistant" and (redact(obj.get("content") if isinstance(obj.get("content"), str) else "") or obj.get("tool_calls")):
                    saw_agent = True
        if user_n:
            scan["sessions"].append(Session("other", "human", local_day(min(moments), zone), user_n, saw_agent, directory, "grok"))
    return found


def connect_db(path):
    if not os.path.isfile(path) or os.path.islink(path):
        return None
    quoted = urllib.parse.quote(path, safe="/")
    return sqlite3.connect(f"file:{quoted}?mode=ro", uri=True)


def scan_opencode(home, start, stop, zone, scan):
    # OpenCode stores time_created as unix milliseconds.
    path = os.path.join(home, ".local", "share", "opencode", "opencode.db")
    connection = connect_db(path)
    if connection is None:
        return False
    start_ms = int(start.timestamp() * 1000)
    stop_ms = int(stop.timestamp() * 1000)
    try:
        rows = connection.execute(
            "SELECT id, parent_id, time_created, time_updated FROM session WHERE time_updated >= ? AND time_created < ?",
            (start_ms, stop_ms),
        ).fetchall()
        parents = {}
        for sid, parent, created, updated in rows:
            if parent:
                scan["sessions"].append(Session("other", "subagent", None, 0, False, "opencode:" + str(sid), "opencode"))
                if created is not None:
                    scan["days"].add(local_day(datetime.fromtimestamp(created / 1000, timezone.utc), zone))
            else:
                parents[sid] = {"users": 0, "agent": False, "day": None}
        messages = connection.execute(
            "SELECT id, session_id, time_created, data FROM message WHERE time_created >= ? AND time_created < ?",
            (start_ms, stop_ms),
        )
        for _mid, sid, created, data in messages:
            info = parents.get(sid)
            if info is None or created is None:
                continue
            try:
                payload = json.loads(data) if isinstance(data, str) else {}
            except json.JSONDecodeError:
                payload = {}
            moment = datetime.fromtimestamp(created / 1000, timezone.utc)
            scan["days"].add(local_day(moment, zone))
            role = payload.get("role") if isinstance(payload, dict) else None
            if role == "user":
                info["users"] += 1
                current = local_day(moment, zone)
                info["day"] = current if info["day"] is None else min(info["day"], current)
            elif role == "assistant":
                info["agent"] = True
        for sid, info in parents.items():
            if info["users"]:
                scan["sessions"].append(Session("other", "human", info["day"], info["users"], info["agent"], "opencode:" + str(sid), "opencode"))
    except sqlite3.Error:
        scan["gaps"].add("unattributed_runs")
    finally:
        connection.close()
    return True


def hermes_scale(connection):
    # Hermes timestamps are seconds or milliseconds. max(started_at) picks the scale.
    maximum = connection.execute("SELECT max(started_at) FROM sessions").fetchone()[0] or 0
    return 1000.0 if maximum > 1e11 else 1.0


def hermes_auto(source, created):
    text = f"{source or ''} {created or ''}".lower()
    return any(word in text for word in AUTO_WORDS)


def scan_hermes(home, start, stop, zone, scan):
    path = os.path.join(home, ".hermes", "state.db")
    connection = connect_db(path)
    if connection is None:
        return False
    try:
        scale = hermes_scale(connection)
        start_n = start.timestamp() * scale
        stop_n = stop.timestamp() * scale
        rows = connection.execute(
            "SELECT id, parent_session_id, started_at, ended_at, last_activity_at, source, created_source "
            "FROM sessions WHERE COALESCE(last_activity_at, ended_at, started_at) >= ? AND started_at < ?",
            (start_n, stop_n),
        ).fetchall()
        parents = {}
        for sid, parent, started, _ended, _last, source, created in rows:
            if parent:
                scan["sessions"].append(Session("other", "subagent", None, 0, False, "hermes:" + str(sid), "hermes"))
            elif hermes_auto(source, created):
                scan["sessions"].append(Session("other", "automated", None, 0, False, "hermes:" + str(sid), "hermes"))
            else:
                parents[sid] = {"users": 0, "agent": False, "day": None}
            if started is not None and start_n <= started < stop_n:
                scan["days"].add(local_day(datetime.fromtimestamp(started / scale, timezone.utc), zone))
        messages = connection.execute(
            "SELECT session_id, role, timestamp FROM messages WHERE timestamp >= ? AND timestamp < ?",
            (start_n, stop_n),
        )
        for sid, role, stamp in messages:
            info = parents.get(sid)
            if info is None or stamp is None:
                continue
            moment = datetime.fromtimestamp(stamp / scale, timezone.utc)
            scan["days"].add(local_day(moment, zone))
            if role == "user":
                info["users"] += 1
                current = local_day(moment, zone)
                info["day"] = current if info["day"] is None else min(info["day"], current)
            elif role in {"assistant", "tool"}:
                info["agent"] = True
        for sid, info in parents.items():
            if info["users"]:
                scan["sessions"].append(Session("other", "human", info["day"], info["users"], info["agent"], "hermes:" + str(sid), "hermes"))
    except sqlite3.Error:
        scan["gaps"].add("unattributed_runs")
    finally:
        connection.close()
    return True


def scan_other(home, start, stop, zone, scan):
    found = scan_grok(home, start, stop, zone, scan)
    found = scan_opencode(home, start, stop, zone, scan) or found
    found = scan_hermes(home, start, stop, zone, scan) or found
    if not found:
        scan["gaps"].add("other_sources_missing")


def turns_from_jsonl(path, start, stop, accept):
    turns = []
    for obj in iter_objects(path) or ():
        if not isinstance(obj, dict):
            continue
        produced = accept(obj, start, stop)
        if produced:
            turns.extend(produced)
        if len(turns) >= 80:
            break
    return turns


def claude_turns(path, start, stop):
    def accept(obj, window_start, window_stop):
        moment = parse_time(obj.get("timestamp")) if isinstance(obj.get("timestamp"), str) else None
        if moment is None or not (window_start <= moment < window_stop) or "subagents" in path.split(os.sep):
            return []
        if obj.get("type") == "user" and claude_user_class(obj) == "human":
            message = obj.get("message") if isinstance(obj.get("message"), dict) else {}
            return [("user", kind, text) for kind, text in blocks(message.get("content"))]
        if obj.get("type") == "assistant":
            message = obj.get("message") if isinstance(obj.get("message"), dict) else {}
            return [("agent", kind, text) for kind, text in blocks(message.get("content"))]
        return []

    return turns_from_jsonl(path, start, stop, accept)


def codex_turns(path, start, stop):
    def accept(obj, window_start, window_stop):
        payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else {}
        moment = parse_time(obj.get("timestamp")) if isinstance(obj.get("timestamp"), str) else None
        if moment is None or not (window_start <= moment < window_stop):
            return []
        role = payload.get("role")
        ptype = payload.get("type")
        if ptype == "message" and role == "user":
            return [("user", kind, text) for kind, text in blocks(payload.get("content"))]
        if ptype == "agent_message" or (ptype == "message" and role == "assistant") or ptype in TOOL_TYPES:
            return [("agent", kind, text) for kind, text in blocks(payload.get("content"))]
        return []

    return turns_from_jsonl(path, start, stop, accept)


def cursor_turns(path, start, stop):
    def accept(obj, window_start, window_stop):
        raw = obj.get("timestamp") or obj.get("createdAt")
        moment = parse_time(raw) if isinstance(raw, str) else None
        if moment is None or not (window_start <= moment < window_stop):
            return []
        message = obj.get("message") if isinstance(obj.get("message"), dict) else {}
        role = "user" if obj.get("role") == "user" else "agent" if obj.get("role") == "assistant" else None
        if role is None:
            return []
        return [(role, kind, text) for kind, text in blocks(message.get("content"))]

    return turns_from_jsonl(path, start, stop, accept)


def grok_turns(directory, start, stop):
    usage_path = os.path.join(directory, "usage.json")
    try:
        with open_file(usage_path) as handle:
            usage = json.load(handle)
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return []
    moments = grok_bounds(usage.get("turns") if isinstance(usage, dict) else None)
    if not moments or min(moments) < start or max(moments) >= stop:
        return []
    turns = []
    for obj in iter_objects(os.path.join(directory, "chat_history.jsonl")) or ():
        if not isinstance(obj, dict):
            continue
        if obj.get("type") == "user":
            text = redact(obj.get("content") if isinstance(obj.get("content"), str) else "")
            if text:
                turns.append(("user", "message", text))
        elif obj.get("type") == "assistant":
            text = redact(obj.get("content") if isinstance(obj.get("content"), str) else "")
            if text:
                turns.append(("agent", "message", text))
            if obj.get("tool_calls"):
                turns.append(("agent", "tool", "tool"))
        if len(turns) >= 80:
            break
    return turns


def opencode_turns(home, key, start, stop):
    sid = key.split(":", 1)[1]
    connection = connect_db(os.path.join(home, ".local", "share", "opencode", "opencode.db"))
    if connection is None:
        return []
    start_ms = int(start.timestamp() * 1000)
    stop_ms = int(stop.timestamp() * 1000)
    turns = []
    try:
        rows = connection.execute(
            "SELECT id, data FROM message WHERE session_id = ? AND time_created >= ? AND time_created < ? ORDER BY time_created ASC",
            (sid, start_ms, stop_ms),
        ).fetchall()
        for mid, data in rows:
            try:
                payload = json.loads(data) if isinstance(data, str) else {}
            except json.JSONDecodeError:
                continue
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
            for kind, text in blocks(content):
                turns.append((role, kind, text))
            if len(turns) >= 80:
                break
    except sqlite3.Error:
        return []
    finally:
        connection.close()
    return turns


def hermes_turns(home, key, start, stop):
    sid = key.split(":", 1)[1]
    connection = connect_db(os.path.join(home, ".hermes", "state.db"))
    if connection is None:
        return []
    turns = []
    try:
        scale = hermes_scale(connection)
        start_n = start.timestamp() * scale
        stop_n = stop.timestamp() * scale
        rows = connection.execute(
            "SELECT role, content, tool_name FROM messages WHERE session_id = ? AND timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC",
            (sid, start_n, stop_n),
        )
        for role_name, content, tool_name in rows:
            if role_name == "user":
                text = redact(content if isinstance(content, str) else "")
                if text:
                    turns.append(("user", "message", text))
            elif role_name == "assistant":
                text = redact(content if isinstance(content, str) else "")
                if text:
                    turns.append(("agent", "message", text))
            elif role_name == "tool":
                label = redact(tool_name if isinstance(tool_name, str) and tool_name else "tool")
                if label:
                    turns.append(("agent", "tool", label))
            if len(turns) >= 80:
                break
    except sqlite3.Error:
        return []
    finally:
        connection.close()
    return turns


def load_turns(home, session, start, stop):
    if session.kind == "claude":
        return claude_turns(session.key, start, stop)
    if session.kind == "codex":
        return codex_turns(session.key, start, stop)
    if session.kind == "cursor":
        return cursor_turns(session.key, start, stop)
    if session.kind == "grok":
        return grok_turns(session.key, start, stop)
    if session.kind == "opencode":
        return opencode_turns(home, session.key, start, stop)
    if session.kind == "hermes":
        return hermes_turns(home, session.key, start, stop)
    return []


def choose_turns(turns):
    limited = turns[:80]
    for index in range(len(limited)):
        chunk = limited[index:index + 12]
        roles = {turn[0] for turn in chunk}
        if "user" in roles and "agent" in roles:
            return chunk
    return []


def sample_candidates(home, sessions, start, stop):
    grouped = defaultdict(list)
    for session in sessions:
        if session.bucket != "human" or session.user_n < 2 or not session.saw_agent or not session.day:
            continue
        grouped[(session.client, iso_week(session.day))].append(session)
    for bucket in grouped.values():
        bucket.sort(key=lambda session: (session.day, session.key))
    keys = sorted(grouped)
    cursors = {key: 0 for key in keys}
    picked = []
    while len(picked) < 24:
        moved = False
        for key in keys:
            index = cursors[key]
            if index >= len(grouped[key]):
                continue
            cursors[key] = index + 1
            session = grouped[key][index]
            turns = choose_turns(load_turns(home, session, start, stop))
            if turns:
                picked.append((session, turns))
            moved = True
            if len(picked) >= 24:
                break
        if not moved:
            break
    candidates = []
    for number, (session, turns) in enumerate(picked, start=1):
        candidates.append({
            "ref": f"C{number:02d}",
            "client": session.client,
            "date": session.day,
            "turns": [{"n": index, "role": role, "kind": kind, "text": text} for index, (role, kind, text) in enumerate(turns, start=1)],
        })
    return candidates


def session_start(session_id, zone):
    # Tokscale session ids embed local wall time in the scan timezone, not UTC.
    if not isinstance(session_id, str):
        return None
    matched = ISO_SID_RE.search(session_id)
    if matched:
        text = f"{matched.group(1)}T{matched.group(2)}:{matched.group(3)}:{matched.group(4)}"
    else:
        matched = COMPACT_SID_RE.search(session_id)
        if not matched:
            return None
        text = f"{matched.group(1)}-{matched.group(2)}-{matched.group(3)}T{matched.group(4)}:{matched.group(5)}:{matched.group(6)}"
    try:
        return datetime.fromisoformat(text).replace(tzinfo=zone).astimezone(timezone.utc)
    except ValueError:
        return None


def tokscale_clients(sources):
    names = []
    for source in sources:
        for name in TOKSCALE_CLIENTS[source]:
            if name not in names:
                names.append(name)
    return names


def run_tokscale(mode, home, zone, sources, start, stop):
    started = time.perf_counter()
    empty = {"input": None, "output": None, "source": "unavailable", "usage": [], "unit": "unknown", "family": "unknown", "gaps": {"no_tokscale"}, "seconds": 0.0}
    if mode == "off":
        empty["seconds"] = time.perf_counter() - started
        return empty
    clients = tokscale_clients(sources)
    if not clients:
        empty["seconds"] = time.perf_counter() - started
        return empty
    binary = shutil.which("tokscale")
    if binary:
        command = [binary]
    elif mode == "install":
        command = ["npm", "exec", "--yes", "@tokscale/cli@4.18.0", "--"]
    else:
        empty["seconds"] = time.perf_counter() - started
        return empty
    since = local_day(start, zone)
    until = local_day(stop, zone)
    command += [
        "models", "--json", "--no-spinner", "--home", home, "--client", ",".join(clients),
        "--since", since, "--until", until, "--group-by", "client,session,model",
    ]
    env = os.environ.copy()
    env["TZ"] = getattr(zone, "key", None) or "UTC"
    try:
        completed = subprocess.run(command, capture_output=True, env=env, stdin=subprocess.DEVNULL, timeout=300, check=False)
    except (OSError, subprocess.TimeoutExpired):
        empty["seconds"] = time.perf_counter() - started
        return empty
    if completed.returncode != 0:
        empty["seconds"] = time.perf_counter() - started
        return empty
    try:
        payload = json.loads(completed.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        empty["seconds"] = time.perf_counter() - started
        return empty
    entries = payload.get("entries") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        empty["seconds"] = time.perf_counter() - started
        return empty
    totals = defaultdict(int)
    gaps = set()
    input_tokens = 0
    output_tokens = 0
    kept = False
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        moment = session_start(entry.get("sessionId"), zone)
        if moment is None or not (start <= moment < stop):
            if moment is None:
                gaps.add("partial_window")
            continue
        kept = True
        incoming = entry.get("input") if isinstance(entry.get("input"), int) else 0
        outgoing = entry.get("output") if isinstance(entry.get("output"), int) else 0
        input_tokens += incoming
        output_tokens += outgoing
        name = family(entry.get("model"))
        if name != "unknown":
            totals[name] += incoming + outgoing
    usage = [{"family": name, "count": count} for name, count in sorted(totals.items(), key=lambda item: (-item[1], item[0])) if count > 0][:8]
    if usage and (len(usage) == 1 or usage[0]["count"] > usage[1]["count"]):
        top = usage[0]["family"]
        unit = "reported_tokens"
    else:
        top = "unknown"
        unit = "unknown" if not usage else "reported_tokens"
        if not usage:
            usage = []
    if not kept and not entries:
        input_tokens = 0
        output_tokens = 0
    return {
        "input": input_tokens,
        "output": output_tokens,
        "source": "tokscale",
        "usage": usage,
        "unit": unit if usage else "unknown",
        "family": top if usage else "unknown",
        "gaps": gaps,
        "seconds": time.perf_counter() - started,
    }


def most_client(sessions, sources):
    counts = {client: 0 for client in sources}
    for session in sessions:
        if session.bucket == "human" and session.client in counts:
            counts[session.client] += 1
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    if not ranked or ranked[0][1] == 0:
        return "unknown"
    if len(ranked) > 1 and ranked[0][1] == ranked[1][1]:
        return "unknown"
    return ranked[0][0]


def build_digest(home, sources, start, stop, zone, mode, window_from, window_to, zone_name):
    scan = {"sessions": [], "days": set(), "gaps": {"web_history_unavailable", "no_artifact_inspection"}}
    if "claude-code" in sources:
        scan_claude(home, start, stop, zone, scan)
    if "codex" in sources:
        scan_codex(home, start, stop, zone, scan)
    if "cursor" in sources:
        scan_cursor(home, start, stop, zone, scan)
    if "other" in sources:
        scan_other(home, start, stop, zone, scan)
    if "antigravity" in sources or "chatgpt" in sources:
        scan["gaps"].add("other_sources_missing")
    tokens = run_tokscale(mode, home, zone, sources, start, stop)
    scan["gaps"].update(tokens["gaps"])
    human = [session for session in scan["sessions"] if session.bucket == "human"]
    if not human:
        scan["gaps"].add("insufficient_records")
    active = []
    for client in CLIENTS:
        if client in sources and any(session.client == client for session in scan["sessions"]):
            active.append(client)
    days = sorted(scan["days"])
    if days:
        period = {"from": days[0], "to": days[-1]}
    else:
        period = {"from": local_day(start, zone), "to": local_day(start, zone)}
    scope = "insufficient" if not human else "partial" if scan["gaps"] else "adequate"
    metrics = {
        "humanSessions": len(human),
        "automatedSessions": sum(session.bucket == "automated" for session in scan["sessions"]),
        "subagentSessions": sum(session.bucket == "subagent" for session in scan["sessions"]),
        "userMessages": sum(session.user_n for session in human),
        "inputTokens": tokens["input"],
        "outputTokens": tokens["output"],
        "tokenSource": tokens["source"],
        "modelUsage": tokens["usage"],
        "modelUsageUnit": tokens["unit"],
        "mostUsedModelFamily": tokens["family"],
        "mostUsedClient": most_client(scan["sessions"], sources),
    }
    digest = {
        "window": {"from": window_from, "to": window_to, "timeZone": zone_name},
        "observedPeriod": period,
        "coverage": {
            "scope": scope,
            "sources": active,
            "gaps": [gap for gap in GAPS if gap in scan["gaps"]],
            "sampledSessions": len(scan["sessions"]),
        },
        "metrics": metrics,
        "candidates": sample_candidates(home, scan["sessions"], start, stop),
    }
    counts = {client: 0 for client in sources}
    for session in human:
        if session.client in counts:
            counts[session.client] += 1
    return digest, counts, tokens["seconds"]


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
    digest, counts, tokscale_seconds = build_digest(home, sources, start, stop, zone, args.tokscale, args.time_from, args.time_to, args.tz)
    write_digest(args.out, digest)
    elapsed = time.perf_counter() - started
    metrics = digest["metrics"]
    client_counts = " ".join(f"{client}={counts[client]}" for client in sources)
    print(f"human_sessions={metrics['humanSessions']}")
    print(f"automated_sessions={metrics['automatedSessions']}")
    print(f"subagent_sessions={metrics['subagentSessions']}")
    print(f"user_messages={metrics['userMessages']}")
    print(f"candidates={len(digest['candidates'])}")
    print(f"human_by_client {client_counts}")
    print(f"digest_bytes={os.path.getsize(args.out)}")
    print(f"seconds={elapsed:.2f}")
    print(f"tokscale_seconds={tokscale_seconds:.2f}")


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


def command_submit(args):
    origin = check_origin(args.origin)
    if not SESSION_RE.fullmatch(args.session):
        fail("invalid_session")
    if os.path.islink(args.summary):
        fail("summary_unreadable")
    try:
        with open_file(args.summary) as handle:
            body = handle.read()
        json.loads(body.decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        fail("summary_unreadable")
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
    scan.add_argument("--out", required=True)
    scan.set_defaults(func=command_scan)
    submit = commands.add_parser("submit")
    submit.add_argument("--origin", required=True)
    submit.add_argument("--session", required=True)
    submit.add_argument("--summary", required=True)
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
