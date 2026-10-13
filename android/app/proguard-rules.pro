# Reglas de R8 para Fiestea (Capacitor 8).
#
# Capacitor llama a los plugins por reflexión: busca las clases anotadas con
# @CapacitorPlugin y sus métodos @PluginMethod por nombre, y el puente con la
# web es un @JavascriptInterface. Si R8 los renombra, la app arranca pero los
# plugins (cámara, ubicación, compras, avisos…) dejan de responder.

-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, Exceptions

# Puente y núcleo de Capacitor.
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }

# Todos los plugins: los de npm y los propios (FiesteaLocationPlugin).
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }

# Código propio de la app (MainActivity, plugin de ubicación).
-keep class com.vybe.app.** { *; }

# Interfaces JavaScript de cualquier WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Trazas de errores legibles en Play Console y Sentry (Play desofusca con el
# mapping.txt que va dentro del AAB).
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile

# El SDK de Facebook llega con el plugin de inicio de sesión social y no se usa.
-dontwarn com.facebook.**
