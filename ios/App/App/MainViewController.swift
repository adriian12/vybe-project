import Capacitor
import UIKit

/// Controlador de la app: el de Capacitor más los plugins propios.
/// `Main.storyboard` lo usa en lugar de `CAPBridgeViewController`.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // Ubicación con aviso de «simulada» (migración 101).
        bridge?.registerPluginInstance(FiesteaLocationPlugin())
        // De dónde viene la instalación (migración 149).
        bridge?.registerPluginInstance(FiesteaInstallPlugin())
    }
}

/// De dónde viene esta instalación (migración 149), para que el recuento de
/// descargas no cuente TestFlight ni la revisión de Apple: las dos llevan un
/// recibo de sandbox (`sandboxReceipt`); la App Store, uno normal. En el
/// simulador es `test`. Va en este fichero para no tocar el proyecto de Xcode.
@objc(FiesteaInstallPlugin)
public class FiesteaInstallPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FiesteaInstallPlugin"
    public let jsName = "FiesteaInstall"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSource", returnType: CAPPluginReturnPromise)
    ]

    @objc func getSource(_ call: CAPPluginCall) {
        #if targetEnvironment(simulator)
        call.resolve(["source": "test"])
        #else
        let recibo = Bundle.main.appStoreReceiptURL?.lastPathComponent
        call.resolve(["source": recibo == "sandboxReceipt" ? "testflight" : "store"])
        #endif
    }
}
