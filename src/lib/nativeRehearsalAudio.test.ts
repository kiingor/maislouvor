import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeRehearsalController, type NativeAudioBridge, type NativeAudioState } from "./nativeRehearsalAudio";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function setup() {
  let state: NativeAudioState = { time: 0, playing: [], ended: false, duration: 120 };
  const api: NativeAudioBridge = {
    reset: vi.fn().mockResolvedValue(undefined),
    loadTrack: vi.fn().mockResolvedValue({ duration: 120 }),
    prefetch: vi.fn().mockResolvedValue(undefined),
    unloadTrack: vi.fn().mockResolvedValue(undefined),
    apply: vi.fn(async options => state = { ...state, time: options.time ?? state.time, playing: options.tracks.filter(t => t.playing).map(t => t.id), ended: false }),
    getState: vi.fn(async () => state),
  };
  const controller = new NativeRehearsalController(api);
  const master = controller.create(true);
  const stem = controller.create(false);
  master.src = "https://example.test/master.mp3";
  stem.src = "https://example.test/stem.mp3";
  master.load(); stem.load();
  return { api, controller, master, stem, setState: (value: Partial<NativeAudioState>) => { state = { ...state, ...value }; } };
}

afterEach(() => vi.useRealTimers());
describe("native rehearsal transport", () => {
  it("preloads without adding a player or changing the current transport", async () => {
    vi.useFakeTimers();
    const { api, controller, master, stem } = setup(); await flush();
    await master.play(); await stem.play(); await flush();
    vi.mocked(api.apply).mockClear();
    await controller.prefetch("https://example.test/next.mp3");
    expect(api.prefetch).toHaveBeenLastCalledWith({ session: controller.session, url: "https://example.test/next.mp3" });
    expect(api.apply).not.toHaveBeenCalled();
    expect(controller.elements.size).toBe(2);
    expect(master.paused).toBe(false);
    await controller.prefetch(null);
    expect(api.prefetch).toHaveBeenLastCalledWith({ session: controller.session });
    controller.dispose();
    vi.mocked(api.prefetch).mockClear();
    await controller.prefetch("https://example.test/stale.mp3");
    expect(api.prefetch).not.toHaveBeenCalled();
  });

  it("starts master and stems together and changes volume without seeking/restarting", async () => {
    vi.useFakeTimers();
    const { api, controller, master, stem } = setup();
    await flush();
    expect(master.duration).toBe(120);
    await master.play(); await stem.play(); await flush();
    const calls = vi.mocked(api.apply);
    expect(calls.mock.lastCall![0].tracks.filter(t => t.playing)).toHaveLength(2);
    calls.mockClear();
    stem.volume = 0.4; master.muted = true;
    await flush();
    expect(calls).toHaveBeenCalledTimes(1);
    const options = calls.mock.lastCall![0];
    expect(options).not.toHaveProperty("time");
    expect(options.tracks.map(t => t.volume)).toEqual([0, 0.4]);
    expect(options.tracks.every(t => t.playing)).toBe(true);
    expect(master.currentTime).toBeCloseTo(stem.currentTime, 2);
    controller.dispose();
  });

  it("batches loop seeks and preserves playback speed and pitch", async () => {
    vi.useFakeTimers();
    const { api, controller, master, stem } = setup(); await flush();
    master.playbackRate = 0.75; controller.setPitch(-2);
    master.currentTime = 42; stem.currentTime = 42;
    await master.play(); await stem.play(); await flush();
    expect(vi.mocked(api.apply).mock.calls.some(([options]) => options.time === 42 && options.rate === 0.75 && options.pitch === -2)).toBe(true);
    expect(stem.currentTime).toBeCloseTo(master.currentTime, 2);
    master.pause(); stem.pause(); await flush();
    expect(vi.mocked(api.apply).mock.lastCall![0].tracks.every(t => !t.playing)).toBe(true);
    controller.dispose();
  });

  it("handles an iOS interruption as a pause, without resuming by itself", async () => {
    vi.useFakeTimers();
    const { controller, master, stem, setState, api } = setup(); await flush();
    await master.play(); await stem.play(); await flush();
    const pause = vi.fn(); master.addEventListener("pause", pause);
    setState({ playing: [], time: 9 });
    await vi.advanceTimersByTimeAsync(200);
    expect(master.paused).toBe(true); expect(pause).toHaveBeenCalledTimes(1);
    const count = vi.mocked(api.apply).mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.mocked(api.apply).mock.calls.length).toBe(count);
    controller.dispose();
  });

  it("does not stop a loop restarted by the master's ended/timeupdate event", async () => {
    vi.useFakeTimers();
    const { controller, master, stem, setState } = setup(); await flush();
    await master.play(); await stem.play(); await flush();
    master.addEventListener("timeupdate", () => {
      if (!master.ended) return;
      master.currentTime = 10; stem.currentTime = 10;
      void master.play(); void stem.play();
    });
    setState({ playing: [], time: 120, ended: true });
    await vi.advanceTimersByTimeAsync(200); await flush();
    expect(master.paused).toBe(false); expect(stem.paused).toBe(false);
    expect(master.currentTime).toBeLessThan(11);
    controller.dispose();
  });

  it("discards a download that completes after changing songs", async () => {
    vi.useFakeTimers();
    const { api, controller } = setup(); await flush();
    let complete!: (value: { duration: number }) => void;
    vi.mocked(api.loadTrack).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const old = controller.create(false); old.src = "https://example.test/old.mp3";
    const ready = vi.fn(); old.addEventListener("canplay", ready); old.load(); await flush();
    old.src = ""; complete({ duration: 120 }); await flush();
    expect(ready).not.toHaveBeenCalled(); expect(api.unloadTrack).toHaveBeenCalled();
    controller.dispose(); await flush();
    expect(api.reset).toHaveBeenLastCalledWith({ session: "", onlyIfSession: controller.session });
  });

  it("does not report cancelled downloads after closing the rehearsal", async () => {
    vi.useFakeTimers();
    const { api, controller } = setup(); await flush();
    let reject!: (error: Error) => void;
    vi.mocked(api.loadTrack).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const track = controller.create(false); track.src = "https://example.test/pending.mp3";
    const error = vi.fn(); track.addEventListener("error", error); track.load(); await flush();
    controller.dispose(); reject(new Error("Audio loading cancelled")); await flush();
    expect(error).not.toHaveBeenCalled();
  });
});
