package com.jayho.rooftop

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.webkit.JavascriptInterface

/**
 * NativeBridge — the Kotlin side of Rooftop Protocol.
 *
 * The web build is the game; this class is the thin native layer that gives it
 * the things a browser cannot do well on Android:
 *
 *  · vibration with proper amplitude control (and a real "off" switch)
 *  · the C++ turbulence field, so the particle wind costs one JNI call per
 *    grid cell instead of four trig calls per particle per frame
 *  · SharedPreferences that survive an app update (localStorage can be cleared
 *    by the system under memory pressure; preferences are not)
 *  · device facts the renderer uses to pick a starting quality tier
 *
 * Everything is exposed to JavaScript as `window.AndroidBridge` and every call
 * is defensive: a missing sensor or a denied permission must never throw into
 * the game loop.
 */
class NativeBridge(context: Context) {

    private val app: Context = context.applicationContext
    private val prefs = app.getSharedPreferences("rooftop", Context.MODE_PRIVATE)

    /** true once libturbulence.so is loaded — the JS checks this */
    val nativeReady: Boolean = try {
        System.loadLibrary("turbulence")
        true
    } catch (e: UnsatisfiedLinkError) {
        Log.w("RooftopProtocol", "native library unavailable: ${e.message}")
        false
    }

    // ---------------------------------------------------------------- native
    private external fun turbulenceX(x: Float, y: Float, t: Float): Float
    private external fun turbulenceY(x: Float, y: Float, t: Float): Float
    private external fun sceneSeed(scene: Int): Int
    private external fun nativeVersion(): String

    @JavascriptInterface
    fun nativeInfo(): String =
        if (nativeReady) nativeVersion() else "unavailable"

    @JavascriptInterface
    fun turbulence(x: Float, y: Float, t: Float): String {
        if (!nativeReady) return "0,0"
        return "${turbulenceX(x, y, t)},${turbulenceY(x, y, t)}"
    }

    @JavascriptInterface
    fun seedFor(scene: Int): Int = if (nativeReady) sceneSeed(scene) else scene * 7919

    // ------------------------------------------------------------- vibration
    @JavascriptInterface
    fun vibrate(millis: Int) {
        vibratePattern(longArrayOf(0L, millis.coerceIn(1, 200).toLong()), null)
    }

    @JavascriptInterface
    fun vibratePattern(timings: String, amplitudes: String) {
        val onOff = timings.split(",").mapNotNull { it.trim().toLongOrNull() }.toLongArray()
        if (onOff.isEmpty()) return
        val amps = amplitudes.split(",").mapNotNull { it.trim().toIntOrNull() }.toIntArray()
        vibratePattern(onOff, if (amps.size == onOff.size) amps else null)
    }

    /** VibrationEffect wants LongArray timings and IntArray amplitudes. */
    private fun vibratePattern(timings: LongArray, amplitudes: IntArray?) {
        try {
            val v = app.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
            if (!v.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = if (amplitudes != null) {
                    VibrationEffect.createWaveform(timings, amplitudes, -1)
                } else {
                    VibrationEffect.createWaveform(timings, -1)
                }
                v.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(timings, -1)
            }
        } catch (e: Exception) {
            Log.w("RooftopProtocol", "vibrate failed: ${e.message}")
        }
    }

    @JavascriptInterface
    fun cancelVibration() {
        try {
            (app.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.cancel()
        } catch (_: Exception) {
        }
    }

    // ----------------------------------------------------------- preferences
    @JavascriptInterface
    fun getPref(key: String, fallback: String): String = prefs.getString(key, fallback) ?: fallback

    @JavascriptInterface
    fun setPref(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    // ---------------------------------------------------------------- device
    /** "tier,cores,memMB,api,sdk" — the renderer uses this to start honest */
    @JavascriptInterface
    fun deviceProfile(): String {
        val cores = Runtime.getRuntime().availableProcessors()
        val rt = Runtime.getRuntime()
        val memMb = (rt.maxMemory() / (1024 * 1024)).toInt()
        val tier = when {
            cores <= 4 || memMb < 192 -> 1
            else -> 2
        }
        return "$tier,$cores,$memMb,${Build.VERSION.SDK_INT},${Build.MANUFACTURER} ${Build.MODEL}"
    }

    @JavascriptInterface
    fun log(message: String) {
        Log.d("RooftopProtocol", message)
    }
}
