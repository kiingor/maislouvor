#!/usr/bin/env python3
"""
+Louvor — GPU stem-separation worker (pull model).

Runs on a machine with an NVIDIA GPU (e.g. an RTX 3070). It POLLS the Supabase
queue (table public.stem_jobs), separates the audio with Demucs on the GPU,
uploads the stems back to Supabase Storage and records the tracks.

Because it PULLS work (outbound HTTPS only), the PC needs no open ports / public
IP. If the PC is offline, jobs just stay 'queued' in the database until it comes
back (or until the VPS CPU fallback picks them up). Nothing is lost.

Config via environment, or a .env file placed next to this script:
  SUPABASE_URL     e.g. https://api.maislouvor.com
  SERVICE_KEY      Supabase service_role key (server secret — keep it safe!)
  WORKER_NAME      default "gpu-home"
  DEMUCS_MODEL     default "htdemucs_6s"
  DEMUCS_SEGMENT   default "7"     (keeps VRAM low on 8 GB cards; "" = model default)
  DEVICE           default "auto"  ("auto" picks cuda > mps > cpu; or force
                                    "cuda" | "mps" | "cpu" — an unavailable
                                    device degrades instead of crashing)
  POLL_INTERVAL    default "3"     (seconds between polls when idle)
"""
import os

# Apple Silicon (MPS): let any op Metal doesn't implement fall back to the CPU
# instead of raising. Must be set BEFORE torch is imported.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import re
import sys
import time
import glob
import shutil
import hashlib
import uuid
import tempfile
import pathlib
import subprocess
from concurrent.futures import ThreadPoolExecutor

import requests


def _load_dotenv():
    p = pathlib.Path(__file__).with_name(".env")
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_dotenv()

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SERVICE_KEY"]
WORKER = os.environ.get("WORKER_NAME", "gpu-home")
MODEL = os.environ.get("DEMUCS_MODEL", "htdemucs_6s")
SEGMENT = os.environ.get("DEMUCS_SEGMENT", "7")
DEVICE = os.environ.get("DEVICE", "auto")
POLL = int(os.environ.get("POLL_INTERVAL", "3"))
WORKER_KIND = os.environ.get("WORKER_KIND", "gpu")          # 'gpu' (home) | 'cpu' (vps)
FALLBACK = os.environ.get("FALLBACK", "0") == "1"           # vps: only claim if GPU is absent/late
FALLBACK_GRACE = int(os.environ.get("FALLBACK_GRACE", "90"))  # seconds to let the GPU grab a job first
YT_ENABLED = os.environ.get("YT_ENABLED", "0") == "1"        # also handle YouTube-import jobs (home only)

STEMS = [
    ("vocals", "Vocais"), ("drums", "Bateria"), ("bass", "Baixo"),
    ("guitar", "Guitarra"), ("piano", "Teclado"), ("other", "Outros"),
]

H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
HSTORAGE = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


def rpc(fn, payload):
    r = requests.post(f"{URL}/rest/v1/rpc/{fn}", headers=H, json=payload, timeout=30)
    r.raise_for_status()
    return r.json() if r.text.strip() else None


def heartbeat():
    try:
        rpc("worker_heartbeat", {"p_worker": WORKER, "p_kind": WORKER_KIND})
    except Exception as e:
        log("heartbeat failed:", e)


def claim(min_age=0):
    try:
        j = rpc("claim_stem_job_v2", {"p_worker": WORKER, "p_min_age_seconds": min_age})
    except Exception as e:
        log("claim failed:", e)
        return None
    if isinstance(j, list):
        j = j[0] if j else None
    # When the queue is empty, the RPC returns a composite row of all-NULLs
    # (not a bare null), so treat a missing id as "no job".
    if not j or not j.get("id"):
        return None
    return j


def patch(table, params, body):
    r = requests.patch(f"{URL}/rest/v1/{table}", headers={**H, "Prefer": "return=minimal"},
                       params=params, json=body, timeout=30)
    r.raise_for_status()


def insert(table, body):
    r = requests.post(f"{URL}/rest/v1/{table}", headers={**H, "Prefer": "return=minimal"},
                      json=body, timeout=30)
    r.raise_for_status()


def upsert_ignore(table, body, on_conflict):
    """INSERT que ignora conflito de PK (idempotente) — usado no acervo do YouTube."""
    r = requests.post(f"{URL}/rest/v1/{table}",
                      headers={**H, "Prefer": "resolution=ignore-duplicates,return=minimal"},
                      params={"on_conflict": on_conflict}, json=body, timeout=30)
    if r.status_code not in (200, 201, 204, 409):
        raise RuntimeError(f"upsert {table} -> {r.status_code} {r.text[:200]}")


def extract_youtube_id(url):
    """ID de 11 chars do vídeo (watch?v=, youtu.be/, embed/, shorts/, live/)."""
    m = re.search(r'(?:v=|youtu\.be/|/embed/|/shorts/|/live/)([A-Za-z0-9_-]{11})', url or "")
    return m.group(1) if m else None


def select(table, params):
    r = requests.get(f"{URL}/rest/v1/{table}", headers=H, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def storage_remove(path, bucket="audio"):
    try:
        requests.delete(f"{URL}/storage/v1/object/{bucket}/{path}", headers=HSTORAGE, timeout=30)
    except Exception:
        pass


def storage_copy(src, dest, bucket="audio"):
    """Cópia server-side dentro do bucket (sem download/upload) — usada no acervo de stems.
    O copy não sobrescreve, então remove o destino antes (caso de re-separação)."""
    storage_remove(dest, bucket)
    r = requests.post(f"{URL}/storage/v1/object/copy",
                      headers={**HSTORAGE, "Content-Type": "application/json"},
                      json={"bucketId": bucket, "sourceKey": src, "destinationKey": dest}, timeout=60)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"copy {src} -> {dest} {r.status_code} {r.text[:200]}")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def delete(table, params):
    r = requests.delete(f"{URL}/rest/v1/{table}", headers={**H, "Prefer": "return=minimal"},
                        params=params, timeout=30)
    r.raise_for_status()


def storage_download(path, dest):
    with requests.get(f"{URL}/storage/v1/object/audio/{path}", headers=HSTORAGE,
                      timeout=300, stream=True) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 16):
                f.write(chunk)


def storage_upload(path, data, bucket="audio", content_type="audio/mpeg"):
    r = requests.post(f"{URL}/storage/v1/object/{bucket}/{path}",
                      headers={**HSTORAGE, "Content-Type": content_type, "x-upsert": "true"},
                      data=data, timeout=300)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"upload {path} -> {r.status_code} {r.text[:200]}")


# --- Demucs loaded once (model stays resident on the device between jobs) ---
NET = None  # the loaded Demucs model


def load_net():
    """Load the model once at startup and keep it on DEVICE."""
    global NET
    from demucs.pretrained import get_model
    NET = get_model(MODEL)
    NET.to(DEVICE)
    NET.eval()


def separate_file(infile, outdir):
    """In-process separation — byte-for-parameter identical to the demucs CLI
    (same model, shifts=1, overlap=0.25, segment, normalization, mp3 320/preset 2)."""
    import torch as th
    from demucs.apply import apply_model
    from demucs.audio import save_audio
    from demucs.separate import load_track

    wav = load_track(str(infile), NET.audio_channels, NET.samplerate)
    ref = wav.mean(0)
    wav = (wav - ref.mean()) / ref.std()
    seg = int(SEGMENT) if SEGMENT else None
    with th.no_grad():
        sources = apply_model(
            NET, wav[None], device=DEVICE, shifts=1, split=True,
            overlap=0.25, segment=seg, progress=False, num_workers=0,
        )[0]
    sources = sources * ref.std() + ref.mean()
    kwargs = {"samplerate": NET.samplerate, "bitrate": 320, "preset": 2,
              "clip": "rescale", "as_float": False, "bits_per_sample": 16}
    outdir.mkdir(parents=True, exist_ok=True)
    for source, name in zip(sources, NET.sources):
        save_audio(source, str(outdir / f"{name}.mp3"), **kwargs)


def process(job):
    """Stage immutable outputs; commit only through the versioned DB fence."""
    jid = job["id"]
    work = pathlib.Path(tempfile.mkdtemp(prefix="louvor_"))
    # An ambiguous finalization timeout must keep staged files: the DB may have
    # committed. Orphans can be reconciled later, never by blind cleanup here.
    try:
        context = rpc("stem_job_context", {"p_job_id": jid, "p_worker": WORKER})
        if not context or not context.get("allowed"):
            rpc("finish_stem_job", {"p_job_id": jid, "p_worker": WORKER, "p_tracks": None})
            return
        song, team, audio = context["song_id"], context["team_id"], context["audio_path"]
        prefix = f"{team}/{song}/stems/{jid}/{uuid.uuid4().hex}"
        infile = work / ("audio" + (os.path.splitext(audio)[1] or ".mp3"))
        storage_download(audio, infile)
        sha = sha256_file(infile)
        try:
            cached = select("stem_cache", {"audio_sha256": f"eq.{sha}", "model": f"eq.{MODEL}",
                                           "select": "stems", "limit": "1"})
        except Exception:
            cached = []
        produced = []
        if cached:
            # Cache contains only key metadata; never trust paths or labels.
            keys = {st.get("key") for st in cached[0].get("stems", []) if isinstance(st, dict)}
            for key, label in STEMS:
                if key in keys:
                    local = work / f"{key}.mp3"
                    storage_download(f"_stemcache/{sha}/{key}.mp3", local)
                    if local.stat().st_size == 0:
                        raise RuntimeError("Empty cached stem")
                    produced.append((key, label, str(local)))
        else:
            outdir = work / "out"
            separate_file(infile, outdir)
            for key, label in STEMS:
                matches = glob.glob(str(outdir / "**" / f"{key}.mp3"), recursive=True)
                if matches and pathlib.Path(matches[0]).stat().st_size:
                    produced.append((key, label, matches[0]))
        if not produced:
            raise RuntimeError("No stems produced")
        # Recheck before upload; final RPC checks again after upload under locks.
        context = rpc("stem_job_context", {"p_job_id": jid, "p_worker": WORKER})
        if not context or not context.get("allowed"):
            rpc("finish_stem_job", {"p_job_id": jid, "p_worker": WORKER, "p_tracks": None})
            return

        def _upload(item):
            key, _label, path = item
            dest = f"{prefix}/{key}.mp3"
            with open(path, "rb") as f:
                storage_upload(dest, f.read())
            return {"key": key, "audio_path": dest}

        with ThreadPoolExecutor(max_workers=6) as ex:
            tracks = list(ex.map(_upload, produced))
        result = rpc("finish_stem_job", {"p_job_id": jid, "p_worker": WORKER, "p_tracks": tracks})
        if not result or not result.get("applied"):
            log("stem result ignored: job no longer current")
            return
        log(f"separation completed ({len(tracks)} stems)")
        # Cache population remains optional and only follows accepted completion.
        if not cached:
            try:
                for key, _label, path in produced:
                    with open(path, "rb") as f:
                        storage_upload(f"_stemcache/{sha}/{key}.mp3", f.read())
                upsert_ignore("stem_cache", {"audio_sha256": sha, "model": MODEL,
                    "stems": [{"key": k, "label": l} for k, l, _ in produced]}, "audio_sha256,model")
            except Exception:
                log("stem cache store failed (non-fatal)")
    except Exception:
        log("separation failed; existing tracks preserved")
        try:
            rpc("finish_stem_job", {"p_job_id": jid, "p_worker": WORKER, "p_tracks": None})
        except Exception:
            log("could not finalize job failure; reconciliation required")
    finally:
        shutil.rmtree(work, ignore_errors=True)


def claim_yt():
    try:
        j = rpc("claim_yt_job", {"p_worker": WORKER})
    except Exception as e:
        log("yt claim failed:", e)
        return None
    if isinstance(j, list):
        j = j[0] if j else None
    if not j or not j.get("id"):
        return None
    return j


def claim_additional_audio():
    try:
        return rpc("claim_song_audio_import", {}) or None
    except Exception as e:
        log("additional audio claim failed:", e)
        return None


def process_yt(job):
    jid, song, team, yturl = job["id"], job["song_id"], job["team_id"], job["url"]
    attachment_id = job.get("attachment_id")
    log(f"YT import {jid[:8]}  song={song[:8]}  url={yturl}")
    work = pathlib.Path(tempfile.mkdtemp(prefix="louvor_yt_"))
    try:
        path = (f"{team}/{song}/additional/{attachment_id}.mp3" if attachment_id
                else f"{team}/{song}/recordings/{uuid.uuid4().hex}.mp3")
        if attachment_id:
            # Separate queue, destination and completion: never touch songs or stems.
            if not select("song_audio_attachments", {"id": f"eq.{attachment_id}",
                          "song_id": f"eq.{song}", "status": "eq.processing", "select": "id"}):
                return  # removed while waiting for the worker
            yt_id = extract_youtube_id(yturl)
            cached = select("yt_audio_cache", {"youtube_id": f"eq.{yt_id}",
                            "select": "storage_path", "limit": "1"})
            if cached and cached[0].get("storage_path"):
                try:
                    storage_copy(cached[0]["storage_path"], path)
                except Exception as ce:
                    log("additional audio cache miss:", ce)
                else:
                    if not rpc("complete_song_audio_import", {"p_id": attachment_id, "p_path": path}):
                        storage_remove(path)
                    return
        out_tmpl = str(work / "audio.%(ext)s")
        cmd = [sys.executable, "-m", "yt_dlp",
               "--no-plugin-dirs",
               "-f", "bestaudio/best",
               "-x", "--audio-format", "mp3",
               "--audio-quality", "0", "--no-playlist",
               "--write-thumbnail", "--convert-thumbnails", "jpg"]
        js = os.environ.get("YT_JS_RUNTIME", "node")  # YouTube now needs a JS runtime
        if js:
            cmd += ["--js-runtimes", js]
        # Optional cookies file (Netscape format) — the reliable way around YouTube's
        # anti-bot. Export once from a logged-in browser and set YT_COOKIES_FILE.
        cookies = os.environ.get("YT_COOKIES_FILE", "")
        if cookies and os.path.exists(cookies):
            cmd += ["--cookies", cookies]
        # Or read cookies straight from an installed browser profile, no manual export —
        # e.g. YT_COOKIES_FROM_BROWSER=firefox (or chrome, edge, brave). On Windows a
        # running Chrome/Edge can lock/encrypt its cookie DB (App-Bound Encryption); if so,
        # close that browser or use Firefox. Format also accepts "firefox:ProfileName".
        browser_cookies = os.environ.get("YT_COOKIES_FROM_BROWSER", "")
        if browser_cookies and not (cookies and os.path.exists(cookies)):
            cmd += ["--cookies-from-browser", browser_cookies]
        # The PyPI "default" dependency group installs the matching EJS scripts locally.
        # Remote components remain available only as an explicit operational override.
        rc = os.environ.get("YT_REMOTE_COMPONENTS", "")
        if rc:
            cmd += ["--remote-components", rc]
        # Let current yt-dlp choose the client. Forcing web/mweb together with the old
        # bgutil PO-token plugin started returning 403 for otherwise public videos.
        pc = os.environ.get("YT_PLAYER_CLIENT", "")
        if pc:
            cmd += ["--extractor-args", f"youtube:player_client={pc}"]
        cmd += ["-o", out_tmpl, yturl]
        log("running yt-dlp…")
        t0 = time.time()
        # Capture output so yt-dlp's stderr warnings don't bubble up to the PowerShell
        # launcher (which would otherwise treat native stderr as a terminating error).
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=int(os.environ.get("YT_TIMEOUT", "600")))
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "yt-dlp falhou").strip()
            low = err.lower()
            # Cookie/login do YouTube expirou → só o administrador renova o yt-cookies.txt.
            # Marca com um código estável que o frontend reconhece p/ mostrar aviso claro.
            auth_markers = ("sign in to confirm", "not a bot", "cookies for the authentication",
                            "--cookies", "login required", "please sign in", "account cookies")
            if any(m in low for m in auth_markers):
                raise RuntimeError(
                    "COOKIE_EXPIRED: O acesso ao YouTube expirou. "
                    "Avise o administrador do app para renovar o login (cookies).")
            raise RuntimeError(err[-300:])
        mp3s = glob.glob(str(work / "*.mp3"))
        if not mp3s:
            raise RuntimeError("yt-dlp não gerou mp3")
        with open(mp3s[0], "rb") as f:
            data = f.read()
        storage_upload(path, data)
        if attachment_id:
            if not rpc("complete_song_audio_import", {"p_id": attachment_id, "p_path": path}):
                storage_remove(path)
                return
        else:
            patch("songs", {"id": f"eq.{song}"}, {"audio_path": path})

        yt_id = extract_youtube_id(yturl)

        # ---- Capa: usa o thumbnail do YouTube como capa da música (se ela não tiver) ----
        cover_cache_path = None
        try:
            thumbs = (glob.glob(str(work / "*.jpg")) + glob.glob(str(work / "*.png"))
                      + glob.glob(str(work / "*.webp")))
            if thumbs:
                ext = "png" if thumbs[0].lower().endswith(".png") else (
                    "webp" if thumbs[0].lower().endswith(".webp") else "jpg")
                ctype = {"png": "image/png", "webp": "image/webp", "jpg": "image/jpeg"}[ext]
                with open(thumbs[0], "rb") as f:
                    cover_data = f.read()
                # Só define se a música ainda não tem capa (não sobrescreve a manual).
                cur = select("songs", {"id": f"eq.{song}", "select": "cover_path", "limit": "1"}) if not attachment_id else None
                if not attachment_id and not (cur and cur[0].get("cover_path")):
                    cover_key = f"{team}/{song}.{ext}"
                    storage_upload(cover_key, cover_data, bucket="covers", content_type=ctype)
                    patch("songs", {"id": f"eq.{song}"}, {"cover_path": cover_key})
                    log(f"YT import {jid[:8]} capa definida -> {cover_key}")
                # Arquiva a capa no acervo (keyed pelo vídeo) p/ cache hits também terem capa.
                if yt_id:
                    cover_cache_path = f"_ytcache/{yt_id}.{ext}"
                    storage_upload(cover_cache_path, cover_data, bucket="covers", content_type=ctype)
        except Exception as ce:
            log("cover store failed (non-fatal):", ce)

        # Arquiva o ÁUDIO no acervo global (keyed pelo ID do vídeo): próximos imports do
        # MESMO vídeo — de qualquer conta — só copiam em vez de baixar de novo.
        if yt_id:
            try:
                cache_path = f"_ytcache/{yt_id}.mp3"
                storage_upload(cache_path, data)
                body = {"youtube_id": yt_id, "storage_path": cache_path}
                if cover_cache_path:
                    body["cover_path"] = cover_cache_path
                upsert_ignore("yt_audio_cache", body, "youtube_id")
                log(f"YT import {jid[:8]} arquivado no acervo: {yt_id}")
            except Exception as ce:
                log("yt cache store failed (non-fatal):", ce)
        if not attachment_id:
            patch("yt_import_jobs", {"id": f"eq.{jid}"}, {"status": "done"})
        log(f"YT import {jid[:8]} DONE in {int(time.time() - t0)}s -> {path}")
    except Exception as e:
        log("YT import FAILED:", e)
        try:
            if attachment_id:
                patch("song_audio_attachments", {"id": f"eq.{attachment_id}", "status": "eq.processing"},
                      {"status": "error", "error": str(e)[:300]})
            else:
                patch("yt_import_jobs", {"id": f"eq.{jid}"}, {"status": "error", "error": str(e)[:300]})
        except Exception as e2:
            log("could not mark yt error:", e2)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def resolve_device(requested):
    """Pick the accelerator to run on: NVIDIA (cuda), Apple Silicon (mps) or cpu.

    'auto' takes the best available. An explicitly requested device that isn't
    present degrades to the next best one instead of crashing, so the same
    worker.py runs unchanged on the Windows/RTX box and on the Mac mini."""
    try:
        import torch
    except Exception as e:
        log("torch check skipped:", e)
        return "cpu" if requested == "auto" else requested

    has_cuda = torch.cuda.is_available()
    has_mps = getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available()

    if requested == "auto":
        dev = "cuda" if has_cuda else ("mps" if has_mps else "cpu")
    elif requested == "cuda" and not has_cuda:
        dev = "mps" if has_mps else "cpu"
        log(f"WARNING: CUDA not available — using {dev}.")
    elif requested == "mps" and not has_mps:
        dev = "cuda" if has_cuda else "cpu"
        log(f"WARNING: MPS not available — using {dev}.")
    else:
        dev = requested

    if dev == "cuda":
        log("GPU:", torch.cuda.get_device_name(0))
    elif dev == "mps":
        log("GPU: Apple Silicon (Metal / MPS)")
    else:
        log("WARNING: running on the CPU — separation will be slow.")
    return dev


def main():
    global DEVICE
    DEVICE = resolve_device(DEVICE)

    log(f"loading model '{MODEL}' on {DEVICE}…")
    t0 = time.time()
    load_net()
    log(f"model ready in {int(time.time() - t0)}s (stays resident — no per-job reload)")

    # Warm up the GPU/CUDA kernels at startup (idle time) so the FIRST real job
    # isn't slowed by one-off kernel compilation. No effect on output quality.
    try:
        import torch as th
        from demucs.apply import apply_model
        seg = int(SEGMENT) if SEGMENT else None
        dummy = th.zeros(NET.audio_channels, NET.samplerate, dtype=th.float32)
        with th.no_grad():
            apply_model(NET, dummy[None], device=DEVICE, shifts=1, split=True,
                        overlap=0.25, segment=seg, progress=False, num_workers=0)
        log("warmed up — first job will be fast")
    except Exception as e:
        log("warmup skipped:", e)

    log(f"+Louvor worker '{WORKER}'  model={MODEL}  device={DEVICE}  ->  {URL}")
    log("polling for jobs… (Ctrl+C to stop)")
    while True:
        heartbeat()
        grace = 0
        if FALLBACK:
            # VPS fallback: give an online GPU a head start; if no GPU heartbeat, take it now.
            try:
                grace = FALLBACK_GRACE if rpc("gpu_worker_alive", {"p_within_seconds": 60}) else 0
            except Exception as e:
                log("gpu-alive check failed:", e)
                grace = 0
        job = claim(grace)
        if job:
            process(job)
            continue
        if YT_ENABLED:
            additional = claim_additional_audio()
            if additional:
                process_yt(additional)
                continue
            yt = claim_yt()
            if yt:
                process_yt(yt)
                continue
        time.sleep(POLL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
