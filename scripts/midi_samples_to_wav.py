#!/usr/bin/env python3
"""Render MIDI files in a folder to WAV so librosa-based notebooks can load them.

Re-running after a crash: by default, existing output ``.wav`` files are skipped so the
run continues from missing files only. Use ``--overwrite`` to replace every WAV.
Writes go to a ``.wav.tmp`` file first, then replace the final ``.wav`` atomically.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pretty_midi
import soundfile as sf

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None  # type: ignore[misc, assignment]


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _short_name(name: str, max_len: int = 44) -> str:
    if len(name) <= max_len:
        return name
    return name[: max_len - 1] + "…"


def _is_standard_midi_file(path: Path) -> bool:
    """SMF files start with the chunk type 'MThd' (not RIFF MIDI, not HTML masquerading as .mid)."""
    with path.open("rb") as f:
        return f.read(4) == b"MThd"


def midi_to_wav(mid_path: Path, wav_path: Path, sample_rate: int) -> None:
    if not _is_standard_midi_file(mid_path):
        raise ValueError(
            "File does not start with MThd (not a standard SMF .mid). "
            "Often this means the file is HTML/text from a failed download — re-fetch from LMD."
        )
    pm = pretty_midi.PrettyMIDI(str(mid_path))
    audio = pm.synthesize(fs=sample_rate, normalize=True)
    if audio.size == 0:
        raise ValueError(f"No audio synthesized (empty MIDI?): {mid_path}")
    peak = float(np.abs(audio).max())
    if peak == 0.0:
        raise ValueError(f"Synthesized silence only: {mid_path}")
    audio_f32 = np.asarray(audio, dtype=np.float32)
    tmp_path = wav_path.with_name(wav_path.name + ".tmp")
    try:
        sf.write(str(tmp_path), audio_f32, sample_rate, subtype="PCM_16")
        tmp_path.replace(wav_path)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=_repo_root() / "music" / "lmd_100_samples",
        help="Directory containing .mid files (default: music/lmd_100_samples)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="WAV output directory (default: <input-dir>_wav next to input)",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=22050,
        help="Sample rate Hz (test.ipynb uses 22050 for most librosa cells)",
    )
    parser.add_argument(
        "--no-progress",
        action="store_true",
        help="Disable the progress bar (e.g. for logs or CI)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-render all MIDI files even if the matching .wav already exists",
    )
    args = parser.parse_args()

    input_dir = args.input_dir.resolve()
    if not input_dir.is_dir():
        print(f"Input directory does not exist: {input_dir}", file=sys.stderr)
        return 1

    out_dir = args.output_dir.resolve() if args.output_dir else input_dir.parent / f"{input_dir.name}_wav"
    out_dir.mkdir(parents=True, exist_ok=True)

    mid_files = sorted(input_dir.glob("*.mid"))
    if not mid_files:
        print(f"No .mid files under {input_dir}", file=sys.stderr)
        return 1

    for stale in out_dir.glob("*.wav.tmp"):
        try:
            stale.unlink()
        except OSError:
            pass

    use_tqdm = tqdm is not None and not args.no_progress and sys.stderr.isatty()
    bar = tqdm(mid_files, desc="MIDI → WAV", unit="file") if use_tqdm else mid_files
    if tqdm is None and not args.no_progress:
        print("Install tqdm for a progress bar: pip install tqdm", file=sys.stderr)

    written, skipped, failed = 0, 0, 0
    for mid in bar:
        if use_tqdm:
            bar.set_postfix_str(_short_name(mid.name), refresh=False)
        wav = out_dir / f"{mid.stem}.wav"
        if not args.overwrite and wav.is_file():
            skipped += 1
            continue
        try:
            midi_to_wav(mid, wav, args.sample_rate)
            written += 1
        except Exception as e:  # noqa: BLE001 — report per-file errors and continue
            msg = f"ERR {mid.name}: {type(e).__name__}: {e!s}"
            if use_tqdm:
                tqdm.write(msg, file=sys.stderr)
            else:
                print(msg, file=sys.stderr)
            failed += 1

    parts = [f"{written} written", f"{skipped} skipped (already done)"]
    if failed:
        parts.append(f"{failed} failed")
    print(f"Done: {', '.join(parts)} → {out_dir}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
