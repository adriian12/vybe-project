import Capacitor
import UIKit

/// Controlador de la app: el de Capacitor más los plugins propios.
/// `Main.storyboard` lo usa en lugar de `CAPBridgeViewController`.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // Ubicación con aviso de «simulada» (migración 101).
        bridge?.registerPluginInstance(FiesteaLocationPlugin())
    }
}
