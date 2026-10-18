import time

import pytest

import auth
import store


@pytest.fixture(autouse=True)
def fresh_store(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(store, "_db", None)


def test_password_hash_round_trip():
    h = auth.hash_password("correct horse")
    assert h.startswith("scrypt$") and "correct horse" not in h
    assert auth.check_password("correct horse", h)
    assert not auth.check_password("wrong horse", h)
    assert not auth.check_password("x", "garbage")


def test_signup_rules():
    assert auth.check_signup("ab", "longenough") is not None
    assert auth.check_signup("has space", "longenough") is not None
    assert auth.check_signup("clark", "short") is not None
    assert auth.check_signup("clark.w", "longenough") is None


def test_usernames_are_unique_ignoring_case():
    store.create_user("Clark", "Clark", auth.hash_password("longenough"))
    with pytest.raises(Exception):
        store.create_user("clark", "Other", auth.hash_password("longenough"))
    assert store.get_user_login("CLARK")["name"] == "Clark"


def test_sessions_store_only_the_hash_and_expire():
    u = store.create_user("ana", "Ana", auth.hash_password("longenough"))
    token, hashed, expires = auth.new_token()
    store.add_session(hashed, u["id"], expires)
    assert store.session_user(auth.token_hash(token))["id"] == u["id"]
    assert store.session_user(token) is None  # the raw token isn't what's stored
    store.add_session("old", u["id"], time.time() - 1)
    assert store.session_user("old") is None
    store.delete_session(hashed)
    assert store.session_user(hashed) is None


def test_voices_belong_to_their_owner():
    ana = store.create_user("ana", "Ana", "x")
    bo = store.create_user("bo", "Bo", "x")
    mine = store.create_profile("Ana's voice")
    store.claim_profile(mine["id"], ana["id"])
    guest = store.create_profile("made before signup")

    assert [p["id"] for p in store.list_profiles(ana["id"])] == [mine["id"]]
    assert store.list_profiles(bo["id"]) == []
    # a visitor sees their own unowned voice by id, never someone else's
    assert [p["id"] for p in store.list_profiles(None, [guest["id"], mine["id"]])] == [guest["id"]]

    store.claim_profile(guest["id"], bo["id"])
    store.claim_profile(guest["id"], ana["id"])  # already owned: unchanged
    assert store.get_profile(guest["id"])["user_id"] == bo["id"]
