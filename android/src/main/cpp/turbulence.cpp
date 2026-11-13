// ============================================================================
// turbulence.cpp — native particle field for Rooftop Protocol
// ----------------------------------------------------------------------------
// Why this exists in C++ rather than JS:
//
// The particle wind field used to be a pair of sin/cos calls per particle per
// frame — about 1,200 particles × 60 fps × 4 trig calls = ~290k transcendental
// calls a second, all on the main thread that also has to draw the frame.
//
// This is a smooth value-noise field: cheap hash lookups and lerps, no trig at
// all, deterministic for a given (x, y, t). It is compiled to arm64 and armv7
// and called through JNI once per coarse grid cell, then bilinearly sampled in
// JavaScript — so the cost drops from per-particle to per-frame, and the field
// looks better than the trig version because it is continuous in both axes.
//
// Also here: a deterministic integer hash used to seed per-scene randomness,
// and a version probe so the JS can verify the native library actually loaded.
// ============================================================================

#include <jni.h>
#include <cstdint>
#include <cmath>

namespace {

// 2D value hash: fast, deterministic, no state. Returns 0..1.
inline float hash2(int32_t x, int32_t y, int32_t seed) {
    uint32_t h = static_cast<uint32_t>(x) * 374761393u
               + static_cast<uint32_t>(y) * 668265263u
               + static_cast<uint32_t>(seed) * 2246822519u;
    h = (h ^ (h >> 13)) * 1274126177u;
    h ^= h >> 16;
    return static_cast<float>(h & 0x00FFFFFFu) / static_cast<float>(0x00FFFFFF);
}

inline float fade(float t) {
    // smootherstep: C2 continuous, so the field has no visible ridges
    return t * t * t * (t * (t * 6.f - 15.f) + 10.f);
}

inline float lerp(float a, float b, float t) { return a + (b - a) * t; }

// 2D value noise at (x, y) for a given integer seed
inline float valueNoise(float x, float y, int32_t seed) {
    const float fx = std::floor(x);
    const float fy = std::floor(y);
    const int32_t ix = static_cast<int32_t>(fx);
    const int32_t iy = static_cast<int32_t>(fy);
    const float tx = fade(x - fx);
    const float ty = fade(y - fy);

    const float v00 = hash2(ix,     iy,     seed);
    const float v10 = hash2(ix + 1, iy,     seed);
    const float v01 = hash2(ix,     iy + 1, seed);
    const float v11 = hash2(ix + 1, iy + 1, seed);

    return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
}

// Two octaves is enough for embers; a third costs more than it shows.
inline float fbm(float x, float y, int32_t seed) {
    return valueNoise(x, y, seed) * 0.66f + valueNoise(x * 2.1f, y * 2.1f, seed + 7) * 0.34f;
}

} // namespace

extern "C" {

// Signed turbulence component for the X axis, in -1..1
JNIEXPORT jfloat JNICALL
Java_com_jayho_rooftop_NativeBridge_turbulenceX(JNIEnv *, jobject,
                                               jfloat x, jfloat y, jfloat t) {
    const int32_t seed = static_cast<int32_t>(t * 0.35f);
    const float n = fbm(x * 0.0061f + t * 0.031f, y * 0.0061f, seed);
    return (n * 2.f - 1.f);
}

// Signed turbulence component for the Y axis, in -1..1 (a curl-ish partner)
JNIEXPORT jfloat JNICALL
Java_com_jayho_rooftop_NativeBridge_turbulenceY(JNIEnv *, jobject,
                                               jfloat x, jfloat y, jfloat t) {
    const int32_t seed = static_cast<int32_t>(t * 0.35f) + 101;
    const float n = fbm(x * 0.0061f, y * 0.0061f + t * 0.031f, seed);
    return (n * 2.f - 1.f);
}

// Deterministic seed for a scene name hash — keeps replays identical
JNIEXPORT jint JNICALL
Java_com_jayho_rooftop_NativeBridge_sceneSeed(JNIEnv *, jobject, jint scene) {
    return static_cast<jint>(hash2(scene, 0x5EED, 7) * 100000.0f);
}

// Version probe: JS checks this to know the native path is live
JNIEXPORT jstring JNICALL
Java_com_jayho_rooftop_NativeBridge_nativeVersion(JNIEnv *env, jobject) {
    return env->NewStringUTF("turbulence-1.0-r25c");
}

} // extern "C"
