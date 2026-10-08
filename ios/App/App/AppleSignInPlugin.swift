import AuthenticationServices
import Capacitor
import CryptoKit
import Security

@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)]

    private var pendingCall: CAPPluginCall?
    private var authorizationController: ASAuthorizationController?
    private var nonce: String?
    private var state: String?
    private var anchor: UIWindow?

    public override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(credentialsRevoked),
            name: ASAuthorizationAppleIDProvider.credentialRevokedNotification, object: nil)
    }

    @objc private func credentialsRevoked() {
        notifyListeners("credentialsRevoked", data: [:], retainUntilConsumed: true)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc public func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard self.pendingCall == nil else {
                call.reject("An Apple sign-in is already in progress.", "IN_PROGRESS")
                return
            }
            guard let window = self.bridge?.viewController?.view.window else {
                call.reject("The app window is unavailable.", "UNAVAILABLE")
                return
            }
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
                call.reject("Unable to create a secure sign-in request.", "UNAVAILABLE")
                return
            }
            let rawNonce = bytes.map { String(format: "%02x", $0) }.joined()
            let state = UUID().uuidString
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = SHA256.hash(data: Data(rawNonce.utf8)).map { String(format: "%02x", $0) }.joined()
            request.state = state
            self.pendingCall = call
            self.nonce = rawNonce
            self.state = state
            self.anchor = window
            let controller = ASAuthorizationController(authorizationRequests: [request])
            self.authorizationController = controller
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Retained for the lifetime of the request; authorize requires a visible window.
        return anchor ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        defer { clearRequest() }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              credential.state == state, let nonce = nonce,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8), !token.isEmpty else {
            call.reject("Apple did not return a valid credential.", "INVALID_CREDENTIAL")
            return
        }
        guard let codeData = credential.authorizationCode,
              let code = String(data: codeData, encoding: .utf8), !code.isEmpty else {
            call.reject("Apple did not return an authorization code.", "INVALID_CREDENTIAL")
            return
        }
        var result: [String: Any] = ["identityToken": token, "nonce": nonce, "authorizationCode": code]
        if let components = credential.fullName {
            let name = PersonNameComponentsFormatter().string(from: components).trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty { result["fullName"] = name }
        }
        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { clearRequest() }
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        pendingCall?.reject(cancelled ? "Sign-in cancelled." : "Apple sign-in failed.", cancelled ? "CANCELED" : "AUTH_FAILED")
    }

    private func clearRequest() {
        pendingCall = nil
        authorizationController = nil
        nonce = nil
        state = nil
        anchor = nil
    }
}
