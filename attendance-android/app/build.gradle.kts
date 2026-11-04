plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.santanu.attendance"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.santanu.attendance"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("ATTENDANCE_VERSION_CODE") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("ATTENDANCE_VERSION_CODE") ?: "0")
    }

    // The app's screens are the web app in /attendance-app, packaged as assets.
    sourceSets["main"].assets.srcDirs(rootProject.file("../attendance-app"))

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
