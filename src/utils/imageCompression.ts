export interface CompressedImage {
  base64: string; // Clean base64 string without data URI prefix
  dataUrl: string; // Full data:image/...;base64,... URI for rendering
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export function cleanBase64(base64OrDataUrl: string): string {
  if (!base64OrDataUrl || typeof base64OrDataUrl !== 'string') return '';
  if (base64OrDataUrl === 'data:,' || base64OrDataUrl.startsWith('data:,')) return '';
  return base64OrDataUrl.replace(/^data:[^,]*;base64,/i, '').trim();
}

export function getBase64SizeBytes(base64: string): number {
  const clean = cleanBase64(base64).replace(/\s/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes) || !Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function calculateTargetDimensions(
  width: number,
  height: number,
  maxDimension = 1024
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  if (width <= maxDimension && height <= maxDimension) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  if (width >= height) {
    const targetWidth = maxDimension;
    const targetHeight = Math.round((height * maxDimension) / width);
    return { width: targetWidth, height: Math.max(1, targetHeight) };
  } else {
    const targetHeight = maxDimension;
    const targetWidth = Math.round((width * maxDimension) / height);
    return { width: Math.max(1, targetWidth), height: targetHeight };
  }
}

export async function compressImageBase64(
  base64OrDataUrl: string,
  mimeType = 'image/jpeg',
  maxDimension = 1024,
  quality = 0.7
): Promise<CompressedImage> {
  const clean = cleanBase64(base64OrDataUrl);
  if (!clean) {
    return {
      base64: '',
      dataUrl: '',
      mimeType,
      sizeBytes: 0,
      width: 0,
      height: 0,
    };
  }

  const dataUrl = base64OrDataUrl.startsWith('data:')
    ? base64OrDataUrl
    : `data:${mimeType};base64,${clean}`;

  const fallbackSizeBytes = getBase64SizeBytes(clean);

  // If in SSR, non-browser, or environment without 2D canvas support (e.g. JSDOM), return safely
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof HTMLCanvasElement === 'undefined' ||
    !document.createElement('canvas').getContext?.('2d')
  ) {
    return {
      base64: clean,
      dataUrl,
      mimeType,
      sizeBytes: fallbackSizeBytes,
      width: maxDimension,
      height: maxDimension,
    };
  }

  return new Promise((resolve) => {
    let resolved = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const cleanupImg = () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };

    const finish = (result: CompressedImage) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanupImg();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        base64: clean,
        dataUrl,
        mimeType,
        sizeBytes: fallbackSizeBytes,
        width: maxDimension,
        height: maxDimension,
      });
    }, 1000);

    img.onload = () => {
      const origWidth = img.naturalWidth || img.width;
      const origHeight = img.naturalHeight || img.height;
      const target = calculateTargetDimensions(origWidth, origHeight, maxDimension);

      if (target.width === 0 || target.height === 0) {
        finish({
          base64: clean,
          dataUrl,
          mimeType,
          sizeBytes: fallbackSizeBytes,
          width: 0,
          height: 0,
        });
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          finish({
            base64: clean,
            dataUrl,
            mimeType,
            sizeBytes: fallbackSizeBytes,
            width: target.width,
            height: target.height,
          });
          return;
        }

        // Fill background with white to prevent transparent PNG pixels turning solid black on JPEG conversion
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, target.width, target.height);

        ctx.drawImage(img, 0, 0, target.width, target.height);
        const outputMime = 'image/jpeg';
        const compressedDataUrl = canvas.toDataURL(outputMime, quality);
        const compressedClean = cleanBase64(compressedDataUrl);
        const sizeBytes = getBase64SizeBytes(compressedClean);

        finish({
          base64: compressedClean,
          dataUrl: compressedDataUrl,
          mimeType: outputMime,
          sizeBytes,
          width: target.width,
          height: target.height,
        });
      } catch {
        finish({
          base64: clean,
          dataUrl,
          mimeType,
          sizeBytes: fallbackSizeBytes,
          width: target.width,
          height: target.height,
        });
      }
    };

    img.onerror = () => {
      finish({
        base64: clean,
        dataUrl,
        mimeType,
        sizeBytes: fallbackSizeBytes,
        width: maxDimension,
        height: maxDimension,
      });
    };

    img.src = dataUrl;
  });
}

export async function compressImageFile(
  file: File | Blob,
  maxDimension = 1024,
  quality = 0.7
): Promise<CompressedImage> {
  const mimeType = file?.type || 'image/jpeg';

  if (!file || file.size === 0) {
    return {
      base64: '',
      dataUrl: '',
      mimeType,
      sizeBytes: 0,
      width: 0,
      height: 0,
    };
  }

  // Fallback for SSR or environments without Canvas 2D or createObjectURL support
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof HTMLCanvasElement === 'undefined' ||
    !document.createElement('canvas').getContext?.('2d') ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        compressImageBase64(result, mimeType, maxDimension, quality)
          .then(resolve)
          .catch(reject);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve) => {
    let resolved = false;
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      // Fallback if createObjectURL throws
      const reader = new FileReader();
      reader.onload = () => {
        compressImageBase64(reader.result as string, mimeType, maxDimension, quality).then(resolve);
      };
      reader.onerror = () => {
        resolve({
          base64: '',
          dataUrl: '',
          mimeType,
          sizeBytes: 0,
          width: 0,
          height: 0,
        });
      };
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
      if (objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore revoke error
        }
      }
    };

    const finish = (result: CompressedImage) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanup();
      resolve(result);
    };

    const timer = setTimeout(() => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        const clean = cleanBase64(res);
        finish({
          base64: clean,
          dataUrl: res,
          mimeType,
          sizeBytes: getBase64SizeBytes(clean),
          width: maxDimension,
          height: maxDimension,
        });
      };
      reader.onerror = () => {
        finish({
          base64: '',
          dataUrl: '',
          mimeType,
          sizeBytes: 0,
          width: 0,
          height: 0,
        });
      };
      reader.readAsDataURL(file);
    }, 1000);

    img.onload = () => {
      const origWidth = img.naturalWidth || img.width;
      const origHeight = img.naturalHeight || img.height;
      const target = calculateTargetDimensions(origWidth, origHeight, maxDimension);

      if (target.width === 0 || target.height === 0) {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          const clean = cleanBase64(res);
          finish({
            base64: clean,
            dataUrl: res,
            mimeType,
            sizeBytes: getBase64SizeBytes(clean),
            width: 0,
            height: 0,
          });
        };
        reader.onerror = () => {
          finish({
            base64: '',
            dataUrl: '',
            mimeType,
            sizeBytes: 0,
            width: 0,
            height: 0,
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Canvas 2D context unavailable');
        }

        // Prevent transparent PNG converting to black JPEG artifact
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, target.width, target.height);

        ctx.drawImage(img, 0, 0, target.width, target.height);
        const outputMime = 'image/jpeg';
        const compressedDataUrl = canvas.toDataURL(outputMime, quality);
        const compressedClean = cleanBase64(compressedDataUrl);
        const sizeBytes = getBase64SizeBytes(compressedClean);

        finish({
          base64: compressedClean,
          dataUrl: compressedDataUrl,
          mimeType: outputMime,
          sizeBytes,
          width: target.width,
          height: target.height,
        });
      } catch {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          const clean = cleanBase64(res);
          finish({
            base64: clean,
            dataUrl: res,
            mimeType,
            sizeBytes: getBase64SizeBytes(clean),
            width: target.width || maxDimension,
            height: target.height || maxDimension,
          });
        };
        reader.onerror = () => {
          finish({
            base64: '',
            dataUrl: '',
            mimeType,
            sizeBytes: 0,
            width: 0,
            height: 0,
          });
        };
        reader.readAsDataURL(file);
      }
    };

    img.onerror = () => {
      finish({
        base64: '',
        dataUrl: '',
        mimeType,
        sizeBytes: 0,
        width: 0,
        height: 0,
      });
    };

    img.src = objectUrl;
  });
}
