package com.vybe.app;

import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Avisos con el logo del negocio (notificaciones personalizadas de Business).
 *
 * Un aviso normal de Firebase lo pinta Android: icono de Fiestea a la izquierda
 * y, si lleva imagen, la imagen a la derecha. Para que el logo del negocio
 * salga a la izquierda, `send-push` manda estos avisos sólo con datos
 * (`fiestea_brand`) y aquí se pintan como una «conversación» cuyo remitente es
 * el negocio: Android pone su foto a la izquierda, con la F de Fiestea
 * pequeña en la esquina.
 *
 * Todo lo demás (el token, los avisos con la app abierta, los avisos normales)
 * sigue igual: se llama al servicio del plugin de Capacitor, que este sustituye
 * en el manifiesto. Al tocar el aviso, el intent lleva `google.message_id` y
 * los datos, que es lo que el plugin reconoce para abrir su pantalla.
 */
public class FiesteaMessagingService extends MessagingService {

    private static final String CANAL = "vybe";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        // El plugin lo pasa a la app si está abierta (el aviso de arriba).
        super.onMessageReceived(message);

        Map<String, String> datos = message.getData();
        if (!"1".equals(datos.get("fiestea_brand")) || message.getNotification() != null) return;
        // Con la app delante, el aviso lo pinta la propia app.
        if (enPrimerPlano()) return;

        try {
            pintar(message, datos);
        } catch (Exception e) {
            // Si algo falla, al menos un aviso sencillo: no se puede perder.
            pintarSencillo(message, datos);
        }
    }

    private boolean enPrimerPlano() {
        ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
        ActivityManager.getMyMemoryState(info);
        return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
    }

    private void pintar(RemoteMessage message, Map<String, String> datos) {
        Context ctx = getApplicationContext();
        String titulo = valor(datos, "title", "Fiestea");
        String texto = valor(datos, "body", "");
        String tag = valor(datos, "tag", message.getMessageId());
        Bitmap logo = descargar(datos.get("image"));

        IconCompat icono = logo != null ? IconCompat.createWithBitmap(logo) : null;
        Person negocio = new Person.Builder().setName(titulo).setIcon(icono).setKey("negocio:" + titulo).setImportant(true).build();

        // Atajo de «conversación»: sin él Android no pone la foto a la izquierda.
        String atajo = "negocio-" + Integer.toHexString(titulo.hashCode());
        Intent abrir = new Intent(ctx, MainActivity.class).setAction(Intent.ACTION_VIEW);
        ShortcutInfoCompat.Builder sc = new ShortcutInfoCompat.Builder(ctx, atajo)
            .setShortLabel(titulo)
            .setLongLived(true)
            .setPerson(negocio)
            .setIntent(abrir);
        if (icono != null) sc.setIcon(icono);
        ShortcutManagerCompat.pushDynamicShortcut(ctx, sc.build());

        NotificationCompat.MessagingStyle estilo = new NotificationCompat.MessagingStyle(new Person.Builder().setName(" ").build())
            .addMessage(texto, System.currentTimeMillis(), negocio);

        NotificationCompat.Builder aviso = base(ctx, message, datos, titulo, texto)
            .setStyle(estilo)
            .setShortcutId(atajo)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE);
        if (logo != null) aviso.setLargeIcon(logo);

        mostrar(ctx, tag, aviso);
    }

    private void pintarSencillo(RemoteMessage message, Map<String, String> datos) {
        try {
            Context ctx = getApplicationContext();
            String titulo = valor(datos, "title", "Fiestea");
            String texto = valor(datos, "body", "");
            mostrar(ctx, valor(datos, "tag", message.getMessageId()), base(ctx, message, datos, titulo, texto));
        } catch (Exception ignorado) {
            // Sin permiso de avisos: nada que hacer.
        }
    }

    private NotificationCompat.Builder base(Context ctx, RemoteMessage message, Map<String, String> datos, String titulo, String texto) {
        canal(ctx);
        // Lo mismo que lleva un aviso de Firebase al tocarlo: así el plugin
        // abre la pantalla del aviso (`pushNotificationActionPerformed`).
        Intent intent = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("google.message_id", message.getMessageId() != null ? message.getMessageId() : String.valueOf(System.currentTimeMillis()));
        for (Map.Entry<String, String> e : datos.entrySet()) intent.putExtra(e.getKey(), e.getValue());
        int codigo = (int) (System.currentTimeMillis() & 0x7fffffff);
        PendingIntent pendiente = PendingIntent.getActivity(ctx, codigo, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(ctx, CANAL)
            .setSmallIcon(R.drawable.ic_stat_vybe)
            .setColor(0xFFF8D000)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendiente);
    }

    private void mostrar(Context ctx, String tag, NotificationCompat.Builder aviso) {
        try {
            NotificationManagerCompat.from(ctx).notify(tag, 0, aviso.build());
        } catch (SecurityException sinPermiso) {
            // La persona no ha dado permiso de avisos.
        }
    }

    /** El canal lo crea la app al registrarse; por si aún no existe. */
    private void canal(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CANAL) != null) return;
        nm.createNotificationChannel(new NotificationChannel(CANAL, "Fiestea", NotificationManager.IMPORTANCE_HIGH));
    }

    private static String valor(Map<String, String> datos, String clave, String porDefecto) {
        String v = datos.get(clave);
        return v != null && !v.isEmpty() ? v : porDefecto;
    }

    /** El logo, como mucho 5 s y 2 MB: si no llega, el aviso sale sin él. */
    private static Bitmap descargar(String url) {
        if (url == null || !url.startsWith("https://")) return null;
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(url).openConnection();
            con.setConnectTimeout(5000);
            con.setReadTimeout(5000);
            if (con.getContentLength() > 2_000_000) return null;
            try (InputStream in = con.getInputStream()) {
                Bitmap b = BitmapFactory.decodeStream(in);
                if (b == null) return null;
                int lado = Math.min(b.getWidth(), b.getHeight());
                Bitmap cuadrado = Bitmap.createBitmap(b, (b.getWidth() - lado) / 2, (b.getHeight() - lado) / 2, lado, lado);
                return Bitmap.createScaledBitmap(cuadrado, 256, 256, true);
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (con != null) con.disconnect();
        }
    }
}
