package com.vybe.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Ubicación con aviso de «simulada» (migración 101).
 *
 * Igual que el plugin de geolocalización, pero devuelve también si Android
 * marca la posición como simulada (`isMock`, o `isFromMockProvider` antes de
 * Android 12): las apps de ubicación falsa no sirven para entrar en una fiesta.
 * Los permisos los pide antes `@capacitor/geolocation`.
 */
@CapacitorPlugin(name = "FiesteaLocation")
public class FiesteaLocationPlugin extends Plugin {

    @PluginMethod
    public void getPosition(PluginCall call) {
        boolean fine = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            call.reject("LOCATION_DENIED");
            return;
        }

        boolean precisa = call.getBoolean("enableHighAccuracy", true);
        long timeout = call.getLong("timeout", 15000L);
        long maximumAge = call.getLong("maximumAge", 0L);

        FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(getContext());
        CancellationTokenSource cancelar = new CancellationTokenSource();
        AtomicBoolean hecho = new AtomicBoolean(false);

        CurrentLocationRequest peticion = new CurrentLocationRequest.Builder()
            .setPriority(precisa && fine ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY)
            .setMaxUpdateAgeMillis(maximumAge)
            .setDurationMillis(timeout)
            .build();

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (hecho.compareAndSet(false, true)) {
                cancelar.cancel();
                call.reject("LOCATION_TIMEOUT");
            }
        }, timeout + 1000);

        try {
            client
                .getCurrentLocation(peticion, cancelar.getToken())
                .addOnSuccessListener(location -> {
                    if (!hecho.compareAndSet(false, true)) return;
                    if (location == null) {
                        call.reject("LOCATION_UNAVAILABLE");
                        return;
                    }
                    call.resolve(aJson(location));
                })
                .addOnFailureListener(error -> {
                    if (hecho.compareAndSet(false, true)) call.reject("LOCATION_UNAVAILABLE");
                });
        } catch (SecurityException error) {
            if (hecho.compareAndSet(false, true)) call.reject("LOCATION_DENIED");
        }
    }

    private static JSObject aJson(Location location) {
        JSObject r = new JSObject();
        r.put("latitude", location.getLatitude());
        r.put("longitude", location.getLongitude());
        r.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : null);
        boolean simulada;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            simulada = location.isMock();
        } else {
            simulada = location.isFromMockProvider();
        }
        r.put("isMock", simulada);
        return r;
    }
}
