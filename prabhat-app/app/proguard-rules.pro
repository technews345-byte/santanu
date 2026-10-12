# kotlinx.serialization: keep generated serializers for the stored app state.
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.prabhat.app.**$$serializer { *; }
-keepclassmembers class com.prabhat.app.** { *** Companion; }
-keepclasseswithmembers class com.prabhat.app.** { kotlinx.serialization.KSerializer serializer(...); }

# Never keep logging calls in release builds.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
