"use client";

export type RotateDegrees = 90 | 180 | 270;

/** Rotate a photo clockwise so the user can fix upside-down / sideways pages before OCR. */
export async function rotateImageFile(file: File, degreesCw: RotateDegrees): Promise<File> {
  if (typeof createImageBitmap === "undefined") {
    throw new Error("Image rotation is not supported in this browser");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    if (degreesCw === 90 || degreesCw === 270) {
      canvas.width = bitmap.height;
      canvas.height = bitmap.width;
    } else {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not rotate this photo");
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degreesCw * Math.PI) / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) throw new Error("Could not rotate this photo");
    const name = file.name.replace(/\.\w+$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

/** Load a saved page image (with auth) so it can be rotated and re-read. */
export async function fetchImageUrlAsFile(url: string, filename = "page.jpg"): Promise<File> {
  const headers = new Headers();
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error("Could not load this page photo to rotate it");
  }
  const blob = await response.blob();
  const type = blob.type || "image/jpeg";
  const safeName = filename.replace(/\.\w+$/i, "") + (type.includes("png") ? ".png" : ".jpg");
  return new File([blob], safeName, { type, lastModified: Date.now() });
}
