#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bakes every asset in the game.
#
#   standard  ~155 MB   plates at 2048 px, compact music beds   (default)
#   max       ~400 MB   plates at 2731 px (2.4x pixels), full-length music
#
# The repository stores only the generators, so CI bakes whichever profile the
# build asks for and nothing large is ever committed to git.
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-standard}"

if [ "$PROFILE" = "max" ]; then
  export PLATE_W=2731
  export MUSIC_LEN=2.4
  echo "→ max profile: plates 2731 px, music 2.4x"
else
  export PLATE_W=2048
  export MUSIC_LEN=1
  echo "→ standard profile: plates 2048 px, compact music"
fi

cd "$HERE"
python3 gen_scenes.py textures
for s in lane stairs dusk night sky; do python3 gen_scenes.py "$s"; done
python3 gen_extras.py all
python3 gen_audio.py sfx
python3 gen_audio.py music
python3 gen_audio.py extra

echo "→ baked:"
du -sh ../assets/art ../assets/audio
