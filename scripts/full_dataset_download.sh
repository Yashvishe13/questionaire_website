#!/usr/bin/env bash
set -euo pipefail

# Uses curl (macOS/Linux) — no apt-get/wget required.
mkdir -p lakh_midi_full
cd lakh_midi_full

url="http://hog.ee.columbia.edu/craffel/lmd/lmd_full.tar.gz"
archive="lmd_full.tar.gz"
if [[ -f "$archive" ]]; then
  echo "Reusing existing $archive (delete it to re-download)."
else
  curl -fL --progress-bar -o "$archive" "$url"
fi

tar -xvzf "$archive"

rm "$archive"

echo "Full dataset ready!"
