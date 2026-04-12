#!/usr/bin/env python3
"""List ``sample_*.mid`` files that are missing ``MThd`` or fail to parse (corrupt).

Does not modify anything — prints one basename per line (stdout).
Exit code 1 if any are bad, 0 if all load OK (handy for CI).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pretty_midi


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _is_standard_midi_file(path: Path) -> bool:
    with path.open("rb") as f:
        return f.read(4) == b"MThd"


def _midi_loads(path: Path) -> bool:
    if not _is_standard_midi_file(path):
        return False
    try:
        pretty_midi.PrettyMIDI(str(path))
    except Exception:
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--samples-dir",
        type=Path,
        default=_repo_root() / "music" / "lmd_100_samples",
        help="Folder containing sample_0.mid … (default: music/lmd_100_samples)",
    )
    args = parser.parse_args()

    samples_dir = args.samples_dir.resolve()
    if not samples_dir.is_dir():
        print(f"Samples directory does not exist: {samples_dir}", file=sys.stderr)
        return 1

    mid_paths = sorted(samples_dir.glob("sample_*.mid"))
    if not mid_paths:
        print(f"No sample_*.mid under {samples_dir}", file=sys.stderr)
        return 1

    bad = [p for p in mid_paths if not _midi_loads(p)]
    for p in bad:
        print(p.name)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
