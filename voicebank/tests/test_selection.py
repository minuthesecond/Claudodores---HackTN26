import banking


def test_keeps_order_and_skips_short_clips():
    chosen = banking.select_refs([("a", 0, 4.0), ("tiny", 0, 0.4), ("b", 0, 6.0)])
    assert chosen == [("a", 0, 4.0), ("b", 0, 6.0)]


def test_long_clips_are_cut():
    assert banking.select_refs([("long", 5.0, 40.0)]) == [("long", 5.0, banking.MAX_CLIP_S)]


def test_stops_at_clip_count():
    chosen = banking.select_refs([(str(i), 0, 5.0) for i in range(20)])
    assert len(chosen) == banking.MAX_CLIPS


def test_stops_at_total_seconds():
    chosen = banking.select_refs([(str(i), 0, 14.0) for i in range(7)])
    assert sum(s for _, _, s in chosen) <= banking.MAX_TOTAL_S
    assert chosen[-1][2] >= banking.MIN_CLIP_S


def test_recordings_first_then_upload_windows_interleaved():
    c = banking.candidates([("rec0", 3.0), ("rec1", 4.0)], [("up_a", 60.0), ("up_b", 30.0)])
    assert [p for p, _, _ in c[:2]] == ["rec0", "rec1"]
    assert [p for p, _, _ in c[2:6]] == ["up_a", "up_b", "up_a", "up_b"]  # each video gets a turn


def test_upload_windows_spread_across_the_whole_upload():
    windows = banking.candidates([], [("up", 120.0)])
    starts = [s for _, s, _ in windows]
    assert len(windows) == banking.WINDOWS_PER_UPLOAD
    assert starts[0] == 0 and starts[-1] == 120.0 - banking.WINDOW_S
    assert all(secs == banking.WINDOW_S for _, _, secs in windows)


def test_short_upload_is_one_window():
    assert banking.candidates([], [("up", 7.0)]) == [("up", 0.0, 7.0)]


def test_warnings():
    assert "at least" in banking.warnings_for(3)[0]
    assert "or more" in banking.warnings_for(15)[0]
    assert banking.warnings_for(45) == []
