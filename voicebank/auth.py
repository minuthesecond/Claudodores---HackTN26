"""
Accounts for saving voices: usernames, scrypt-hashed passwords, and bearer tokens.

The browser keeps a random token and sends it as `Authorization: Bearer <token>`. The server
stores only its SHA-256, so a copy of the database can't be used to log in.
"""

import hashlib
import hmac
import re
import secrets
import time

SESSION_DAYS = 30
USERNAME = re.compile(r"^[a-zA-Z0-9_.-]{3,32}$")
MIN_PASSWORD = 8
_N, _R, _P = 2**14, 8, 1  # scrypt cost: ~50 ms a check


def hash_password(password):
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${key.hex()}"


def check_password(password, stored):
    try:
        _, n, r, p, salt, key = stored.split("$")
        got = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
                             dklen=len(key) // 2)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(got.hex(), key)


def new_token():
    """(token for the browser, hash to store, expiry)."""
    token = secrets.token_urlsafe(32)
    return token, token_hash(token), time.time() + SESSION_DAYS * 86400


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def bearer(header):
    """The token from an `Authorization: Bearer ...` header, or None."""
    if header and header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def check_signup(username, password):
    """An error message for the form, or None if both are acceptable."""
    if not USERNAME.match(username):
        return "Usernames are 3 to 32 letters, numbers, dots, dashes or underscores"
    if len(password) < MIN_PASSWORD:
        return f"Passwords need at least {MIN_PASSWORD} characters"
    return None
