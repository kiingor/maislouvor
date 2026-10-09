import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  from: () => ({ update: mocks.update }),
} }));
import { newRecordingPath, saveTrimmedRecording } from "./recordingStorage";
beforeEach(() => {
  vi.clearAllMocks(); mocks.upload.mockResolvedValue({ error: null }); mocks.save.mockResolvedValue({ data: { id: "song" }, error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq }); mocks.eq.mockReturnValue({ eq: mocks.eq, select: mocks.select }); mocks.select.mockReturnValue({ maybeSingle: mocks.save });
});
describe("immutable recording publication", () => {
  it("uses distinct source objects and commits a cut against the expected old path", async () => {
    const first = newRecordingPath("team", "song", "MP3"), second = newRecordingPath("team", "song", "mp3");
    expect(first.path).not.toBe(second.path); expect(first.path).toMatch(/\.mp3$/);
    const path = await saveTrimmedRecording("team", "song", "old.wav", new Blob(["wav"]));
    expect(mocks.upload).toHaveBeenCalledWith(path, expect.any(Blob), { upsert: false, contentType: "audio/wav" });
    expect(mocks.eq).toHaveBeenCalledWith("audio_path", "old.wav"); expect(mocks.eq).toHaveBeenCalledWith("id", "song");
    expect(mocks.update).toHaveBeenCalledWith({ audio_path: path, audio_revision: expect.any(String) });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("never switches the database pointer after an upload failure", async () => {
    mocks.upload.mockResolvedValue({ error: new Error("upload failed") });
    await expect(saveTrimmedRecording("team", "song", "old.wav", new Blob())).rejects.toThrow("upload failed");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects a concurrent replacement without deleting either source", async () => {
    mocks.save.mockResolvedValue({ data: null, error: null });
    await expect(saveTrimmedRecording("team", "song", "old.wav", new Blob())).rejects.toThrow("A gravação mudou");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("preserves both objects when commit acknowledgement is lost", async () => {
    mocks.save.mockRejectedValue(new Error("timeout"));
    await expect(saveTrimmedRecording("team", "song", "old.wav", new Blob())).rejects.toThrow("timeout");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
