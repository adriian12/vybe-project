import Capacitor
import CoreLocation
import Foundation

/// Ubicación con aviso de «simulada» (migración 101), igual que
/// `FiesteaLocationPlugin.java` en Android.
///
/// Devuelve la posición y si iOS la marca como inventada por software
/// (`CLLocationSourceInformation.isSimulatedBySoftware`, iOS 15+): las apps y
/// los accesorios que falsean el GPS no sirven para entrar en una fiesta. El
/// permiso lo pide antes `@capacitor/geolocation`.
@objc(FiesteaLocationPlugin)
public class FiesteaLocationPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "FiesteaLocationPlugin"
    public let jsName = "FiesteaLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPosition", returnType: CAPPluginReturnPromise)
    ]

    private var manager: CLLocationManager?
    private var pendientes: [CAPPluginCall] = []

    @objc func getPosition(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let manager = self.manager ?? CLLocationManager()
            if self.manager == nil {
                manager.delegate = self
                self.manager = manager
            }

            let estado = manager.authorizationStatus
            guard estado == .authorizedWhenInUse || estado == .authorizedAlways else {
                call.reject("LOCATION_DENIED")
                return
            }

            let precisa = call.getBool("enableHighAccuracy") ?? true
            let timeout = call.getDouble("timeout") ?? 15000
            let maximumAge = call.getDouble("maximumAge") ?? 0

            // Una posición reciente vale si quien llama lo acepta (`maximumAge`).
            if maximumAge > 0, let ultima = manager.location,
               Date().timeIntervalSince(ultima.timestamp) * 1000 <= maximumAge {
                call.resolve(FiesteaLocationPlugin.aDatos(ultima))
                return
            }

            manager.desiredAccuracy = precisa ? kCLLocationAccuracyBest : kCLLocationAccuracyHundredMeters
            self.pendientes.append(call)
            manager.requestLocation()

            DispatchQueue.main.asyncAfter(deadline: .now() + timeout / 1000 + 1) { [weak self] in
                guard let self = self,
                      let indice = self.pendientes.firstIndex(where: { $0.callbackId == call.callbackId }) else { return }
                self.pendientes.remove(at: indice)
                call.reject("LOCATION_TIMEOUT")
            }
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let posicion = locations.last else { return }
        let llamadas = pendientes
        pendientes.removeAll()
        let datos = FiesteaLocationPlugin.aDatos(posicion)
        llamadas.forEach { $0.resolve(datos) }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let llamadas = pendientes
        pendientes.removeAll()
        llamadas.forEach { $0.reject("LOCATION_UNAVAILABLE") }
    }

    private static func aDatos(_ posicion: CLLocation) -> [String: Any] {
        var simulada = false
        if #available(iOS 15.0, *) {
            simulada = posicion.sourceInformation?.isSimulatedBySoftware ?? false
        }
        return [
            "latitude": posicion.coordinate.latitude,
            "longitude": posicion.coordinate.longitude,
            "accuracy": posicion.horizontalAccuracy,
            "isMock": simulada,
        ]
    }
}
