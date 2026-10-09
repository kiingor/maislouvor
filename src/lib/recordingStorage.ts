import { supabase } from "@/integrations/supabase/client";

/** New objects leave the currently published recording readable until DB commit. */
export function newRecordingPath(teamId: string, songId: string, extension: string, revision = crypto.randomUUID()) {
  const ext = /^[a-z0-9]{1,8}$/i.test(extension) ? extension.toLowerCase() : "bin";
  return { path: `${teamId}/${songId}/recordings/${revision}.${ext}`, revision };
}

export async function saveTrimmedRecording(teamId: string, songId: string, expectedPath: string, wav: Blob) {
  const { path, revision } = newRecordingPath(teamId, songId, "wav");
  const { error: uploadError } = await supabase.storage.from("audio").upload(path, wav, {
    upsert: false, contentType: "audio/wav",
  });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("songs").update({
    audio_path: path, audio_revision: revision,
  } as never).eq("id", songId).eq("audio_path", expectedPath).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("A gravação mudou. Atualize a música antes de cortar novamente.");
  // Never remove the former object here: a queued worker or signed player may
  // still be reading it. An ambiguous commit also makes catch-time cleanup unsafe.
  return path;
}
