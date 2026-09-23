#!/usr/bin/env python3
"""LET IT DIE (Offline) - Mushroom Stew / decal luck editor.

The Mushroom Stew decal pull is PRE-ROLLED. The offline build decides a whole
batch of results up front (from master_skillgacha_odds) and stores them in your
save as a queue:

    soul.skl.gacha.normal.sklids   (each pull takes the next one off the top)

Because the results are already fixed, changing the odds does nothing until that
queue runs out and the game makes a new batch - which is why people say "it took
~200 pulls before my edited odds kicked in", and why the luck stays even after
you put the odds back. This rewrites the queue so a change takes effect on the
very next pull.

  python stew_luck.py show
  python stew_luck.py regen   --inplace            # fair reroll from current odds
  python stew_luck.py stack   --rarity 5 --inplace # fill the queue with 5-stars
  python stew_luck.py dedupe  --rarity 5 --inplace # swap owned r5s in queue for new ones
  python stew_luck.py clear   --inplace            # empty it; game rebuilds it

It finds the game and your save automatically (or set LID_DB / LID_SAVE). Pass a
.sav path anywhere on the command line (before or after the flags) to target a
specific one, e.g. "dedupe --rarity 5 --inplace C:\...\brggame.sav". Close the
game first; it writes the save on exit and will overwrite your edit. Default
writes <save>.edited.sav; --inplace overwrites after a timestamped .bak.

MIT. No warranty; back up your save.
"""
import argparse
import glob
import os
import re
import struct
import subprocess
import sys
import time
import zlib
from collections import Counter

QUEUE_PATH = ("soul", "skl", "gacha", "normal", "sklids")
GACHA_ID = "SKLGACH_NORMAL_OFFLINE"
MAGIC, ZTAG, MAX_CHUNK = b"BRG\0", b"ZLIB", 2097152
HERE = os.path.dirname(os.path.abspath(__file__))
DRIVES, STEAM_ROOTS = "CDEFGHIJ", (
    r"%s:\Program Files (x86)\Steam", r"%s:\Program Files\Steam",
    r"%s:\SteamLibrary", r"%s:\Steam", r"%s:\Games\Steam")

# byte-preserving JSON if savejson.py sits alongside, else stdlib (game accepts both)
try:
    sys.path.insert(0, HERE)
    import savejson as _sj
    def jloads(b): return _sj.loads(b)
    def jdumps(o): return _sj.dumps(o)
    _BYTE_EXACT = True
except Exception:
    import json as _json
    def jloads(b): return _json.loads(b)
    def jdumps(o): return _json.dumps(o, separators=(",", ":"), ensure_ascii=False)
    _BYTE_EXACT = False


def _scan(suffix):
    for drive in DRIVES:
        for root in STEAM_ROOTS:
            c = os.path.join(root % drive, suffix)
            if os.path.exists(c):
                return c
    return None


def find_db():
    env = os.environ.get("LID_DB")
    if env and os.path.exists(env):
        return env
    p = _scan(r"steamapps\common\LET IT DIE\BrgGame\Content\masters.db")
    if not p:
        sys.exit("Could not find masters.db. Set LID_DB to its full path.")
    return p


def find_save(arg=None):
    if arg:
        if not os.path.exists(arg):
            sys.exit("save not found: %s" % arg)
        return arg
    env = os.environ.get("LID_SAVE")
    if env and os.path.exists(env):
        return env
    d = _scan(r"steamapps\common\LET IT DIE\Savedata")
    if not d or not os.path.isdir(d):
        sys.exit("Could not find your Savedata folder. Pass the .sav path, or set LID_SAVE.")
    savs = glob.glob(os.path.join(d, "*.sav"))
    main = [f for f in savs if re.match(r"^\d+\.sav$", os.path.basename(f))]
    pick = main or sorted(savs, key=os.path.getsize, reverse=True)
    if not pick:
        sys.exit("No .sav in %s" % d)
    return pick[0]


def game_running():
    try:
        out = subprocess.run(["tasklist", "/fi", "imagename eq BrgGame-Steam.exe"],
                             capture_output=True, text=True, timeout=15).stdout
        return "BrgGame-Steam" in out
    except Exception:
        return False


# --- .sav container (BRG/ZLIB) ------------------------------------------
def unpack(b):
    if b[0:4] != MAGIC or b[12:16] != ZTAG:
        sys.exit("not a BRG/ZLIB save")
    total = struct.unpack_from("<I", b, 8)[0]
    pos, out = 16, bytearray()
    while len(out) < total:
        decomp, comp = struct.unpack_from("<II", b, pos); pos += 8
        out += zlib.decompress(b[pos:pos + comp]); pos += comp
    assert len(out) == total, "size mismatch"
    return bytes(out)


def _split(total):
    return [total] if total <= MAX_CHUNK else _split(total // 2) + _split(total - total // 2)


def pack(payload):
    out = bytearray(MAGIC + struct.pack("<II", 2, len(payload)) + ZTAG)
    pos = 0
    for size in _split(len(payload)):
        blob = zlib.compress(payload[pos:pos + size], 6)
        out += struct.pack("<II", size, len(blob)) + blob
        pos += size
    return bytes(out + struct.pack("<I", 0))


# --- odds ---------------------------------------------------------------
def load_odds(db):
    import sqlite3
    c = sqlite3.connect(db)
    row = c.execute("SELECT odds_id FROM master_skillgacha WHERE id=?", (GACHA_ID,)).fetchone()
    oid = row[0] if row else GACHA_ID
    rows = c.execute("SELECT sklid, odds FROM master_skillgacha_odds WHERE id=? AND odds>0", (oid,)).fetchall()
    rarity = {r[0]: r[1] for r in c.execute("SELECT id, rarity FROM master_skill")}
    c.close()
    if not rows:
        sys.exit("no odds rows for %s" % oid)
    return rows, rarity


def load_names(db, lang="int"):
    """sklid -> readable name.

    master_skill.name is a pointer like "SKILL_NAME.TXT_SKL_ABPUP_01", so the
    string itself is one join away in master_text. Falling back to the id keeps
    output usable for decals with no string in this language.
    """
    import sqlite3
    c = sqlite3.connect(db)
    text = {(sct, tid): txt for sct, tid, txt in
            c.execute("SELECT sct, id, txt FROM master_text WHERE lang=?", (lang,))}
    out = {}
    for sid, ptr in c.execute("SELECT id, name FROM master_skill"):
        if ptr and "." in ptr:
            sct, tid = ptr.split(".", 1)
            out[sid] = text.get((sct, tid)) or sid
        else:
            out[sid] = ptr or sid
    c.close()
    return out


def owned_decals(doc):
    """Every sklid already in the save, so duplicates can be flagged."""
    got = set()

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str) and v.startswith("SKL_"):
                    got.add(v)
                else:
                    walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(doc.get("soul", {}))
    return got


def odds_table(rows, rarity, names, top=12):
    """What the game would roll, best odds first, as percentages."""
    total = sum(o for _s, o in rows) or 1
    out = ["odds (%d decals in the pool)" % len(rows)]
    per_r = {}
    for s, o in rows:
        per_r[rarity.get(s, "?")] = per_r.get(rarity.get(s, "?"), 0) + o
    out.append("  by rarity  : " + "  ".join(
        "r%s %.2f%%" % (r, 100.0 * per_r[r] / total)
        for r in sorted(per_r, key=str, reverse=True)))
    for r in sorted(per_r, key=str, reverse=True):
        p = per_r[r] / total
        if p > 0:
            out.append("  r%-3s       : 1 in %.1f pulls on average" % (r, 1 / p))
    out.append("  rarest few :")
    for s, o in sorted(rows, key=lambda x: x[1])[:top]:
        out.append("     %-34s r%-3s %.3f%%  (1 in %.0f)"
                   % (names.get(s, s), rarity.get(s, "?"),
                      100.0 * o / total, total / o))
    return out


def pull_report(queue, rarity, names, owned, ahead=10):
    """What the next pulls actually hold. The game consumes from the END."""
    order = list(reversed(queue))            # imminent first
    lines = ["queued pulls : %d" % len(queue),
             "rarity spread: %s" % histogram(queue, rarity)]

    for r in sorted({rarity.get(s) for s in queue if rarity.get(s) is not None},
                    key=lambda x: (x is None, x), reverse=True):
        nxt = next((i for i, s in enumerate(order) if rarity.get(s) == r), None)
        n = sum(1 for s in queue if rarity.get(s) == r)
        if nxt is None:
            continue
        lines.append("  rarity %-3s: %4d queued, next %s"
                     % (r, n, "on this pull" if nxt == 0 else "in %d pulls" % (nxt + 1)))

    new = [s for s in order if s not in owned]
    lines.append("new to you   : %d of %d queued" % (len(new), len(queue)))
    if new:
        i = order.index(new[0])
        lines.append("               first new: %s in %d pull%s"
                     % (names.get(new[0], new[0]), i + 1, "" if i == 0 else "s"))
    dupes = Counter(order)
    rep = [s for s, n in dupes.items() if n > 1]
    if rep:
        lines.append("repeats      : %d decal(s) queued more than once, worst %dx"
                     % (len(rep), max(dupes.values())))

    lines.append("")
    lines.append("next %d pulls:" % min(ahead, len(order)))
    for i, s in enumerate(order[:ahead], 1):
        lines.append("  %2d. %-34s r%-3s %-4s %s"
                     % (i, names.get(s, s), rarity.get(s, "?"),
                        "" if s in owned else "NEW", s))
    return lines


def make_queue(rows, rarity, length, only_rarity, seed):
    import bisect
    import random
    if only_rarity is not None:
        rows = [(s, o) for s, o in rows if rarity.get(s) == only_rarity]
        if not rows:
            sys.exit("no decals of rarity %d in the odds table" % only_rarity)
    sklids, cum, tot = [], [], 0
    for s, o in rows:
        tot += o; sklids.append(s); cum.append(tot)
    rng = random.Random(seed)
    return [sklids[bisect.bisect_right(cum, rng.random() * tot)] for _ in range(length)]


def _weighted_take(fresh, rng):
    """Pick one sklid from a {sklid: odds} pool, weighted by odds, remove it
    from the pool (in place) so it can never be handed out a second time,
    and return it."""
    items = list(fresh.items())
    tot = sum(o for _s, o in items)
    r = rng.random() * tot
    acc = 0.0
    for s, o in items:
        acc += o
        if r <= acc:
            del fresh[s]
            return s
    s, _o = items[-1]                # float rounding fallback
    del fresh[s]
    return s


def dedupe_rarity(queue, owned, rows, rarity, target_rarity, seed):
    """Make every target_rarity pull in the queue distinct from anything
    you'll already own by the time you reach it, weighted-random-filling
    from the not-yet-owned pool.

    A decal stops counting as "new" the instant you'd have one - whether
    that's because you already own it going in, or because an earlier pull
    *in this very run* already granted you one. So this walks the queue in
    the order the game will actually pull it (from the end forward) and
    tracks a running "you'll own this by now" set: the first time a target
    decal is seen it's left alone and marked owned-from-here-on; every
    later slot that would repeat something in that set (an old dupe or a
    freshly-created one) gets swapped for a still-unclaimed decal instead.

    If the not-yet-owned pool is empty or runs dry partway through, the
    slots that can't be replaced are left as-is and reported separately.
    """
    pool = [(s, o) for s, o in rows if rarity.get(s) == target_rarity]
    if not pool:
        sys.exit("no decals of rarity %d in the odds table" % target_rarity)
    fresh = {s: o for s, o in pool if s not in owned}
    started_empty = not fresh

    import random
    rng = random.Random(seed)
    newq = list(queue)
    seen = set(owned)
    swapped, ran_out = [], 0
    for i in range(len(newq) - 1, -1, -1):     # imminent pull first (queue end)
        s = newq[i]
        if rarity.get(s) != target_rarity:
            continue
        if s not in seen:
            seen.add(s)
            fresh.pop(s, None)      # this copy claims it; don't hand it out again
            continue
        if fresh:
            pick = _weighted_take(fresh, rng)
            seen.add(pick)
            swapped.append((s, pick))
            newq[i] = pick
        else:
            ran_out += 1
    return newq, swapped, ran_out, started_empty


def histogram(sklids, rarity):
    c = Counter(rarity.get(s, "?") for s in sklids)
    return " ".join("r%s:%d" % (k, c[k]) for k in sorted(c, key=str)) or "(empty)"


# --- save I/O -----------------------------------------------------------
def get_parent(doc):
    n = doc
    for k in QUEUE_PATH[:-1]:
        n = n.setdefault(k, {})
    return n


def read(path):
    return jloads(unpack(open(path, "rb").read()))


def write(doc, path, inplace):
    payload = jdumps(doc)
    if isinstance(payload, str):
        payload = payload.encode("utf-8")
    if inplace:
        bak = "%s.%s.bak" % (path, time.strftime("%Y%m%d_%H%M%S"))
        open(bak, "wb").write(open(path, "rb").read())
        open(path, "wb").write(pack(payload))
        print("wrote %s (backup: %s)" % (path, os.path.basename(bak)))
    else:
        out = os.path.splitext(path)[0] + ".edited.sav"
        open(out, "wb").write(pack(payload))
        print("wrote %s (original untouched)" % out)
    if not _BYTE_EXACT:
        print("  note: savejson.py not alongside; JSON was reformatted (the game accepts it)")


# --- commands -----------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="LET IT DIE stew/decal luck editor")
    ap.add_argument("mode", choices=["show", "regen", "stack", "dedupe", "front", "clear"])
    # NOTE: the .sav path is deliberately NOT declared as a second positional
    # here. argparse has a long-standing quirk where a required positional
    # (mode) followed by any --flag before a trailing optional positional
    # makes it lose track of that trailing value ("unrecognized arguments").
    # Grabbing it from parse_known_args()'s leftovers instead means the path
    # can go anywhere on the command line, flags before or after it, and
    # still get picked up correctly.
    ap.add_argument("--inplace", action="store_true", help="overwrite the save (makes a .bak)")
    ap.add_argument("--count", type=int, default=0, help="queue length (default: keep current)")
    ap.add_argument("--rarity", type=int, choices=[1, 2, 3, 4, 5],
                    help="stack/dedupe: which rarity")
    ap.add_argument("--seed", type=int, default=None, help="RNG seed")
    ap.add_argument("--ahead", type=int, default=10,
                    help="show: how many upcoming pulls to list (default 10)")
    ap.add_argument("--odds", action="store_true",
                    help="show: also print the pool's odds")
    ap.add_argument("--lang", default="int",
                    help="language for decal names (int, jpn, chn, ...)")
    a, extra = ap.parse_known_args()

    bad = [e for e in extra if e.startswith("-") and e != "-"]
    if bad or len(extra) > 1:
        ap.error("unrecognized arguments: %s" % " ".join(extra))
    a.save = extra[0] if extra else None

    if a.mode != "show" and a.inplace and game_running():
        sys.exit("Close LET IT DIE first (it overwrites the save on exit).")
    if a.mode == "stack" and a.rarity is None:
        sys.exit("stack needs --rarity 1..5")
    if a.mode == "dedupe" and a.rarity is None:
        sys.exit("dedupe needs --rarity 1..5")

    save = find_save(a.save)
    doc = read(save)
    parent = doc
    for k in QUEUE_PATH[:-1]:
        parent = parent.get(k, {}) if isinstance(parent, dict) else {}
    cur = parent.get(QUEUE_PATH[-1]) if isinstance(parent, dict) else None

    if a.mode == "show":
        db = find_db()
        rows, rarity = load_odds(db)
        names = load_names(db, a.lang)
        try:
            import lidcommon as _lc
            _lc.report_version()
        except Exception:
            pass
        print("save         : %s" % save)
        if not cur:
            print("no stew queue in this save yet - the game builds one on the "
                  "next pull, from the odds below")
            print()
            for ln in odds_table(rows, rarity, names):
                print(ln)
            return
        # The game consumes from the END of the list (verified in-game): the
        # next pull is sklids[-1], then [-2], and so on.
        for ln in pull_report(cur, rarity, names, owned_decals(doc), a.ahead):
            print(ln)
        if a.odds:
            print()
            for ln in odds_table(rows, rarity, names):
                print(ln)
        return

    length = a.count or (len(cur) if cur else 200)
    if a.mode == "front":
        # Reorder what is already queued instead of rolling a new queue: these
        # are pulls the game has already committed to, so moving them keeps
        # every decal you were going to get and only changes when.
        if not cur:
            sys.exit("no queue to reorder; run 'regen' first")
        _rows, rarity = load_odds(find_db())
        names = load_names(find_db(), a.lang)
        want = a.rarity or 5
        # the game consumes from the END, so "first" means last in the list
        pick = [s for s in cur if rarity.get(s) == want]
        rest = [s for s in cur if rarity.get(s) != want]
        get_parent(doc)[QUEUE_PATH[-1]] = rest + pick
        print("moved %d rarity-%d pull(s) to the front of the queue (%d total)"
              % (len(pick), want, len(cur)))
        for s in list(reversed(pick))[:12]:
            print("   %-34s %s" % (names.get(s, s), s))
        if not pick:
            print("   none at that rarity; nothing moved")
    elif a.mode == "dedupe":
        if not cur:
            sys.exit("no queue to edit; run 'regen' first")
        db = find_db()
        rows, rarity = load_odds(db)
        names = load_names(db, a.lang)
        owned = owned_decals(doc)
        newq, swapped, ran_out, started_empty = dedupe_rarity(
            cur, owned, rows, rarity, a.rarity, a.seed)
        get_parent(doc)[QUEUE_PATH[-1]] = newq
        if not swapped and started_empty:
            print("you already own every rarity-%d decal in the pool; nothing to swap in"
                  % a.rarity)
        elif not swapped:
            print("no rarity-%d pull in the queue would repeat one you'll already have; "
                  "nothing changed" % a.rarity)
        else:
            print("deduped %d rarity-%d pull(s) that would've repeated a decal you'll "
                  "already have (owned now, or granted earlier in this same queue), "
                  "swapped in for ones new to you" % (len(swapped), a.rarity))
            for old, new in swapped[:20]:
                print("   %-34s -> %-34s" % (names.get(old, old), names.get(new, new)))
            if len(swapped) > 20:
                print("   ... and %d more" % (len(swapped) - 20))
            if ran_out:
                print("ran out of not-yet-owned rarity-%d decals partway through - left %d "
                      "owned pull(s) unchanged" % (a.rarity, ran_out))
    elif a.mode == "clear":
        get_parent(doc)[QUEUE_PATH[-1]] = []
        print("cleared the queue; the game rebuilds it from current odds on the next pull")
    else:
        rows, rarity = load_odds(find_db())
        newq = make_queue(rows, rarity, length,
                          a.rarity if a.mode == "stack" else None, a.seed)
        get_parent(doc)[QUEUE_PATH[-1]] = newq
        label = "stacked %d rarity-%d pulls" % (length, a.rarity) if a.mode == "stack" \
            else "regenerated %d pulls from current odds" % length
        print("%s\n  before: %s\n  after : %s"
              % (label, histogram(cur or [], rarity), histogram(newq, rarity)))
    write(doc, save, a.inplace)


if __name__ == "__main__":
    main()
