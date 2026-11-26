package com.vybe.app;

import android.content.pm.InstallSourceInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * De dónde viene esta instalación (migración 149), para que el recuento de
 * descargas no cuente a los robots de Google.
 *
 *   · `test`: Firebase Test Lab, donde Google prueba cada versión subida
 *     (informe previo al lanzamiento). Lo marca `firebase.test.lab`.
 *   · `store`: la instaló Google Play (`com.android.vending`).
 *   · `sideload`: cualquier otra cosa (el APK que se pasa a mano, adb…).
 */
@CapacitorPlugin(name = "FiesteaInstall")
public class FiesteaInstallPlugin extends Plugin {

    @PluginMethod
    public void getSource(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("source", fuente());
        call.resolve(ret);
    }

    private String fuente() {
        try {
            String lab = Settings.System.getString(getContext().getContentResolver(), "firebase.test.lab");
            if ("true".equals(lab)) return "test";
        } catch (Exception ignored) {
            // Sin acceso a los ajustes se mira sólo quién la instaló.
        }

        String instalador = null;
        try {
            PackageManager pm = getContext().getPackageManager();
            String paquete = getContext().getPackageName();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                InstallSourceInfo info = pm.getInstallSourceInfo(paquete);
                instalador = info.getInstallingPackageName();
            } else {
                instalador = pm.getInstallerPackageName(paquete);
            }
        } catch (Exception ignored) {
            // Sin instalador conocido cuenta como instalada a mano.
        }
        return "com.android.vending".equals(instalador) ? "store" : "sideload";
    }
}
