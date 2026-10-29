#!/usr/bin/env sh
# Downloads the public-domain source texts into data/source and checks their checksums.
# BSB: scrollmapper/bible_databases (JSON). WEB: seven1m/open-bibles (USFX).
set -eu
cd "$(dirname "$0")/.."
mkdir -p data/source

fetch() {
  url="$1"; out="$2"; sum="$3"
  if [ ! -f "$out" ]; then
    echo "Downloading $out"
    curl -fsSL "$url" -o "$out.tmp" && mv "$out.tmp" "$out"
  fi
  echo "$sum  $out" | sha256sum -c -
}

fetch https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/BSB.json \
  data/source/bsb.json cec3c644088a8ef4a50cf1e2de035f79d8825f394625d116bb7ee7e1d57739c9
fetch https://raw.githubusercontent.com/seven1m/open-bibles/master/eng-web.usfx.xml \
  data/source/web.usfx.xml 5ffa2626f170a109a4a96afc90775c06f0821cb4ba81ed34e63663e085708d68
