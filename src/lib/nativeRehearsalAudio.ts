import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeAudioState { time: number; playing: string[]; ended: boolean; duration: number; level?: number }
export interface NativeAudioBridge {
  reset(options: { session: string; onlyIfSession?: string }): Promise<void>;
  loadTrack(options: { session: string; id: string; url: string; master: boolean }): Promise<{ duration: number }>;
  prefetch(options: { session: string; url?: string }): Promise<void>;
  unloadTrack(options: { session: string; id: string }): Promise<void>;
  apply(options: { session: string; tracks: { id: string; playing: boolean; volume: number }[]; rate: number; pitch: number; time?: number }): Promise<NativeAudioState>;
  getState(options: { session: string }): Promise<NativeAudioState>;
}
const bridge = registerPlugin<NativeAudioBridge>("RehearsalAudio");
export const usesNativeRehearsalAudio = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

/** Media-element compatible controls for the existing rehearsal UI. The iOS
 * bridge receives one batched transport change for the whole mixer. Volume,
 * mute and solo never seek or restart the native player nodes. */
export class NativeRehearsalController {
  readonly session = crypto.randomUUID();
  readonly elements = new Set<NativeRehearsalAudio>();
  rate = 1;
  pitch = 0;
  private position = 0;
  private anchor = performance.now();
  private running = false;
  private revision = 0;
  private seek: number | undefined;
  private queued = false;
  private disposed = false;
  private timer?: ReturnType<typeof setInterval>;
  private initialized?: Promise<void>;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private api: NativeAudioBridge = bridge) {}
  private initialize() {
    return this.initialized ??= this.api.reset({ session: this.session });
  }
  get time() { return this.position + (this.running ? Math.max(0, performance.now() - this.anchor) / 1000 * this.rate : 0); }
  setTime(time: number) {
    this.position = Math.max(0, time);
    this.anchor = performance.now();
    this.seek = this.position;
    this.changed();
  }
  setRate(rate: number) {
    if (this.rate === rate) return;
    this.position = this.time;
    this.anchor = performance.now();
    this.rate = rate;
    this.changed();
  }
  setPitch(pitch: number) { this.pitch = pitch; this.changed(); }
  create(master: boolean) {
    if (master) this.setTime(0);
    const element = new NativeRehearsalAudio(this, master);
    this.elements.add(element);
    return element as unknown as HTMLAudioElement;
  }
  async load(element: NativeRehearsalAudio, url: string) {
    await this.initialize();
    if (this.disposed || !this.elements.has(element)) throw new Error("Carregamento cancelado");
    const result = await this.api.loadTrack({ session: this.session, id: element.id, url, master: element.master });
    if (!this.timer && !this.disposed) this.timer = setInterval(() => void this.poll(), 150);
    return result;
  }
  async prefetch(url: string | null) {
    await this.initialize();
    if (this.disposed) return;
    await this.api.prefetch({ session: this.session, ...(url ? { url } : {}) });
  }
  remove(element: NativeRehearsalAudio) {
    this.elements.delete(element);
    if (this.initialized) void this.initialized.then(() => this.api.unloadTrack({ session: this.session, id: element.id })).catch(() => {});
    this.changed();
  }
  changed() {
    this.revision++;
    if (this.queued || this.disposed) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (this.disposed) return;
      const revision = this.revision;
      const options = {
        session: this.session,
        tracks: Array.from(this.elements).filter(el => el.readyState >= 3).map(el => ({ id: el.id, playing: !el.paused, volume: el.muted ? 0 : el.volume })),
        rate: this.rate, pitch: this.pitch, ...(this.seek === undefined ? {} : { time: this.seek }),
      };
      this.seek = undefined;
      this.pending = this.pending.catch(() => {}).then(async () => {
        await this.initialize();
        if (this.disposed) return;
        try {
          const state = await this.api.apply(options);
          if (revision === this.revision) this.accept(state);
        } catch (error) {
          if (revision === this.revision) for (const el of this.elements) el.fail(error);
        }
      });
    });
  }
  private accept(state: NativeAudioState) {
    const revision = this.revision;
    this.position = state.time;
    this.anchor = performance.now();
    this.running = state.playing.length > 0;
    for (const el of this.elements) {
      // A timeupdate/ended listener may start the next loop. Do not apply the
      // completed transport state to elements it has just restarted.
      if (revision !== this.revision) break;
      if (el.readyState < 3) continue;
      if (el.seeking) { el.seeking = false; el.emit("seeked"); }
      if (!el.paused && !state.playing.includes(el.id)) {
        el.finish(state.ended);
      } else if (!el.paused) {
        el.emit("playing");
        el.emit("timeupdate");
      }
    }
  }
  private polling = false;
  private async poll() {
    if (this.polling || this.disposed || this.queued) return;
    this.polling = true;
    const revision = this.revision;
    try {
      // Keep native commands ordered; an old poll must not undo a recent Play.
      await this.pending;
      if (revision !== this.revision || this.disposed) return;
      const state = await this.api.getState({ session: this.session });
      if (revision === this.revision) this.accept(state);
    } catch { /* Loading/transport errors are surfaced by their own operations. */ }
    finally { this.polling = false; }
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    // Invalidate each in-flight load before resetting the bridge; its cancelled
    // promise must not emit a stale canplay/error on a screen already closed.
    for (const element of this.elements) element.src = "";
    this.elements.clear();
    if (this.initialized) void this.pending.finally(() => this.api.reset({ session: "", onlyIfSession: this.session })).catch(() => {});
  }
}

class NativeRehearsalAudio extends EventTarget {
  readonly id = crypto.randomUUID();
  readonly nativeRehearsal = true;
  crossOrigin = "anonymous";
  preload = "auto";
  duration = NaN;
  readyState = 0;
  paused = true;
  ended = false;
  seeking = false;
  error: { code: number; message: string } | null = null;
  private address = "";
  private gain = 1;
  private silent = false;
  private generation = 0;
  constructor(private controller: NativeRehearsalController, readonly master: boolean) { super(); }
  get src() { return this.address; }
  set src(value: string) {
    this.address = value;
    this.generation++;
    if (!value) { this.paused = true; this.readyState = 0; this.controller.remove(this); }
  }
  get currentSrc() { return this.address; }
  get currentTime() { return Number.isFinite(this.duration) ? Math.min(this.duration, this.controller.time) : 0; }
  set currentTime(value: number) {
    if (!Number.isFinite(value)) return;
    this.ended = false;
    this.seeking = true;
    this.emit("seeking");
    this.controller.setTime(value);
  }
  get playbackRate() { return this.controller.rate; }
  set playbackRate(value: number) { this.controller.setRate(value); }
  get volume() { return this.gain; }
  set volume(value: number) { this.gain = Math.min(1, Math.max(0, value)); this.controller.changed(); }
  get muted() { return this.silent; }
  set muted(value: boolean) { this.silent = value; this.controller.changed(); }
  load() {
    if (!this.address) return;
    const generation = this.generation;
    void this.controller.load(this, this.address).then(({ duration }) => {
      if (generation !== this.generation) return;
      this.duration = duration;
      this.readyState = 4;
      this.emit("loadedmetadata");
      this.emit("canplay");
      this.controller.changed();
    }).catch(error => { if (generation === this.generation) this.fail(error); });
  }
  async play() {
    if (this.ended) this.currentTime = 0;
    if (!this.paused) return;
    this.paused = false;
    this.ended = false;
    this.emit("play");
    if (this.readyState < 3) this.emit("waiting");
    this.controller.changed();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.emit("pause");
    this.controller.changed();
  }
  finish(ended: boolean) {
    this.paused = true;
    this.ended = ended;
    this.emit("timeupdate");
    this.emit(ended ? "ended" : "pause");
  }
  fail(error: unknown) {
    this.error = { code: 3, message: error instanceof Error ? error.message : "Não foi possível reproduzir o áudio." };
    this.paused = true;
    this.emit("error");
  }
  emit(event: string) { this.dispatchEvent(new Event(event)); }
}

export function isNativeRehearsalAudio(audio: HTMLAudioElement) {
  return (audio as unknown as { nativeRehearsal?: boolean }).nativeRehearsal === true;
}
