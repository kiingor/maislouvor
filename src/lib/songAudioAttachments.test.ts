import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAdditionalAudioRequest } from "../../supabase/functions/import-song-audio/request";
import { audioImportError, importSongAudio, removeSongAudio, uploadSongAudio, validateAudioFile, type SongAudioAttachment } from "./songAudioAttachments";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(), remove: vi.fn(), insert: vi.fn(), single: vi.fn(),
  from: vi.fn(), invoke: vi.fn(), select: vi.fn(), eq: vi.fn(), delete: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: mocks.from, functions: { invoke: mocks.invoke },
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
} }));
const songId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "33333333-3333-4333-8333-333333333333";
const file = () => new File(["audio"], "Kit contralto.MP3", { type: "audio/mpeg" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(attachmentId);
  const query = { insert: mocks.insert, delete: mocks.delete, eq: mocks.eq, select: mocks.select, single: mocks.single };
  mocks.from.mockReturnValue(query);
  mocks.delete.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.upload.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.single.mockResolvedValue({ data: { audio_path: "new-path.mp3" }, error: null });
  mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
});

describe("additional audio persistence", () => {
  it("uploads to a unique attachment path without updating the song or stems", async () => {
    const audio = file();
    await uploadSongAudio(songId, teamId, " Contralto ", audio);
    const path = `${teamId}/${songId}/additional/${attachmentId}.mp3`;
    expect(mocks.upload).toHaveBeenCalledWith(path, audio, { contentType: "audio/mpeg", upsert: false });
    expect(mocks.insert).toHaveBeenCalledWith({ id: attachmentId, song_id: songId, title: "Contralto", audio_path: path });
    expect(mocks.from.mock.calls).toEqual([["song_audio_attachments"]]);
  });
  it("cleans only the newly uploaded file when persistence fails", async () => {
    mocks.insert.mockResolvedValue({ error: new Error("denied") });
    await expect(uploadSongAudio(songId, teamId, "Contralto", file())).rejects.toThrow("denied");
    expect(mocks.remove).toHaveBeenCalledWith([`${teamId}/${songId}/additional/${attachmentId}.mp3`]);
  });
  it("does not insert a row when upload fails", async () => {
    mocks.upload.mockResolvedValue({ error: new Error("storage") });
    await expect(uploadSongAudio(songId, teamId, "Contralto", file())).rejects.toThrow("storage");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("keeps storage intact when deletion is denied", async () => {
    mocks.single.mockResolvedValue({ error: new Error("denied") });
    await expect(removeSongAudio({ id: attachmentId } as SongAudioAttachment)).rejects.toThrow("denied");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("cleans the current file if an import completed after the list loaded", async () => {
    await removeSongAudio({ id: attachmentId, audio_path: null } as SongAudioAttachment);
    expect(mocks.remove).toHaveBeenCalledWith(["new-path.mp3"]);
  });
  it("uses the isolated YouTube endpoint and identifies retries", async () => {
    await importSongAudio(songId, "Tenor", "https://youtu.be/abcdefghijk?si=test", attachmentId);
    expect(mocks.invoke).toHaveBeenCalledWith("import-song-audio", { body: {
      song_id: songId, title: "Tenor", url: "https://www.youtube.com/watch?v=abcdefghijk", attachment_id: attachmentId,
    } });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects empty, oversized and non-audio files before any upload", async () => {
    expect(() => validateAudioFile(new File([], "empty.mp3"))).toThrow("vazio");
    expect(() => validateAudioFile(new File(["script"], "script.html", { type: "text/html" }))).toThrow("arquivo de áudio");
    expect(() => validateAudioFile({ name: "big.wav", type: "audio/wav", size: 50 * 1024 * 1024 + 1 } as File)).toThrow("50 MB");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe("store build (VITE_STORE_BUILD=1)", () => {
  beforeEach(() => { vi.stubEnv("VITE_STORE_BUILD", "1"); });
  afterEach(() => { vi.unstubAllEnvs(); });
  it("never asks the server to download from YouTube", async () => {
    await expect(importSongAudio(songId, "Tenor", "https://youtu.be/abcdefghijk", attachmentId)).rejects.toThrow("arquivo");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("explains failed imports without mentioning YouTube or its access", () => {
    expect(audioImportError("COOKIE_EXPIRED")).not.toMatch(/YouTube|administrador/);
    expect(audioImportError(null)).toMatch(/envie o arquivo/);
  });
});

describe("YouTube import validation", () => {
  it.each(["https://youtu.be/abcdefghijk", "https://www.youtube.com/watch?v=abcdefghijk", "https://m.youtube.com/shorts/abcdefghijk", "https://youtube.com/live/abcdefghijk", "https://youtube.com/embed/abcdefghijk"])("accepts and canonicalizes %s", (url) => {
    expect(parseAdditionalAudioRequest({ song_id: songId, title: " Voz ", url }).url).toBe("https://www.youtube.com/watch?v=abcdefghijk");
  });
  it.each(["http://youtube.com/watch?v=abcdefghijk", "https://youtube.com.evil.test/watch?v=abcdefghijk", "https://evilyoutube.com/watch?v=abcdefghijk", "https://youtube.com@evil.test/watch?v=abcdefghijk", "https://user:password@youtube.com/watch?v=abcdefghijk", "https://youtube.com:444/watch?v=abcdefghijk", "https://youtube.com/playlist?list=abcdefghijk", "https://youtu.be/short", "javascript:alert(1)"])("rejects %s", (url) => {
    expect(() => parseAdditionalAudioRequest({ song_id: songId, title: "Voz", url })).toThrow();
  });
  it("requires a valid song, title and retry ID", () => {
    for (const override of [{ song_id: "invalid" }, { title: " " }, { title: "x".repeat(121) }, { attachment_id: "invalid" }]) {
      expect(() => parseAdditionalAudioRequest({ song_id: songId, title: "Voz", url: "https://youtu.be/abcdefghijk", ...override })).toThrow();
    }
  });
});
