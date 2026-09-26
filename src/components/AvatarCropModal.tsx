import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";

interface AvatarCropModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  onCropDone: (blob: Blob) => void;
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number) {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 70 }, 1, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

export function AvatarCropModal({ open, onOpenChange, imageSrc, onCropDone }: AvatarCropModalProps) {
  const [crop, setCrop] = useState<Crop>();
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setCrop(centerAspectCrop(naturalWidth, naturalHeight));
  }, []);

  const handleConfirm = async () => {
    if (!imgRef.current || !crop) return;
    setSaving(true);

    const image = imgRef.current;
    const canvas = document.createElement("canvas");
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const pixelCrop = {
      x: (crop.x / 100) * image.naturalWidth,
      y: (crop.y / 100) * image.naturalHeight,
      width: (crop.width / 100) * image.naturalWidth,
      height: (crop.height / 100) * image.naturalHeight,
    };

    // If crop is in pixels instead of percent
    if (crop.unit === "px") {
      pixelCrop.x = crop.x * scaleX;
      pixelCrop.y = crop.y * scaleY;
      pixelCrop.width = crop.width * scaleX;
      pixelCrop.height = crop.height * scaleY;
    }

    const size = Math.min(pixelCrop.width, pixelCrop.height);
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      size,
      size
    );

    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCropDone(blob);
        }
        setSaving(false);
      },
      "image/webp",
      0.85
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogToolbar
          title="Recortar foto"
          confirm={{ label: "Confirmar", onClick: handleConfirm, disabled: saving, loading: saving }}
        />
        {/* Área de mídia. A folha só arrasta pelo puxador/barra, então mexer no recorte não a fecha. */}
        <div className="min-w-0 pb-2">
          <div className="flex items-center justify-center overflow-hidden rounded-[20px] bg-fill-tertiary p-2">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              aspect={1}
              circularCrop={false}
              className="max-h-[60dvh] overflow-hidden rounded-[12px]"
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Crop"
                onLoad={onImageLoad}
                className="max-h-[60dvh] max-w-full object-contain"
              />
            </ReactCrop>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
