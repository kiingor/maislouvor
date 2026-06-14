FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only PyTorch (no CUDA) — much smaller and works on this GPU-less box
RUN pip install --no-cache-dir torch==2.1.2 torchaudio==2.1.2 \
      --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV TORCH_HOME=/data/torch \
    DEMUCS_MODEL=htdemucs_6s \
    DEMUCS_SEGMENT=7 \
    DATA_DIR=/data \
    PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
