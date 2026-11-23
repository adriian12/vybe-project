import UserNotifications

/// Extensión de avisos: si el aviso trae imagen (el logo del negocio que lo
/// manda, ver `logoDelNegocio` en supabase/functions/send-push), la descarga y
/// la adjunta, y iOS la enseña junto al aviso. Sin imagen, o si tarda o falla,
/// el aviso sale tal cual, con el icono de Fiestea.
///
/// Firebase deja la imagen en `fcm_options.image` (el servidor manda también
/// `mutable-content: 1`, sin el que esta extensión no se ejecuta).
class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNMutableNotificationContent?
    private var task: URLSessionDownloadTask?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        let content = (request.content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
        bestAttempt = content

        guard
            let options = content.userInfo["fcm_options"] as? [String: Any],
            let address = options["image"] as? String,
            let url = URL(string: address),
            url.scheme == "https"
        else {
            contentHandler(content)
            return
        }

        task = URLSession.shared.downloadTask(with: url) { [weak self] location, response, _ in
            guard let self = self else { return }
            if let location = location, let attachment = Self.attachment(from: location, response: response) {
                content.attachments = [attachment]
            }
            self.finish()
        }
        task?.resume()
    }

    /// iOS da unos 30 segundos; si se acaban, el aviso sale sin el logo.
    override func serviceExtensionTimeWillExpire() {
        task?.cancel()
        finish()
    }

    private func finish() {
        guard let handler = contentHandler, let content = bestAttempt else { return }
        contentHandler = nil
        handler(content)
    }

    /// El adjunto necesita un fichero con su extensión (png, jpg…).
    private static func attachment(from location: URL, response: URLResponse?) -> UNNotificationAttachment? {
        let mime = response?.mimeType ?? ""
        let ext: String
        switch mime {
        case "image/png": ext = "png"
        case "image/gif": ext = "gif"
        case "image/webp": ext = "webp"
        default: ext = "jpg"
        }
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(ext)
        do {
            try FileManager.default.moveItem(at: location, to: destination)
            return try UNNotificationAttachment(identifier: "logo", url: destination, options: nil)
        } catch {
            return nil
        }
    }
}
