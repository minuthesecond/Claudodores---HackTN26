"""
Where banked voices live: a SQLite index (data/voicebank.db) plus one folder per voice.

    data/voices/<id>/incoming/         an upload only while it's being processed
    data/voices/<id>/media/<mid>.wav   cleaned audio of each recording or upload (24 kHz mono)
    data/voices/<id>/refs/*.wav        the clips chosen to clone from
    data/voices/<id>/latents.pt        the engine's voice fingerprint
    data/voices/<id>/phrases/*.wav     pre-spoken phrases in this voice

This is the only file that knows those paths, so moving to S3 / OCI Object Storage later means
changing this file alone.
"""

import os
import shutil
import sqlite3
import threading
import time
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("VOICEBANK_DATA", os.path.join(HERE, "data"))

# A profile moves draft -> building -> preview -> approved (or back to draft on Redo); failed if a build errors
STATUSES = ("draft", "building", "preview", "approved", "failed")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    consent_at REAL NOT NULL,
    created_at REAL NOT NULL,
    speech_seconds REAL NOT NULL DEFAULT 0,
    approved_at REAL,
    error TEXT
);
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password TEXT NOT NULL,      -- scrypt hash, see auth.py
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,      -- sha256 of the token the browser holds
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,          -- recording | upload
    prompt INTEGER,              -- index into prompts.PROMPTS for recordings
    filename TEXT,
    duration_s REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,        -- processing | ready | failed
    error TEXT,
    created_at REAL NOT NULL,
    stage TEXT,                  -- while processing an upload: queued | separating
    progress REAL                -- 0..1 within the stage
);
"""
# Columns added after the first release; ALTER them into older databases
_ADDED = [("media", "stage", "TEXT"), ("media", "progress", "REAL"),
          ("profiles", "user_id", "TEXT")]  # owner; null until whoever made it signs up

_lock = threading.Lock()
_db = None


def _conn():
    global _db
    if _db is None:
        os.makedirs(DATA_DIR, exist_ok=True)
        _db = sqlite3.connect(os.path.join(DATA_DIR, "voicebank.db"), check_same_thread=False)
        _db.row_factory = sqlite3.Row
        _db.execute("PRAGMA foreign_keys = ON")
        _db.executescript(_SCHEMA)
        for table, col, kind in _ADDED:
            if col not in {r["name"] for r in _db.execute(f"PRAGMA table_info({table})")}:
                _db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {kind}")
        _db.commit()
    return _db


def _new_id():
    return uuid.uuid4().hex[:10]


def _rows(sql, *args):
    with _lock:
        return [dict(r) for r in _conn().execute(sql, args).fetchall()]


def _exec(sql, *args):
    with _lock:
        db = _conn()
        db.execute(sql, args)
        db.commit()


# Paths

def profile_dir(pid):
    return os.path.join(DATA_DIR, "voices", pid)


def media_path(pid, mid):
    return os.path.join(profile_dir(pid), "media", f"{mid}.wav")


def incoming_path(pid, mid, ext):
    """Where an upload sits until it's processed; deleted right after (the video is never kept)."""
    return os.path.join(profile_dir(pid), "incoming", f"{mid}{ext}")


def refs_dir(pid):
    return os.path.join(profile_dir(pid), "refs")


def latents_path(pid):
    return os.path.join(profile_dir(pid), "latents.pt")


def phrases_dir(pid):
    return os.path.join(profile_dir(pid), "phrases")


# Profiles

def create_profile(name):
    pid, now = _new_id(), time.time()
    _exec("INSERT INTO profiles (id, name, status, consent_at, created_at) VALUES (?, ?, 'draft', ?, ?)",
          pid, name, now, now)
    os.makedirs(os.path.join(profile_dir(pid), "media"), exist_ok=True)
    return get_profile(pid)


def list_profiles(user_id=None, ids=()):
    """Every profile (server housekeeping), or one user's, or the unowned ones in `ids`
    (a visitor's voices before they make an account)."""
    if user_id is None and not ids:
        return _rows("SELECT * FROM profiles ORDER BY created_at DESC")
    marks = ",".join("?" * len(ids)) or "''"
    return _rows(f"SELECT * FROM profiles WHERE user_id = ? OR (user_id IS NULL AND id IN ({marks})) "
                 "ORDER BY created_at DESC", user_id or "", *ids)


def claim_profile(pid, user_id):
    """Gives an unowned profile to `user_id`; a profile someone already owns is left alone."""
    _exec("UPDATE profiles SET user_id = ? WHERE id = ? AND user_id IS NULL", user_id, pid)


def get_profile(pid):
    rows = _rows("SELECT * FROM profiles WHERE id = ?", pid)
    return rows[0] if rows else None


def update_profile(pid, **fields):
    if "status" in fields and fields["status"] not in STATUSES:
        raise ValueError(f"bad status {fields['status']!r}")
    cols = ", ".join(f"{k} = ?" for k in fields)
    _exec(f"UPDATE profiles SET {cols} WHERE id = ?", *fields.values(), pid)


def delete_profile(pid):
    """Removes the profile, its media rows and every file it owns."""
    _exec("DELETE FROM profiles WHERE id = ?", pid)
    shutil.rmtree(profile_dir(pid), ignore_errors=True)


# Media

def add_media(pid, kind, prompt=None, filename=None):
    mid = _new_id()
    _exec("INSERT INTO media (id, profile_id, kind, prompt, filename, status, created_at) "
          "VALUES (?, ?, ?, ?, ?, 'processing', ?)", mid, pid, kind, prompt, filename, time.time())
    return get_media(mid)


def get_media(mid):
    rows = _rows("SELECT * FROM media WHERE id = ?", mid)
    return rows[0] if rows else None


def list_media(pid):
    return _rows("SELECT * FROM media WHERE profile_id = ? ORDER BY created_at", pid)


def update_media(mid, **fields):
    cols = ", ".join(f"{k} = ?" for k in fields)
    _exec(f"UPDATE media SET {cols} WHERE id = ?", *fields.values(), mid)


def delete_media(mid):
    m = get_media(mid)
    if not m:
        return
    _exec("DELETE FROM media WHERE id = ?", mid)
    try:
        os.remove(media_path(m["profile_id"], mid))
    except FileNotFoundError:
        pass


# Accounts

def create_user(username, name, password_hash):
    uid = _new_id()
    _exec("INSERT INTO users (id, username, name, password, created_at) VALUES (?, ?, ?, ?, ?)",
          uid, username, name, password_hash, time.time())
    return get_user(uid)


def get_user(uid):
    rows = _rows("SELECT id, username, name, created_at FROM users WHERE id = ?", uid)
    return rows[0] if rows else None


def get_user_login(username):
    """The user row including the password hash, for checking a login."""
    rows = _rows("SELECT * FROM users WHERE username = ?", username)
    return rows[0] if rows else None


def add_session(token_hash, uid, expires_at):
    _exec("DELETE FROM sessions WHERE expires_at < ?", time.time())
    _exec("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", token_hash, uid, expires_at)


def session_user(token_hash):
    rows = _rows("SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?", token_hash, time.time())
    return get_user(rows[0]["user_id"]) if rows else None


def delete_session(token_hash):
    _exec("DELETE FROM sessions WHERE token = ?", token_hash)
