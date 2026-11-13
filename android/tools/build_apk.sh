#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Builds Rooftop Protocol into a signed, installable APK without Gradle.
#
#   aapt2 compile → aapt2 link → javac → d8 → zip → zipalign → apksigner
#
# Requires: JDK 17, Android SDK build-tools 34.0.0 + platforms/android-34.
# Set ANDROID_SDK_ROOT if the SDK is not in the default place.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/opt/android-sdk}}"
BT="$SDK/build-tools/34.0.0"
AJ="$SDK/platforms/android-34/android.jar"
WEB="$HERE/../"
OUT="$HERE/build"
ASSETS="$HERE/src/main/assets/www"

if [ ! -x "$BT/aapt2" ]; then echo "aapt2 not found in $BT"; exit 1; fi
if [ ! -f "$AJ" ]; then echo "android.jar not found at $AJ"; exit 1; fi

echo "→ staging the web build"
rm -rf "$ASSETS"
mkdir -p "$ASSETS"
cp -r "$WEB/index.html" "$WEB/css" "$WEB/js" "$WEB/assets" "$ASSETS/"

echo "→ compiling resources"
rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"
"$BT/aapt2" compile --dir "$HERE/res" -o "$OUT/res.zip"

echo "→ linking"
"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$AJ" \
  --manifest "$HERE/AndroidManifest.xml" \
  -R "$OUT/res.zip" \
  -A "$HERE/src/main/assets" \
  --java "$OUT/gen" \
  --min-sdk-version 23 \
  --target-sdk-version 34 \
  --version-code 2 \
  --version-name 1.1 \
  --auto-add-overlay

echo "→ compiling java"
javac -source 8 -target 8 -nowarn \
  -bootclasspath "$AJ" -classpath "$AJ" \
  -d "$OUT/classes" \
  $(find "$HERE/src" -name '*.java') \
  $(find "$OUT/gen" -name '*.java')

echo "→ dexing"
# -J passes JVM flags through the d8 wrapper; the default 2 GB heap does not
# fit in small CI containers (and is pointless for one class)
"$BT/d8" -JXmx600m -JXX:CompressedClassSpaceSize=64m --lib "$AJ" --min-api 23 --release \
  --output "$OUT/dex" \
  $(find "$OUT/classes" -name '*.class')

echo "→ packaging"
cp "$OUT/dex/classes.dex" "$OUT/classes.dex"
( cd "$OUT" && zip -q -X base.apk classes.dex )
"$BT/zipalign" -f -p 4 "$OUT/base.apk" "$OUT/unaligned.apk"

echo "→ signing"
KS="$HERE/tools/debug.keystore"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -v -keystore "$KS" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Rooftop Protocol,C=IN" >/dev/null 2>&1
fi

# the apksigner wrapper hard-codes -Xmx1024M, which does not fit alongside
# metaspace inside a 1.5 GB address-space limit — call the jar directly
JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}java"
APKSIGNER_JAR="$BT/lib/apksigner.jar"
SIGN_OPTS="-Xmx400m -XX:MaxMetaspaceSize=160m -XX:CompressedClassSpaceSize=48m -XX:ReservedCodeCacheSize=40m"

"$JAVA_BIN" $SIGN_OPTS -jar "$APKSIGNER_JAR" sign \
  --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$OUT/RooftopProtocol.apk" "$OUT/unaligned.apk"

"$JAVA_BIN" $SIGN_OPTS -jar "$APKSIGNER_JAR" verify --print-certs "$OUT/RooftopProtocol.apk" | head -4
ls -lh "$OUT/RooftopProtocol.apk"
echo "APK: $OUT/RooftopProtocol.apk"
