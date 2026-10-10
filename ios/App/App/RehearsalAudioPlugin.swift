import AVFAudio
import Capacitor

/// All rehearsal files share one AVAudioEngine timeline. Files stay compressed
/// on disk and are decoded incrementally by AVAudioPlayerNode, not six WebKit
/// media players or six full-length PCM buffers in the WebView's memory.
@objc(RehearsalAudioPlugin)
public class RehearsalAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RehearsalAudioPlugin"
    public let jsName = "RehearsalAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unloadTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "apply", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
    ]

    private struct Track {
        let file: AVAudioFile
        let url: URL
        let node: AVAudioPlayerNode
        let master: Bool
        var duration: Double { Double(file.length) / file.processingFormat.sampleRate }
    }
    private let engine = AVAudioEngine()
    private let mixer = AVAudioMixerNode()
    private let pitch = AVAudioUnitTimePitch()
    private var sessionID = ""
    private var tracks: [String: Track] = [:]
    private var downloads: [String: URLSessionDownloadTask] = [:]
    private var active: Set<String> = []
    private var offset = 0.0
    private var startedAt = 0.0
    private var rate = 1.0
    private var observers: [NSObjectProtocol] = []
    private var directory: URL?
    private var level: Float = 0

    public override func load() {
        // Remove only caches owned by this player after a previous app exit.
        let temporary = FileManager.default.temporaryDirectory
        if let old = try? FileManager.default.contentsOfDirectory(at: temporary, includingPropertiesForKeys: nil) {
            for path in old where path.lastPathComponent.hasPrefix("rehearsal-") { try? FileManager.default.removeItem(at: path) }
        }
        engine.attach(mixer)
        engine.attach(pitch)
        engine.connect(mixer, to: pitch, format: nil)
        engine.connect(pitch, to: engine.mainMixerNode, format: nil)
        #if DEBUG
        mixer.installTap(onBus: 0, bufferSize: 2048, format: nil) { [weak self] buffer, _ in
            guard let channel = buffer.floatChannelData?[0] else { return }
            var peak: Float = 0
            for i in 0..<Int(buffer.frameLength) { peak = max(peak, abs(channel[i])) }
            DispatchQueue.main.async { self?.level = peak }
        }
        #endif
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            if (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue { self?.stop() }
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            if (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { self?.stop() }
        })
        observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.stop() })
    }

    private var duration: Double {
        tracks.values.first(where: { $0.master })?.duration ?? tracks.values.map(\.duration).max() ?? 0
    }
    private var position: Double {
        let elapsed = active.isEmpty ? 0 : max(0, ProcessInfo.processInfo.systemUptime - startedAt) * rate
        return min(duration, max(0, offset + elapsed))
    }
    private func stop() {
        offset = position
        for track in tracks.values { track.node.stop() }
        active.removeAll()
        engine.pause()
        level = 0
    }
    private func state() -> [String: Any] {
        let ended = duration > 0 && position >= duration
        if ended || (!active.isEmpty && !engine.isRunning) { stop() }
        return ["time": position, "playing": Array(active), "ended": ended, "level": level, "duration": duration]
    }
    private func valid(_ call: CAPPluginCall) -> Bool {
        guard call.getString("session") == sessionID else { call.reject("Audio session changed"); return false }
        return true
    }
    private func remove(_ id: String) {
        downloads.removeValue(forKey: id)?.cancel()
        guard let track = tracks.removeValue(forKey: id) else { return }
        track.node.stop()
        engine.disconnectNodeOutput(track.node)
        engine.detach(track.node)
        active.remove(id)
        try? FileManager.default.removeItem(at: track.url)
    }

    @objc func reset(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // A stale screen's cleanup must not stop a newer rehearsal session.
            if let previous = call.getString("onlyIfSession"), previous != self.sessionID { call.resolve(); return }
            self.stop()
            self.engine.stop()
            for task in self.downloads.values { task.cancel() }
            self.downloads.removeAll()
            for id in Array(self.tracks.keys) { self.remove(id) }
            if let dir = self.directory { try? FileManager.default.removeItem(at: dir) }
            self.directory = nil
            self.offset = 0
            self.rate = 1
            self.pitch.rate = 1
            self.pitch.pitch = 0
            self.sessionID = call.getString("session") ?? ""
            call.resolve()
        }
    }

    @objc func loadTrack(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.valid(call), let id = call.getString("id"),
                  let address = call.getString("url"), let url = URL(string: address),
                  url.scheme == "https", url.host == "api.maislouvor.com",
                  url.path.hasPrefix("/storage/v1/object/sign/audio/") else {
                call.reject("Invalid rehearsal audio source"); return
            }
            self.remove(id)
            let session = self.sessionID
            do {
                if self.directory == nil {
                    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("rehearsal-" + UUID().uuidString, isDirectory: true)
                    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                    self.directory = dir
                }
            } catch { call.reject("Unable to prepare audio cache"); return }
            let destination = self.directory!.appendingPathComponent(UUID().uuidString).appendingPathExtension(url.pathExtension)
            var request = URLRequest(url: url)
            request.timeoutInterval = 60
            let task = URLSession.shared.downloadTask(with: request) { temporary, response, error in
                // URLSession's temporary file is deleted when this closure returns.
                var downloaded = false
                if error == nil, let temporary, let response = response as? HTTPURLResponse, response.statusCode == 200 {
                    do { try FileManager.default.moveItem(at: temporary, to: destination); downloaded = true } catch {}
                }
                DispatchQueue.main.async {
                    guard session == self.sessionID, self.downloads[id] != nil else {
                        try? FileManager.default.removeItem(at: destination)
                        call.reject("Audio loading cancelled"); return
                    }
                    self.downloads.removeValue(forKey: id)
                    guard downloaded else { call.reject("Não foi possível baixar o áudio. Verifique a conexão e abra o ensaio novamente."); return }
                    do {
                        let file = try AVAudioFile(forReading: destination)
                        guard file.length > 0 else { throw NSError(domain: "RehearsalAudio", code: 1) }
                        let node = AVAudioPlayerNode()
                        self.engine.attach(node)
                        self.engine.connect(node, to: self.mixer, format: file.processingFormat)
                        let track = Track(file: file, url: destination, node: node, master: call.getBool("master") ?? false)
                        self.tracks[id] = track
                        call.resolve(["duration": track.duration])
                    } catch {
                        try? FileManager.default.removeItem(at: destination)
                        call.reject("Não foi possível abrir este arquivo de áudio.")
                    }
                }
            }
            self.downloads[id] = task
            task.resume()
        }
    }

    @objc func unloadTrack(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.valid(call), let id = call.getString("id") else { return }
            self.remove(id)
            call.resolve()
        }
    }

    @objc func apply(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.valid(call) else { return }
            let items = call.getArray("tracks", JSObject.self) ?? []
            let desired = Set(items.filter { ($0["playing"] as? Bool) == true }.compactMap { $0["id"] as? String }).intersection(self.tracks.keys)
            let nextRate = min(2, max(0.5, call.getDouble("rate") ?? 1))
            let seek = call.getDouble("time")
            let mustSchedule = desired != self.active || seek != nil || nextRate != self.rate
            let time = seek ?? self.position
            if mustSchedule { self.stop(); self.offset = min(self.duration, max(0, time)); self.rate = nextRate }
            if self.pitch.rate != Float(nextRate) { self.pitch.rate = Float(nextRate) }
            let cents = Float(min(6, max(-6, call.getDouble("pitch") ?? 0)) * 100)
            if self.pitch.pitch != cents { self.pitch.pitch = cents }
            for item in items {
                if let id = item["id"] as? String, let track = self.tracks[id] {
                    track.node.volume = Float(min(1, max(0, item["volume"] as? Double ?? 1)))
                }
            }
            if mustSchedule && !desired.isEmpty {
                do {
                    let audioSession = AVAudioSession.sharedInstance()
                    try audioSession.setCategory(.playback, mode: .default)
                    try audioSession.setActive(true)
                    if !self.engine.isRunning { self.engine.prepare(); try self.engine.start() }
                    let delay = 0.06
                    let start = AVAudioTime(hostTime: mach_absolute_time() + AVAudioTime.hostTime(forSeconds: delay))
                    for id in desired {
                        guard let track = self.tracks[id] else { continue }
                        let frame = min(track.file.length, AVAudioFramePosition(self.offset * track.file.processingFormat.sampleRate))
                        let remaining = track.file.length - frame
                        guard remaining > 0 else { continue }
                        track.node.scheduleSegment(track.file, startingFrame: frame, frameCount: AVAudioFrameCount(min(Int64(UInt32.max), remaining)), at: nil)
                        track.node.play(at: start)
                    }
                    self.active = desired
                    self.startedAt = ProcessInfo.processInfo.systemUptime + delay
                } catch {
                    self.stop()
                    call.reject("Não foi possível iniciar a saída de áudio do iPhone.")
                    return
                }
            }
            call.resolve(self.state())
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.valid(call) else { return }
            call.resolve(self.state())
        }
    }
}
