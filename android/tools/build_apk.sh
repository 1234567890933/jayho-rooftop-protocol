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

# ---------------------------------------------------------------- Kotlin ---
# The bridge is Kotlin, so the Kotlin stdlib has to be dexed in as well —
# without it the app dies with NoClassDefFoundError on the first Kotlin call.
KOTLINC="${KOTLINC:-}"
if [ -z "$KOTLINC" ]; then
  for c in "$HOME/kotlinc/bin/kotlinc" /opt/kotlinc/bin/kotlinc "$(command -v kotlinc || true)"; do
    [ -x "$c" ] && KOTLINC="$c" && break
  done
fi
if [ -n "$KOTLINC" ]; then
  echo "→ compiling kotlin ($KOTLINC)"
  mkdir -p "$OUT/ktclasses"
  "$KOTLINC" -nowarn -jvm-target 1.8 -classpath "$AJ" -d "$OUT/ktclasses" \
    $(find "$HERE/src/main/kotlin" -name '*.kt')
  KOTLIN_STDLIB="$(dirname "$(dirname "$KOTLINC")")/lib/kotlin-stdlib.jar"
else
  echo "!! kotlinc not found — building without the Kotlin bridge"
  KOTLIN_STDLIB=""
fi

echo "→ compiling java"
KT_CP=""
[ -d "$OUT/ktclasses" ] && KT_CP="$OUT/ktclasses"

javac -source 8 -target 8 -nowarn \
  -bootclasspath "$AJ" -classpath "$AJ:$KT_CP" \
  -d "$OUT/classes" \
  $(find "$HERE/src" -name '*.java') \
  $(find "$OUT/gen" -name '*.java')

# ------------------------------------------------------------------- C++ ---
NDK="${ANDROID_NDK_ROOT:-$SDK/ndk/25.2.9519653}"
if [ -d "$NDK" ]; then
  echo "→ compiling native library"
  TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin"
  for ABI in arm64-v8a armeabi-v7a x86_64; do
    case "$ABI" in
      arm64-v8a)   TARGET=aarch64-linux-android23 ;;
      armeabi-v7a) TARGET=armv7a-linux-androideabi23 ;;
      x86_64)      TARGET=x86_64-linux-android23 ;;
    esac
    mkdir -p "$OUT/lib/$ABI"
    "$TOOLCHAIN/${TARGET}-clang++" -shared -fPIC -O2 -std=c++17 \
      -o "$OUT/lib/$ABI/libturbulence.so" \
      "$HERE/src/main/cpp/turbulence.cpp" || echo "!! $ABI failed"
  done
  ls -lh "$OUT/lib"/*/libturbulence.so 2>/dev/null | wc -l
else
  echo "!! NDK not found at $NDK — building without the native library"
fi

echo "→ dexing"
# -J passes JVM flags through the d8 wrapper; the default 2 GB heap does not
# fit in small CI containers (and is pointless for one class)
D8_INPUTS="$(find "$OUT/classes" -name '*.class')"
[ -d "$OUT/ktclasses" ] && D8_INPUTS="$D8_INPUTS $(find "$OUT/ktclasses" -name '*.class')"
[ -n "${KOTLIN_STDLIB:-}" ] && [ -f "$KOTLIN_STDLIB" ] && D8_INPUTS="$D8_INPUTS $KOTLIN_STDLIB"

"$BT/d8" -JXmx600m -JXX:CompressedClassSpaceSize=64m --lib "$AJ" --min-api 23 --release \
  --output "$OUT/dex" $D8_INPUTS

echo "→ packaging"
cp "$OUT/dex/classes.dex" "$OUT/classes.dex"
( cd "$OUT" && zip -q -X base.apk classes.dex )
# native libraries go in uncompressed so the loader can map them directly
if [ -d "$OUT/lib" ]; then
  ( cd "$OUT" && zip -q -X -0 base.apk $(find lib -name '*.so') )
fi
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
