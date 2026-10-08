import Capacitor
import LocalAuthentication
import Security

@objc(BiometricSessionPlugin)
public class BiometricSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricSessionPlugin"
    public let jsName = "BiometricSession"
    public let pluginMethods: [CAPPluginMethod] = ["status", "read", "write", "enable", "unlock", "lock", "clear"].compactMap {
        CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)
    }
    private let queue = DispatchQueue(label: "com.maislouvor.biometric-session")
    private let service = "com.maislouvor.faceid-session"
    private let preference = "maislouvor.faceid.enabled"
    private var value: String?
    private var context: LAContext?
    private var authenticating = false
    private var generation = 0
    static weak var active: BiometricSessionPlugin?

    public override func load() { Self.active = self }
    private var enabled: Bool { UserDefaults.standard.bool(forKey: preference) }
    private func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
    }
    private func newContext() -> LAContext {
        let context = LAContext()
        context.localizedReason = "Use o Face ID para entrar no +Louvor."
        context.localizedCancelTitle = "Cancelar"
        context.localizedFallbackTitle = ""
        return context
    }
    @objc public func status(_ call: CAPPluginCall) {
        queue.async {
            let context = self.newContext()
            let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) && context.biometryType == .faceID
            call.resolve(["enabled": self.enabled, "available": available, "locked": self.enabled && self.value == nil])
        }
    }
    @objc public func read(_ call: CAPPluginCall) {
        queue.async { call.resolve(self.value.map { ["value": $0] } ?? [:]) }
    }
    private func save(_ key: String, _ value: String, _ context: LAContext) -> OSStatus {
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, nil) else { return errSecParam }
        var add = query(key)
        add[kSecAttrAccessControl as String] = access
        add[kSecUseAuthenticationContext as String] = context
        add[kSecValueData as String] = Data(value.utf8)
        let result = SecItemAdd(add as CFDictionary, nil)
        if result == errSecDuplicateItem {
            var match = query(key)
            match[kSecUseAuthenticationContext as String] = context
            // Reuse only the context authenticated during this foreground session.
            match[kSecUseAuthenticationUI as String] = kSecUseAuthenticationUIFail
            return SecItemUpdate(match as CFDictionary, [kSecValueData as String: Data(value.utf8)] as CFDictionary)
        }
        return result
    }
    @objc public func write(_ call: CAPPluginCall) {
        queue.async {
            guard self.enabled, let context = self.context, let key = call.getString("key"), let value = call.getString("value") else {
                call.reject("Unlock Face ID before saving the session.", "LOCKED"); return
            }
            guard self.save(key, value, context) == errSecSuccess else {
                call.reject("Unable to save the protected session.", "STORAGE_FAILED"); return
            }
            self.value = value
            call.resolve()
        }
    }
    @objc public func enable(_ call: CAPPluginCall) {
        queue.async {
            guard !self.authenticating, let key = call.getString("key"), let value = call.getString("value") else {
                call.reject("Invalid or concurrent request.", "UNAVAILABLE"); return
            }
            let context = self.newContext()
            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil), context.biometryType == .faceID else {
                call.reject("Face ID is unavailable.", "UNAVAILABLE"); return
            }
            self.authenticating = true
            let generation = self.generation
            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Ative o Face ID para entrar no +Louvor nas próximas vezes.") { success, _ in
                self.queue.async {
                    self.authenticating = false
                    guard success, generation == self.generation else { call.reject("Face ID was not confirmed.", "CANCELED"); return }
                    // A prior installation may have left an inaccessible biometric item.
                    if !self.enabled { SecItemDelete(self.query(key) as CFDictionary) }
                    guard self.save(key, value, context) == errSecSuccess else { call.reject("Unable to protect the session.", "STORAGE_FAILED"); return }
                    self.context = context
                    self.value = value
                    UserDefaults.standard.set(true, forKey: self.preference)
                    call.resolve()
                }
            }
        }
    }
    @objc public func unlock(_ call: CAPPluginCall) {
        queue.async {
            guard self.enabled, !self.authenticating, let key = call.getString("key") else { call.reject("Face ID is unavailable.", "UNAVAILABLE"); return }
            self.authenticating = true
            defer { self.authenticating = false }
            let context = self.newContext()
            var query = self.query(key)
            query[kSecUseAuthenticationContext as String] = context
            query[kSecReturnData as String] = true
            query[kSecMatchLimit as String] = kSecMatchLimitOne
            var result: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
                call.reject("Face ID did not unlock the session.", status == errSecUserCanceled ? "CANCELED" : "AUTH_FAILED"); return
            }
            self.context = context
            self.value = value
            call.resolve()
        }
    }
    func lockInMemory() {
        queue.async {
            self.generation += 1
            self.context?.invalidate()
            self.context = nil
            self.value = nil
        }
    }
    @objc public func lock(_ call: CAPPluginCall) {
        lockInMemory()
        queue.async { call.resolve() }
    }
    @objc public func clear(_ call: CAPPluginCall) {
        queue.async {
            guard let key = call.getString("key") else { call.reject("Missing key."); return }
            let result = SecItemDelete(self.query(key) as CFDictionary)
            guard result == errSecSuccess || result == errSecItemNotFound else { call.reject("Unable to remove the session.", "STORAGE_FAILED"); return }
            self.generation += 1
            self.context?.invalidate()
            self.context = nil
            self.value = nil
            UserDefaults.standard.set(false, forKey: self.preference)
            call.resolve()
        }
    }
}
