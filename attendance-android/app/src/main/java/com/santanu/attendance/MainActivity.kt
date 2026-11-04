package com.santanu.attendance

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Looper
import android.provider.MediaStore
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import org.json.JSONObject
import java.io.File

/**
 * Hosts the Punch Attendance web app (packaged from /attendance-app) in a WebView served from a
 * secure https origin, so browser geolocation works. A small native bridge (window.AndroidDevice)
 * adds battery/device details, notifications, file export and a fake-GPS check.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null
    @Volatile private var lastNativeLocation: Location? = null
    private var locationManager: LocationManager? = null

    private val locationListener = LocationListener { loc -> lastNativeLocation = loc }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        pendingGeo?.let { (origin, cb) -> cb.invoke(origin, granted, false) }
        pendingGeo = null
        if (granted) startNativeLocation()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = ContextCompat.getColor(this, R.color.brand)
        createNotificationChannel()

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.setGeolocationEnabled(true)
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assetLoader.shouldInterceptRequest(request.url)
            }
            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                    if (hasLocationPermission()) {
                        callback.invoke(origin, true, false)
                    } else {
                        pendingGeo = origin to callback
                        requestPermissions()
                    }
                }
            }
            addJavascriptInterface(DeviceBridge(), "AndroidDevice")
        }
        setContentView(webView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (hasLocationPermission()) startNativeLocation() else requestPermissions()
        if (savedInstanceState == null) {
            webView.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/index.html")
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        if (hasLocationPermission()) startNativeLocation()
    }

    override fun onPause() {
        super.onPause()
        locationManager?.removeUpdates(locationListener)
    }

    private fun hasLocationPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun requestPermissions() {
        val perms = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) perms += Manifest.permission.POST_NOTIFICATIONS
        permissionLauncher.launch(perms.toTypedArray())
    }

    /** Listens to GPS natively only to detect fake (mock) locations. */
    @SuppressLint("MissingPermission")
    private fun startNativeLocation() {
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        locationManager = lm
        lm.removeUpdates(locationListener)
        for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
            if (lm.isProviderEnabled(provider)) {
                runCatching { lm.requestLocationUpdates(provider, 5000L, 0f, locationListener, Looper.getMainLooper()) }
                runCatching { lm.getLastKnownLocation(provider)?.let { if (lastNativeLocation == null) lastNativeLocation = it } }
            }
        }
    }

    private fun isMock(loc: Location): Boolean =
        if (Build.VERSION.SDK_INT >= 31) loc.isMock else @Suppress("DEPRECATION") loc.isFromMockProvider

    private fun createNotificationChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Punch reminders", NotificationManager.IMPORTANCE_DEFAULT)
        )
    }

    inner class DeviceBridge {

        /** Battery and device details as JSON for the "This phone" card. */
        @JavascriptInterface
        fun info(): String {
            val batt = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            val level = batt?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batt?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
            val status = batt?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val plugged = batt?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
            val health = batt?.getIntExtra(BatteryManager.EXTRA_HEALTH, -1) ?: -1
            val tempTenths = batt?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE) ?: Int.MIN_VALUE
            val voltage = batt?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1) ?: -1
            val chargeTimeMs = if (Build.VERSION.SDK_INT >= 28) bm.computeChargeTimeRemaining() else -1L

            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            val network = when {
                caps == null -> "Offline"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile data"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                else -> "Online"
            }

            return JSONObject().apply {
                put("battery", if (level >= 0 && scale > 0) Math.round(level * 100f / scale) else JSONObject.NULL)
                put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)
                put("full", status == BatteryManager.BATTERY_STATUS_FULL)
                put("plugged", when (plugged) {
                    BatteryManager.BATTERY_PLUGGED_AC -> "Charger"
                    BatteryManager.BATTERY_PLUGGED_USB -> "USB"
                    BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Wireless"
                    else -> "Not plugged in"
                })
                put("health", when (health) {
                    BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
                    BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheating"
                    BatteryManager.BATTERY_HEALTH_DEAD -> "Dead"
                    BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over voltage"
                    BatteryManager.BATTERY_HEALTH_COLD -> "Cold"
                    else -> "Unknown"
                })
                put("temperatureC", if (tempTenths != Int.MIN_VALUE) tempTenths / 10.0 else JSONObject.NULL)
                put("voltage", if (voltage > 0) voltage / 1000.0 else JSONObject.NULL)
                put("chargeTimeSec", if (chargeTimeMs > 0) chargeTimeMs / 1000 else JSONObject.NULL)
                put("technology", batt?.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY) ?: "")
                put("manufacturer", Build.MANUFACTURER)
                put("model", Build.MODEL)
                put("android", Build.VERSION.RELEASE)
                put("sdk", Build.VERSION.SDK_INT)
                put("network", network)
                put("appVersion", packageManager.getPackageInfo(packageName, 0).versionName)
            }.toString()
        }

        /** True when the latest native location fix came from a fake-GPS (mock location) app. */
        @JavascriptInterface
        fun isMockLocation(): Boolean = lastNativeLocation?.let { isMock(it) } ?: false

        @JavascriptInterface
        fun notify(text: String) {
            runOnUiThread {
                if (Build.VERSION.SDK_INT >= 33 &&
                    ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                ) return@runOnUiThread
                val n = NotificationCompat.Builder(this@MainActivity, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_dialog_map)
                    .setContentTitle(getString(R.string.app_name))
                    .setContentText(text)
                    .setAutoCancel(true)
                    .build()
                runCatching { NotificationManagerCompat.from(this@MainActivity).notify(1, n) }
            }
        }

        /** Saves an export (CSV/JSON) to the phone's Downloads folder. */
        @JavascriptInterface
        fun saveFile(name: String, content: String, mime: String) {
            val safeName = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val ok = runCatching {
                if (Build.VERSION.SDK_INT >= 29) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(MediaStore.Downloads.MIME_TYPE, mime)
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: error("Could not create file")
                    contentResolver.openOutputStream(uri)!!.use { it.write(content.toByteArray()) }
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
                    File(dir, safeName).writeText(content)
                }
            }.isSuccess
            runOnUiThread {
                Toast.makeText(
                    this@MainActivity,
                    if (ok) "Saved $safeName to Downloads" else "Could not save $safeName",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    companion object {
        private const val CHANNEL_ID = "punch_reminders"
    }
}
