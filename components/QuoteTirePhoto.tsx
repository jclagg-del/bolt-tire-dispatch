"use client";

import { useRef, useState } from "react";

export default function QuoteTirePhoto({ label, src, alt, disabled = false, onUpload }: {
  label: string; src: string; alt: string; disabled?: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file?: File | null) => {
    if (disabled || busy.current) return;
    if (!file) { setError("Copy the image itself or drop an image file, rather than a link."); return; }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError("Use a JPEG, PNG, or WebP image."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("The image must be smaller than 8 MB."); return; }
    busy.current = true; setUploading(true); setError("");
    try { await onUpload(file); }
    catch (cause) { setError(`Could not upload photo: ${cause instanceof Error ? cause.message : "Please try again."}`); }
    finally { busy.current = false; setUploading(false); }
  };

  return <div>
    <div className={`quote-photo-drop ${dragging ? "dragging" : ""}`} role="button" tabIndex={disabled ? -1 : 0}
      aria-label={label} aria-disabled={disabled || uploading} aria-busy={uploading}
      onClick={() => { if (!disabled && !busy.current) input.current?.click(); }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!disabled && !busy.current) input.current?.click(); } }}
      onPaste={(event) => {
        event.preventDefault();
        const image = Array.from(event.clipboardData.items).find(item => item.type.startsWith("image/"))?.getAsFile();
        void upload(image);
      }}
      onDragOver={(event) => { event.preventDefault(); if (!disabled && !busy.current) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files).find(file => file.type.startsWith("image/"))); }}>
      {src ? <img className="quote-tire-image" src={src} alt={alt} draggable={false} /> : <div className="quote-image-placeholder">Paste, drag, or tap to add a tire photo</div>}
      <span className="quote-photo-change" role="status">{uploading ? "Uploading photo..." : src ? "Paste, drop, or tap to replace photo" : "Copy an image, focus this box and paste, or tap to choose a photo"}</span>
    </div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Choose ${label.toLowerCase()}`} hidden disabled={disabled || uploading}
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
    {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
  </div>;
}
