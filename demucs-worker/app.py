"""
Demucs stem-separation worker (FastAPI).

Async job model so callers (a Supabase Edge Function) never block:
  POST /jobs            -> { job_id }           (queues a separation)
  GET  /jobs/{id}       -> { status, stems }    (poll)
  GET  /jobs/{id}/stems/{stem} -> the mp3 file  (download a finished stem)

All endpoints except /health require:  Authorization: Bearer <WORKER_TOKEN>

Concurrency is intentionally 1 (single worker thread) so this never starves the
other services running on the box. Demucs is invoked with a small --segment to
keep peak RAM low on a CPU-only host.
"""
import hmac
import os
import queue
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

TOKEN = os.environ["WORKER_TOKEN"]
MODEL = os.environ.get("DEMUCS_MODEL", "htdemucs_6s")
SEGMENT = os.environ.get("DEMUCS_SEGMENT", "7")
DATA = Path(os.environ.get("DATA_DIR", "/data"))
JOBS = DATA / "jobs"
JOBS.mkdir(parents=True, exist_ok=True)

# Optional SSRF allowlist: comma-separated host suffixes (e.g. ".supabase.co").
# Empty => any public host allowed (private/loopback are always blocked).
ALLOWED_HOSTS = [h.strip().lower() for h in os.environ.get("ALLOWED_AUDIO_HOSTS", "").split(",") if h.strip()]

# Demucs stem name -> label used by the app's song_tracks
STEM_LABELS = {
    "vocals": "Vocais",
    "drums": "Bateria",
    "bass": "Baixo",
    "guitar": "Guitarra",
    "piano": "Teclado",
    "other": "Outros",
}

app = FastAPI(title="Demucs Worker")
_status: dict[str, dict] = {}
_q: "queue.Queue[str]" = queue.Queue()


def _set(jid: str, **kw):
    s = _status.setdefault(jid, {})
    s.update(kw)


def _check(authorization: str | None):
    expected = f"Bearer {TOKEN}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


def _validate_audio_url(url: str):
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="audio_url must be http(s)")
    host = (p.hostname or "").lower()
    if (
        not host
        or host == "localhost"
        or host == "0.0.0.0"
        or host == "::1"
        or host.startswith("127.")
        or host.startswith("10.")
        or host.startswith("192.168.")
        or host.startswith("169.254.")
        or any(host.startswith(f"172.{n}.") for n in range(16, 32))
    ):
        raise HTTPException(status_code=400, detail="audio_url host not allowed")
    if ALLOWED_HOSTS and not any(host == h or host.endswith(h) for h in ALLOWED_HOSTS):
        raise HTTPException(status_code=400, detail="audio_url host not allowed")


class JobReq(BaseModel):
    audio_url: str
    callback_url: str | None = None
    callback_token: str | None = None
    meta: dict | None = None  # passthrough (e.g. song_id, team_id)


def _notify_callback(jid: str, req: dict, status: str, stems: list):
    cb = req.get("callback_url")
    if not cb:
        return
    payload = {"job_id": jid, "status": status, "stems": stems, "meta": req.get("meta")}
    headers = {"Authorization": f"Bearer {req.get('callback_token', '')}"}
    for attempt in range(3):
        try:
            resp = requests.post(cb, json=payload, headers=headers, timeout=30)
            if resp.ok:
                return
            _set(jid, callback_error=f"status {resp.status_code}")
        except Exception as e:  # transient network/Supabase blip — retry
            _set(jid, callback_error=str(e))
        time.sleep(2 * (attempt + 1))


def _process(jid: str):
    req = _status[jid]["_req"]
    jdir = JOBS / jid
    indir = jdir / "in"
    outdir = jdir / "out"
    try:
        indir.mkdir(parents=True, exist_ok=True)
        _set(jid, status="downloading")
        url = req["audio_url"]
        ext = os.path.splitext(urlparse(url).path)[1] or ".mp3"
        infile = indir / f"audio{ext}"
        with requests.get(url, stream=True, timeout=180) as r:
            r.raise_for_status()
            with open(infile, "wb") as f:
                for chunk in r.iter_content(1 << 16):
                    f.write(chunk)

        _set(jid, status="separating")
        subprocess.run(
            ["python", "-m", "demucs", "-n", MODEL, "--segment", SEGMENT,
             "-j", "1", "--mp3", "-o", str(outdir), str(infile)],
            check=True,
            timeout=int(os.environ.get("DEMUCS_TIMEOUT", "1800")),
        )

        files = {}
        for stem in STEM_LABELS:
            matches = list(outdir.glob(f"**/{stem}.mp3"))
            if matches:
                files[stem] = str(matches[0])
        if not files:
            raise RuntimeError("demucs produced no stems")

        _set(jid, status="done", stems=list(files.keys()), labels=STEM_LABELS, _files=files)

        _notify_callback(jid, req, "done", list(files.keys()))
    except subprocess.TimeoutExpired:
        _set(jid, status="error", error="separation timed out")
        _notify_callback(jid, req, "error", [])
    except subprocess.CalledProcessError as e:
        _set(jid, status="error", error=f"demucs failed (exit {e.returncode})")
        _notify_callback(jid, req, "error", [])
    except Exception as e:
        _set(jid, status="error", error=str(e))
        _notify_callback(jid, req, "error", [])
    finally:
        # keep outputs, drop the (possibly large) input
        shutil.rmtree(indir, ignore_errors=True)


def _worker_loop():
    while True:
        jid = _q.get()
        try:
            _process(jid)
        finally:
            _q.task_done()


threading.Thread(target=_worker_loop, daemon=True).start()


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL, "queued": _q.qsize()}


@app.post("/jobs")
def create_job(req: JobReq, authorization: str | None = Header(default=None)):
    _check(authorization)
    _validate_audio_url(req.audio_url)
    jid = uuid.uuid4().hex
    _status[jid] = {"status": "queued", "_req": req.model_dump()}
    _q.put(jid)
    return {"job_id": jid, "status": "queued"}


@app.get("/jobs/{jid}")
def job_status(jid: str, authorization: str | None = Header(default=None)):
    _check(authorization)
    s = _status.get(jid)
    if not s:
        raise HTTPException(status_code=404, detail="job not found")
    return {k: v for k, v in s.items() if not k.startswith("_")}


@app.get("/jobs/{jid}/stems/{stem}")
def get_stem(jid: str, stem: str, authorization: str | None = Header(default=None)):
    _check(authorization)
    s = _status.get(jid)
    files = (s or {}).get("_files", {})
    if not s or stem not in files:
        raise HTTPException(status_code=404, detail="stem not found")
    return FileResponse(files[stem], media_type="audio/mpeg",
                        filename=f"{STEM_LABELS.get(stem, stem)}.mp3")
