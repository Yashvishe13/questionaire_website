#!/usr/bin/env python3
"""Apply audio edits using librosa (WAV-to-WAV).

Supported edit types:
  pitch_shift       — Global pitch shift (+6 semitones)
  time_stretch      — Time stretch (1.5× slower)
  segment_shuffle   — Split into 4 segments, rotate by 1
  vocal_pitch_shift — "Vocal" (melody) pitch shift (+5 semitones)

Usage:
  python librosa_audio_edits.py --input-dir ../music/wav_samples --edit pitch_shift
  python librosa_audio_edits.py --input-dir ../music/wav_samples --edit all
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import numpy as np
import librosa
import soundfile as sf

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None  # type: ignore[misc, assignment]


# =========================================================
# DEFAULT PARAMETERS
# =========================================================

PITCH_SHIFT_STEPS = 6
TIME_STRETCH_FACTOR = 1.5
NUM_SEGMENTS = 4
ROTATE_BY = 1
VOCAL_PITCH_SHIFT_STEPS = 5


# =========================================================
# EDIT FUNCTIONS
# =========================================================

def pitch_shift(y: np.ndarray, sr: int, n_steps: int = PITCH_SHIFT_STEPS) -> np.ndarray:
    return librosa.effects.pitch_shift(y, sr=sr, n_steps=n_steps)


def time_stretch(y: np.ndarray, factor: float = TIME_STRETCH_FACTOR) -> np.ndarray:
    rate = 1.0 / factor  # factor>1 means slower, so rate<1
    return librosa.effects.time_stretch(y, rate=rate)


def split_audio_into_equal_segments(y: np.ndarray, num_segments: int):
    y = np.asarray(y)
    if len(y) == 0:
        return []
    segments = np.array_split(y, num_segments)
    return [seg for seg in segments if len(seg) > 0]


def segment_shuffle(y: np.ndarray, num_segments: int = NUM_SEGMENTS, rotate_by: int = ROTATE_BY):
    segments = split_audio_into_equal_segments(y, num_segments)
    if len(segments) < 2:
        return None

    n = len(segments)
    shift = rotate_by % n
    if shift == 0:
        shift = 1

    shuffled_order = list(range(shift, n)) + list(range(shift))
    return np.concatenate([segments[i] for i in shuffled_order], axis=0)


def vocal_pitch_shift(y: np.ndarray, sr: int, n_steps: int = VOCAL_PITCH_SHIFT_STEPS) -> np.ndarray:
    """Pitch-shift entire signal (proxy for vocal-only when no stems available)."""
    return librosa.effects.pitch_shift(y, sr=sr, n_steps=n_steps)


# =========================================================
# PROCESSING
# =========================================================

EDIT_FUNCS = {
    "pitch_shift": lambda y, sr: pitch_shift(y, sr),
    "time_stretch": lambda y, sr: time_stretch(y),
    "segment_shuffle": lambda y, sr: segment_shuffle(y),
    "vocal_pitch_shift": lambda y, sr: vocal_pitch_shift(y, sr),
}

EDIT_SUBDIRS = {
    "pitch_shift": "librosa_pitch_shift",
    "time_stretch": "librosa_time_stretch",
    "segment_shuffle": "librosa_segment_shuffle",
    "vocal_pitch_shift": "librosa_vocal_pitch_shift",
}


def process_file(src: Path, out_path: Path, edit_name: str, overwrite: bool) -> str:
    if not overwrite and out_path.is_file():
        return "skip"

    y, sr = librosa.load(str(src), sr=None, mono=True)

    result = EDIT_FUNCS[edit_name](y, sr)

    if result is None:
        return "too_short"

    sf.write(str(out_path), np.asarray(result, dtype=np.float32), sr)
    return "ok"


def run_edit(input_dir: Path, output_dir: Path | None, edit_name: str, overwrite: bool) -> int:
    subdir = EDIT_SUBDIRS[edit_name]
    out_dir = (output_dir or input_dir.parent / subdir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    wav_files = sorted(input_dir.glob("*.wav"))
    if not wav_files:
        print(f"No .wav files in {input_dir}", file=sys.stderr)
        return 1

    use_tqdm = tqdm is not None and sys.stderr.isatty()
    items = tqdm(wav_files, desc=edit_name, unit="file") if use_tqdm else wav_files

    written, skipped, failed = 0, 0, 0
    for src in items:
        out_path = out_dir / src.name
        try:
            status = process_file(src, out_path, edit_name, overwrite)
            if status == "ok":
                written += 1
            elif status == "skip":
                skipped += 1
            else:
                print(f"  skip (too short): {src.name}", file=sys.stderr)
                skipped += 1
        except Exception as e:
            msg = f"ERR {src.name}: {type(e).__name__}: {e}"
            if use_tqdm and tqdm is not None:
                tqdm.write(msg, file=sys.stderr)
            else:
                print(msg, file=sys.stderr)
            failed += 1

    parts = [f"{written} written", f"{skipped} skipped"]
    if failed:
        parts.append(f"{failed} failed")
    print(f"[{edit_name}] Done: {', '.join(parts)} → {out_dir}")
    return 1 if failed else 0


# =========================================================
# CLI
# =========================================================

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input-dir", type=Path, required=True, help="Directory with .wav files")
    parser.add_argument("--output-dir", type=Path, default=None, help="Output directory (default: sibling of input)")
    parser.add_argument(
        "--edit",
        choices=list(EDIT_FUNCS.keys()) + ["all"],
        default="all",
        help="Which edit to apply (default: all)",
    )
    parser.add_argument("--overwrite", action="store_true", help="Re-process existing output files")
    args = parser.parse_args()

    input_dir = args.input_dir.resolve()
    if not input_dir.is_dir():
        print(f"Input directory not found: {input_dir}", file=sys.stderr)
        return 1

    edits = list(EDIT_FUNCS.keys()) if args.edit == "all" else [args.edit]
    rc = 0
    for edit_name in edits:
        rc |= run_edit(input_dir, args.output_dir, edit_name, args.overwrite)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
