package in.jayho.rooftop;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Rooftop Protocol — Android shell.
 *
 * The whole game is the same web build that runs on GitHub Pages, loaded from
 * inside the APK. Two decisions matter:
 *
 * 1. It is served from https://appassets.androidplatform.net, NOT file://.
 *    A file:// origin is opaque: no localStorage, no fetch, no sensor APIs,
 *    and the audio element refuses to stream. Intercepting the requests and
 *    serving assets under an https origin gives the game a normal, secure
 *    origin — which is exactly why motion controls work here and why nothing
 *    in the JS needed an Android-specific branch.
 *
 * 2. Media playback does not require a user gesture at the platform level, but
 *    the game still waits for the Begin tap before making sound, because that
 *    is what every mobile browser expects and it keeps one code path.
 */
public class MainActivity extends Activity {

    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_URL = ORIGIN + "/assets/www/index.html";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        goImmersive();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#05070C"));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                // keeps JS errors visible in `adb logcat` instead of vanishing
                android.util.Log.d("RooftopProtocol", m.message() + " @" + m.lineNumber());
                return true;
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u == null) return null;
                String scheme = u.getScheme();
                String host = u.getHost();
                if (!"https".equals(scheme) || !"appassets.androidplatform.net".equals(host)) return null;

                String path = u.getPath();
                if (path == null || !path.startsWith("/assets/")) return null;

                String assetPath = path.substring(1); // drop the leading slash
                try {
                    InputStream in = getAssets().open(assetPath);
                    return new WebResourceResponse(mimeOf(assetPath), null, 200, "OK", headers(assetPath), in);
                } catch (IOException e) {
                    return null;
                }
            }
        });

        setContentView(web);
        web.loadUrl(START_URL);
    }

    private Map<String, String> headers(String path) {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "max-age=31536000");
        return h;
    }

    private String mimeOf(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".wav")) return "audio/wav";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private void goImmersive() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goImmersive();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            // let the game stop its loop and suspend audio instead of running hot
            web.onPause();
            web.evaluateJavascript("window.__androidPause && window.__androidPause()", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.evaluateJavascript("window.__androidResume && window.__androidResume()", null);
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null) {
            // first back asks the game to show its own pause/exit prompt
            /* no lambdas: this builds against android.jar's bootclasspath,
               which has no LambdaMetafactory */
            web.evaluateJavascript(
                    "(function(){try{return window.__androidBack ? window.__androidBack() : false;}catch(e){return false;}})()",
                    new ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String value) {
                            if (!"true".equals(value)) finish();
                        }
                    });
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
