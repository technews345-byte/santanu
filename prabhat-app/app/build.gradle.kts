import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Signing configuration comes from the environment (CI secrets) or local.properties, never from source code.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun config(name: String, default: String = ""): String =
    System.getenv(name)?.takeIf { it.isNotBlank() } ?: localProps.getProperty(name)?.takeIf { it.isNotBlank() } ?: default

android {
    namespace = "com.prabhat.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.prabhat.app"
        minSdk = 26
        targetSdk = 35
        versionCode = config("PRABHAT_VERSION_CODE", "1").toInt()
        versionName = config("PRABHAT_VERSION_NAME", "1.0.0")
        // Keep only English resources from libraries (the app's own text is in code); saves space.
        resourceConfigurations += listOf("en")
    }

    signingConfigs {
        // A fixed key committed with the project, so every build can update the previous one on the phone
        // (a CI machine's generated debug key changes on every run, and Android refuses such updates).
        // It is not secret: for a Play Store release, set the PRABHAT_KEYSTORE_* secrets instead.
        create("stable") {
            storeFile = rootProject.file("signing/prabhat-test.keystore")
            storePassword = "prabhat-test"
            keyAlias = "prabhat"
            keyPassword = "prabhat-test"
        }
        // Release signing from CI secrets; without them the release APK uses the stable key above.
        val ks = config("PRABHAT_KEYSTORE_FILE")
        if (ks.isNotBlank() && file(ks).exists()) {
            create("release") {
                storeFile = file(ks)
                storePassword = config("PRABHAT_KEYSTORE_PASSWORD")
                keyAlias = config("PRABHAT_KEY_ALIAS")
                keyPassword = config("PRABHAT_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            signingConfig = signingConfigs.getByName("stable")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("stable")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            // Build metadata the app never reads at runtime.
            excludes += listOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/*.version", "/META-INF/**/*.kotlin_module", "kotlin/**", "DebugProbesKt.bin")
        }
    }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-process:2.8.7")
    implementation("androidx.core:core-ktx:1.15.0")

    val media3 = "1.5.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-session:$media3")
    implementation("com.google.guava:guava:33.3.1-android")

    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-guava:1.9.0")
    implementation("io.coil-kt:coil-compose:2.7.0")

    testImplementation("junit:junit:4.13.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
