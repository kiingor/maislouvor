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
        CAPPluginMethod(name: "prefetch", returnType: CAPPluginReturnPromise),
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
    private final class Download {
        let token = UUID()
        var task: URLSessionDownloadTask?
        var waiters: [String: (Result<URL, Error>) -> Void] = [:]
    }
    private struct CachedFile {
        let url: URL
        let bytes: Int
        var used: UInt64
    }
    // Exact signed URLs, scoped to this rehearsal. No cache survives reset or
    // logout, and no song becomes readable through another team's file path.
    private var downloads: [String: Download] = [:]
    private var loading: [String: String] = [:]
    private var files: [String: CachedFile] = [:]
    private var cacheClock: UInt64 = 0
    private let cacheLimit = 96 * 1024 * 1024
    private var nextURL: URL?
    #if DEBUG
    private var downloadCount = 0
    private var cacheHits = 0
    #endif
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
        var result: [String: Any] = ["time": position, "playing": Array(active), "ended": ended, "level": level, "duration": duration]
        #if DEBUG
        result["cache"] = ["files": files.count, "bytes": files.values.reduce(0) { $0 + $1.bytes },
                           "downloads": downloads.count, "downloadCount": downloadCount, "hits": cacheHits,
                           "nextReady": nextURL.map { files[$0.absoluteString] != nil } ?? false] as [String: Any]
        #endif
        return result
    }
    private func valid(_ call: CAPPluginCall) -> Bool {
        guard call.getString("session") == sessionID else { call.reject("Audio session changed"); return false }
        return true
    }
    private func remove(_ id: String) {
        if let key = loading.removeValue(forKey: id), let download = downloads[key] {
            let cancelled = download.waiters.removeValue(forKey: id)
            if download.waiters.isEmpty && key != nextURL?.absoluteString {
                downloads.removeValue(forKey: key)?.task?.cancel()
            }
            cancelled?(.failure(NSError(domain: "RehearsalAudioCancelled", code: 1)))
        }
        guard let track = tracks.removeValue(forKey: id) else { return }
        track.node.stop()
        engine.disconnectNodeOutput(track.node)
        engine.detach(track.node)
        active.remove(id)
        trimCache()
    }

    private func trimCache() {
        // Active nodes are pinned. Evict the least recently used inactive files
        // first; the limit never interrupts playback or discards the next song.
        let pinned = Set(tracks.values.map(\.url))
        var total = files.values.reduce(0) { $0 + $1.bytes }
        for (key, file) in files.sorted(by: { $0.value.used < $1.value.used }) {
            if total <= cacheLimit { break }
            if pinned.contains(file.url) || key == nextURL?.absoluteString { continue }
            files.removeValue(forKey: key)
            try? FileManager.default.removeItem(at: file.url)
            total -= file.bytes
        }
    }

    private func audioURL(_ address: String?) -> URL? {
        guard let address, let url = URL(string: address),
              url.scheme == "https", url.host == "api.maislouvor.com",
              url.path.hasPrefix("/storage/v1/object/sign/audio/") else { return nil }
        return url
    }

    private func cancelUnusedPrefetch(except key: String? = nil) {
        for (address, download) in Array(downloads) where download.waiters.isEmpty && address != key {
            downloads.removeValue(forKey: address)
            download.task?.cancel()
        }
    }

    private func schedulePrefetch() {
        guard !tracks.isEmpty, loading.isEmpty, let url = nextURL,
              files[url.absoluteString] == nil, downloads[url.absoluteString] == nil else { return }
        fetchFile(url, consumer: nil, completion: nil)
    }

    private func fetchFile(_ url: URL, consumer: String?, completion: ((Result<URL, Error>) -> Void)?) {
        let key = url.absoluteString
        if var hit = files[key], FileManager.default.fileExists(atPath: hit.url.path) {
            #if DEBUG
            cacheHits += 1
            #endif
            cacheClock += 1; hit.used = cacheClock; files[key] = hit
            completion?(.success(hit.url))
            return
        }
        files.removeValue(forKey: key)
        if consumer != nil { cancelUnusedPrefetch(except: key) }
        if let download = downloads[key] {
            if let consumer, let completion {
                download.waiters[consumer] = completion
                download.task?.priority = URLSessionTask.highPriority
            }
            return
        }
        do {
            if directory == nil {
                let dir = FileManager.default.temporaryDirectory.appendingPathComponent("rehearsal-" + UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                directory = dir
            }
        } catch { completion?(.failure(error)); return }
        let destination = directory!.appendingPathComponent(UUID().uuidString).appendingPathExtension(url.pathExtension)
        let session = sessionID
        let download = Download()
        if let consumer, let completion { download.waiters[consumer] = completion }
        downloads[key] = download
        var request = URLRequest(url: url)
        request.timeoutInterval = 60
        let token = download.token
        #if DEBUG
        downloadCount += 1
        #endif
        download.task = URLSession.shared.downloadTask(with: request) { temporary, response, error in
            var downloaded = false
            if error == nil, let temporary, let response = response as? HTTPURLResponse, response.statusCode == 200 {
                do { try FileManager.default.moveItem(at: temporary, to: destination); downloaded = true } catch {}
            }
            DispatchQueue.main.async {
                guard session == self.sessionID, let current = self.downloads[key], current.token == token else {
                    try? FileManager.default.removeItem(at: destination); return
                }
                self.downloads.removeValue(forKey: key)
                let result: Result<URL, Error>
                if downloaded {
                    self.cacheClock += 1
                    let size = (try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                    self.files[key] = CachedFile(url: destination, bytes: size, used: self.cacheClock)
                    result = .success(destination)
                } else { result = .failure(error ?? NSError(domain: "RehearsalAudioDownload", code: 1)) }
                for waiter in current.waiters.values { waiter(result) }
                self.trimCache()
                // A failed speculative download is silent and is retried only
                // when selected. Never retry it in a background loop.
                if !current.waiters.isEmpty { self.schedulePrefetch() }
            }
        }
        download.task?.priority = consumer == nil ? URLSessionTask.lowPriority : URLSessionTask.highPriority
        download.task?.resume()
    }

    @objc func prefetch(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.valid(call) else { return }
            let address = call.getString("url")
            guard address == nil || self.audioURL(address) != nil else { call.reject("Invalid rehearsal audio source"); return }
            self.nextURL = self.audioURL(address)
            self.cancelUnusedPrefetch(except: self.nextURL?.absoluteString)
            self.trimCache()
            self.schedulePrefetch()
            call.resolve()
        }
    }

    @objc func reset(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // A stale screen's cleanup must not stop a newer rehearsal session.
            if let previous = call.getString("onlyIfSession"), previous != self.sessionID { call.resolve(); return }
            self.stop()
            self.engine.stop()
            self.nextURL = nil
            for download in self.downloads.values {
                download.task?.cancel()
                for waiter in download.waiters.values { waiter(.failure(NSError(domain: "RehearsalAudioCancelled", code: 1))) }
            }
            self.downloads.removeAll()
            self.loading.removeAll()
            for id in Array(self.tracks.keys) { self.remove(id) }
            self.files.removeAll()
            #if DEBUG
            self.downloadCount = 0
            self.cacheHits = 0
            #endif
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
                  let url = self.audioURL(call.getString("url")) else {
                call.reject("Invalid rehearsal audio source"); return
            }
            self.remove(id)
            self.loading[id] = url.absoluteString
            self.fetchFile(url, consumer: id) { result in
                self.loading.removeValue(forKey: id)
                switch result {
                case .failure:
                    call.reject("Não foi possível baixar o áudio. Verifique a conexão e abra o ensaio novamente.")
                case .success(let destination):
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
                        self.files.removeValue(forKey: url.absoluteString)
                        try? FileManager.default.removeItem(at: destination)
                        call.reject("Não foi possível abrir este arquivo de áudio.")
                    }
                }
            }
            self.schedulePrefetch()
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
