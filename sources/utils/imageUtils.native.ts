/**
 * Native-specific image utilities for Happy Coder
 * Uses expo-image-manipulator for resizing on iOS/Android
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { AttachedImage, IMAGE_CONSTRAINTS } from '@/types/image';
import {
  generateImageId,
  extractBase64Data,
  extractMimeType,
  isSupportedImageType,
  isValidImageSize,
} from './imageUtils';

/**
 * Resize image using expo-image-manipulator (native only)
 * @param uri - The image URI (can be file:// or data:)
 * @param maxDimension - Maximum dimension for the longer side
 * @returns Resized image with base64 data URL
 */
export async function resizeImageNative(
  uri: string,
  maxDimension: number = IMAGE_CONSTRAINTS.MAX_DIMENSION
): Promise<{ base64: string; width: number; height: number; mimeType: string }> {
  // Determine output format based on input
  const mimeType = extractMimeType(uri);
  const format = mimeType === 'image/png'
    ? ImageManipulator.SaveFormat.PNG
    : ImageManipulator.SaveFormat.JPEG;

  // First, get image info without resizing to check dimensions
  const imageInfo = await ImageManipulator.manipulateAsync(uri, [], {
    base64: false,
  });

  const { width: origWidth, height: origHeight } = imageInfo;

  // Check if resize is needed
  if (origWidth <= maxDimension && origHeight <= maxDimension) {
    // No resize needed, just get base64
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      base64: true,
      format,
      compress: format === ImageManipulator.SaveFormat.JPEG ? 0.85 : 1,
    });

    const outputMimeType = format === ImageManipulator.SaveFormat.PNG ? 'image/png' : 'image/jpeg';
    return {
      base64: `data:${outputMimeType};base64,${result.base64}`,
      width: origWidth,
      height: origHeight,
      mimeType: outputMimeType,
    };
  }

  // Calculate new dimensions maintaining aspect ratio
  let newWidth: number;
  let newHeight: number;

  if (origWidth > origHeight) {
    newWidth = maxDimension;
    newHeight = Math.round((origHeight * maxDimension) / origWidth);
  } else {
    newHeight = maxDimension;
    newWidth = Math.round((origWidth * maxDimension) / origHeight);
  }

  // Resize the image
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: newWidth, height: newHeight } }],
    {
      base64: true,
      format,
      compress: format === ImageManipulator.SaveFormat.JPEG ? 0.85 : 1,
    }
  );

  const outputMimeType = format === ImageManipulator.SaveFormat.PNG ? 'image/png' : 'image/jpeg';
  return {
    base64: `data:${outputMimeType};base64,${result.base64}`,
    width: result.width,
    height: result.height,
    mimeType: outputMimeType,
  };
}

/**
 * Process image for attachment on native (validate, resize if needed)
 * This is the native-specific implementation
 */
export async function processImageForAttachmentNative(
  uri: string,
  fileName?: string
): Promise<AttachedImage | { error: string }> {
  try {
    // Resize and get base64
    const resized = await resizeImageNative(uri);

    // Check MIME type
    if (!isSupportedImageType(resized.mimeType)) {
      return { error: `Unsupported image type: ${resized.mimeType}` };
    }

    // Estimate file size (base64 is ~33% larger than binary)
    const base64Data = extractBase64Data(resized.base64);
    const estimatedSize = Math.ceil((base64Data.length * 3) / 4);

    if (!isValidImageSize(estimatedSize)) {
      return { error: `Image too large: ${Math.round(estimatedSize / 1024 / 1024)}MB (max 5MB)` };
    }

    return {
      id: generateImageId(),
      base64: resized.base64,
      mimeType: resized.mimeType as AttachedImage['mimeType'],
      width: resized.width,
      height: resized.height,
      fileName,
      fileSize: estimatedSize,
    };
  } catch (err) {
    console.error('Error processing image for attachment:', err);
    return { error: err instanceof Error ? err.message : 'Failed to process image' };
  }
}

/**
 * Create a thumbnail for preview on native
 */
export async function createThumbnailNative(
  uri: string,
  maxDimension: number = 200
): Promise<string> {
  try {
    const result = await resizeImageNative(uri, maxDimension);
    return result.base64;
  } catch (err) {
    console.error('Error creating thumbnail:', err);
    return uri; // Return original on error
  }
}

/**
 * Convert a file URI to base64 data URL
 */
export async function fileUriToBase64(
  uri: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [], {
    base64: true,
    format: mimeType === 'image/png'
      ? ImageManipulator.SaveFormat.PNG
      : ImageManipulator.SaveFormat.JPEG,
  });

  const outputMimeType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  return `data:${outputMimeType};base64,${result.base64}`;
}
