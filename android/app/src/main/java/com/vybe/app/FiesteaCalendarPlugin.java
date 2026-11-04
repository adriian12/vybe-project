package com.vybe.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.CalendarContract;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * «Al calendario» en Android: abre la pantalla de «Nuevo evento» del
 * calendario del móvil con la fiesta ya rellena, y la persona sólo pulsa
 * «Guardar». Antes se abría el `.ics` en el navegador, que enseñaba la URL de
 * Supabase y dejaba un fichero descargado que había que abrir a mano.
 *
 * Es un intent, no la API del calendario: no pide ningún permiso. Si el móvil
 * no tiene calendario, rechaza con `NO_CALENDAR` y la web vuelve al `.ics`.
 */
@CapacitorPlugin(name = "FiesteaCalendar")
public class FiesteaCalendarPlugin extends Plugin {

    @PluginMethod
    public void addEvent(PluginCall call) {
        String title = call.getString("title");
        Long start = call.getLong("start");
        Long end = call.getLong("end");
        if (title == null || start == null || end == null) {
            call.reject("BAD_EVENT");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, title)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start)
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end)
            .putExtra(CalendarContract.Events.EVENT_LOCATION, call.getString("location", ""))
            .putExtra(CalendarContract.Events.DESCRIPTION, call.getString("description", ""))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("NO_CALENDAR");
        }
    }
}
