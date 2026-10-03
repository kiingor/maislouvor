import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { parseAdditionalAudioRequest } from "../../supabase/functions/import-song-audio/request";
import { youtubeImportEnabled } from "@/lib/storeBuild";

export type SongAudioAttachment = Database["public"]["Tables"]["song_audio_attachments"]["Row"];
export const attachmentQueryKey = (songId: string) => ["song-audio-attachments", songId];
export const AUDIO_ACCEPT = ".mp3,.m4a,.wav,.ogg,.flac,.aac,.webm,.mp4,.opus,audio/*";
const MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg",
  flac: "audio/flac", aac: "audio/aac", webm: "audio/webm", mp4: "audio/mp4", opus: "audio/ogg",
};

export function validateAudioFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!MIME_TYPES[extension] || (file.type && !file.type.startsWith("audio/")
    && !["video/mp4", "video/webm", "application/ogg", "application/octet-stream"].includes(file.type))) {
    throw new Error("Escolha um arquivo de áudio MP3, M4A, WAV, OGG, FLAC, AAC, WebM ou Opus.");
  }
  if (!file.size) throw new Error("O arquivo está vazio. Escolha outro áudio.");
  if (file.size > 50 * 1024 * 1024) throw new Error("Escolha um áudio de até 50 MB.");
  return { extension, contentType: MIME_TYPES[extension] };
}

export async function uploadSongAudio(songId: string, teamId: string, title: string, file: File) {
  const { extension, contentType } = validateAudioFile(file);
  if (!title.trim() || title.trim().length > 120) throw new Error("Informe um nome de até 120 caracteres.");
  const id = crypto.randomUUID();
  const path = `${teamId}/${songId}/additional/${id}.${extension}`;
  const bucket = supabase.storage.from("audio");
  const { error: uploadError } = await bucket.upload(path, file, { contentType, upsert: false });
  if (uploadError) throw uploadError;
  try {
    const { error } = await supabase.from("song_audio_attachments")
      .insert({ id, song_id: songId, title: title.trim(), audio_path: path });
    if (error) throw error;
  } catch (error) {
    await bucket.remove([path]).catch(() => {});
    throw error;
  }
}

export async function importSongAudio(songId: string, title: string, url: string, attachmentId?: string) {
  // Build das lojas: nenhuma tela chama isto; a trava garante que nada baixe do YouTube.
  if (!youtubeImportEnabled()) throw new Error("Envie o arquivo de áudio.");
  let input;
  try { input = parseAdditionalAudioRequest({ song_id: songId, title, url, attachment_id: attachmentId }); }
  catch { throw new Error("Informe um nome e um link HTTPS válido de um vídeo do YouTube."); }
  const { data, error } = await supabase.functions.invoke("import-song-audio", {
    body: { song_id: songId, title: input.title, url: input.url, ...(attachmentId ? { attachment_id: attachmentId } : {}) },
  });
  if (error || !data?.success) throw error || new Error(data?.error || "Não foi possível importar o áudio.");
}

export async function renameSongAudio(id: string, title: string) {
  const { error } = await supabase.from("song_audio_attachments")
    .update({ title: title.trim() }).eq("id", id).select("id").single();
  if (error) throw error;
}

export async function removeSongAudio(attachment: SongAudioAttachment) {
  const { data, error } = await supabase.from("song_audio_attachments")
    .delete().eq("id", attachment.id).select("audio_path").single();
  if (error) throw error;
  // The import may have finished since the list was rendered.
  if (!data.audio_path) return true;
  try {
    const { error: storageError } = await supabase.storage.from("audio").remove([data.audio_path]);
    return !storageError;
  } catch { return false; }
}

export function audioImportError(error: string | null) {
  if (!youtubeImportEnabled()) return "Este áudio não foi importado. Remova e envie o arquivo de áudio.";
  return /COOKIE_EXPIRED|cookies for the authentication|sign in to confirm|not a bot/i.test(error || "")
    ? "O acesso ao YouTube expirou. Avise o administrador para renovar e tente novamente."
    : "Não foi possível importar este áudio. Tente novamente ou envie o arquivo.";
}
