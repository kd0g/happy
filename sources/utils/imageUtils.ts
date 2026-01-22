/**
 * Image utilities for Happy Coder
 */

import { AttachedImage, ImageContentBlock, IMAGE_CONSTRAINTS } from '@/types/image';
import { Platform } from 'react-native';

/**
 * Generate a unique ID for an image
 */
export function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convert a File to base64 data URL (web only)
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Extract raw base64 data from data URL
 * @param dataUrl - e.g., "data:image/png;base64,iVBORw0..."
 * @returns raw base64 string without prefix
 */
export function extractBase64Data(dataUrl: string): string {
  const parts = dataUrl.split(',');
  return parts.length > 1 ? parts[1] : dataUrl;
}

/**
 * Extract MIME type from data URL
 * @param dataUrl - e.g., "data:image/png;base64,..."
 * @returns MIME type or 'image/png' as default
 */
export function extractMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : 'image/png';
}

/**
 * Check if MIME type is supported
 */
export function isSupportedImageType(mimeType: string): boolean {
  return IMAGE_CONSTRAINTS.SUPPORTED_TYPES.includes(mimeType as any);
}

/**
 * Validate image file size
 */
export function isValidImageSize(sizeInBytes: number): boolean {
  return sizeInBytes <= IMAGE_CONSTRAINTS.MAX_FILE_SIZE;
}

/**
 * Convert AttachedImage to Claude API format
 */
export function toClaudeImageContent(image: AttachedImage): ImageContentBlock {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: image.mimeType,
      data: extractBase64Data(image.base64),
    },
  };
}

/**
 * Resize image using canvas (web only)
 * Returns a new base64 data URL
 */
export async function resizeImageWeb(
  base64: string,
  maxDimension: number = IMAGE_CONSTRAINTS.MAX_DIMENSION
): Promise<{ base64: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Check if resize is needed
      if (width <= maxDimension && height <= maxDimension) {
        resolve({ base64, width, height });
        return;
      }

      // Calculate new dimensions maintaining aspect ratio
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to JPEG with good quality for OCR readability
      const resizedBase64 = canvas.toDataURL('image/jpeg', 0.8);
      resolve({ base64: resizedBase64, width, height });
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64;
  });
}

/**
 * Process image for attachment (validate, resize if needed)
 * Web version
 */
export async function processImageForAttachment(
  base64: string,
  fileName?: string
): Promise<AttachedImage | { error: string }> {
  // Check MIME type
  const mimeType = extractMimeType(base64);
  if (!isSupportedImageType(mimeType)) {
    return { error: `Unsupported image type: ${mimeType}` };
  }

  try {
    // Resize and convert to JPEG (web only)
    if (Platform.OS === 'web') {
      const resized = await resizeImageWeb(base64);
      // Calculate actual size after conversion
      const actualBase64Data = extractBase64Data(resized.base64);
      const actualSize = Math.ceil((actualBase64Data.length * 3) / 4);

      // Check size after compression
      if (!isValidImageSize(actualSize)) {
        return { error: `Image too large after compression: ${Math.round(actualSize / 1024)}KB (max ${Math.round(IMAGE_CONSTRAINTS.MAX_FILE_SIZE / 1024)}KB)` };
      }

      return {
        id: generateImageId(),
        base64: resized.base64,
        mimeType: 'image/jpeg', // Always JPEG after resize
        width: resized.width,
        height: resized.height,
        fileName,
        fileSize: actualSize,
      };
    }

    // For native, check size first
    const base64Data = extractBase64Data(base64);
    const estimatedSize = Math.ceil((base64Data.length * 3) / 4);
    if (!isValidImageSize(estimatedSize)) {
      return { error: `Image too large: ${Math.round(estimatedSize / 1024)}KB (max ${Math.round(IMAGE_CONSTRAINTS.MAX_FILE_SIZE / 1024)}KB)` };
    }

    return {
      id: generateImageId(),
      base64,
      mimeType: mimeType as AttachedImage['mimeType'],
      fileName,
      fileSize: estimatedSize,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to process image' };
  }
}

/**
 * Create a thumbnail for preview (web only)
 */
export async function createThumbnail(
  base64: string,
  maxDimension: number = 200
): Promise<string> {
  if (Platform.OS !== 'web') {
    return base64; // Return original for native
  }

  const result = await resizeImageWeb(base64, maxDimension);
  return result.base64;
}
