import os

import pytest

import store


@pytest.fixture(autouse=True)
def fresh_store(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(store, "_db", None)


def test_delete_removes_every_file():
    p = store.create_profile("Ana")
    m = store.add_media(p["id"], "recording", prompt=0)
    for path in (store.media_path(p["id"], m["id"]), store.latents_path(p["id"]),
                 os.path.join(store.refs_dir(p["id"]), "ref_00.wav")):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "wb").close()

    store.delete_profile(p["id"])
    assert store.get_profile(p["id"]) is None
    assert store.list_media(p["id"]) == []
    assert not os.path.exists(store.profile_dir(p["id"]))


def test_status_is_checked():
    p = store.create_profile("Ana")
    store.update_profile(p["id"], status="approved")
    assert store.get_profile(p["id"])["status"] == "approved"
    with pytest.raises(ValueError):
        store.update_profile(p["id"], status="nope")
