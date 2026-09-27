# kotlinx.serialization: keep generated serializers for the API models.
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.bowlmania.rider.**$$serializer { *; }
-keepclassmembers class com.bowlmania.rider.** { *** Companion; }
-keepclasseswithmembers class com.bowlmania.rider.** { kotlinx.serialization.KSerializer serializer(...); }

# Retrofit: keep the API interface and generic signatures used for suspend functions.
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keep interface com.bowlmania.rider.data.net.RiderApi { *; }
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Never keep logging calls in release builds.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
