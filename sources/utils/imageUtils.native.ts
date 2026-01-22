/**
 * Native-specific image utilities for Happy Coder
 * Uses expo-image-manipulator for resizing on iOS/Android
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { Alert } from 'react-native';
import { AttachedImage, IMAGE_CONSTRAINTS } from '@/types/image';
import {
  generateImageId,
  extractBase64Data,
  extractMimeType,
  isSupportedImageType,
  isValidImageSize,
} from './imageUtils';

// Debug flag - set to false in production
const DEBUG_IMAGE_PROCESSING = false;

function debugAlert(title: string, message: string) {
  if (DEBUG_IMAGE_PROCESSING) {
    Alert.alert(`[DEBUG] ${title}`, message);
  }
}

/**
 * Get MIME type from URI (handles both file:// and data: URIs)
 */
function getMimeTypeFromUri(uri: string): string {
  // Handle data: URLs
  if (uri.startsWith('data:')) {
    return extractMimeType(uri);
  }

  // Handle file:// URLs - check extension
  const lowerUri = uri.toLowerCase();
  if (lowerUri.endsWith('.png')) return 'image/png';
  if (lowerUri.endsWith('.gif')) return 'image/gif';
  if (lowerUri.endsWith('.webp')) return 'image/webp';
  // Default to JPEG for jpg, jpeg, or unknown
  return 'image/jpeg';
}

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
  debugAlert('resizeImageNative', `Starting with uri: ${uri?.substring(0, 80)}...`);

  // Determine output format based on input
  const mimeType = getMimeTypeFromUri(uri);
  debugAlert('MIME Type', `Detected: ${mimeType}`);

  const format = mimeType === 'image/png'
    ? ImageManipulator.SaveFormat.PNG
    : ImageManipulator.SaveFormat.JPEG;

  // First, get image info without resizing to check dimensions
  debugAlert('Step', 'Getting image info...');
  let imageInfo;
  try {
    imageInfo = await ImageManipulator.manipulateAsync(uri, [], {
      base64: false,
    });
    debugAlert('Image Info', `${imageInfo.width}x${imageInfo.height}`);
  } catch (infoError) {
    debugAlert('ERROR getInfo', `${infoError instanceof Error ? infoError.message : String(infoError)}`);
    throw infoError;
  }

  const { width: origWidth, height: origHeight } = imageInfo;

  // Check if resize is needed
  if (origWidth <= maxDimension && origHeight <= maxDimension) {
    // No resize needed, just get base64
    debugAlert('No Resize', 'Getting base64 only...');
    let result;
    try {
      result = await ImageManipulator.manipulateAsync(uri, [], {
        base64: true,
        format,
        compress: format === ImageManipulator.SaveFormat.JPEG ? 0.85 : 1,
      });
      debugAlert('Base64', `Length: ${result.base64?.length || 0}`);
    } catch (base64Error) {
      debugAlert('ERROR base64', `${base64Error instanceof Error ? base64Error.message : String(base64Error)}`);
      throw base64Error;
    }

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
  debugAlert('Resizing', `To ${newWidth}x${newHeight}...`);
  let result;
  try {
    result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: newWidth, height: newHeight } }],
      {
        base64: true,
        format,
        compress: format === ImageManipulator.SaveFormat.JPEG ? 0.85 : 1,
      }
    );
    debugAlert('Resize OK', `Result: ${result.width}x${result.height}, base64 len: ${result.base64?.length || 0}`);
  } catch (resizeError) {
    debugAlert('ERROR resize', `${resizeError instanceof Error ? resizeError.message : String(resizeError)}`);
    throw resizeError;
  }

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
  debugAlert('processImage', `URI: ${uri?.substring(0, 60)}...`);

  try {
    // Resize and get base64
    const resized = await resizeImageNative(uri);
    debugAlert('Resized OK', `${resized.width}x${resized.height}, ${resized.mimeType}`);

    // Check MIME type
    if (!isSupportedImageType(resized.mimeType)) {
      debugAlert('MIME Error', `Unsupported: ${resized.mimeType}`);
      return { error: `Unsupported image type: ${resized.mimeType}` };
    }

    // Estimate file size (base64 is ~33% larger than binary)
    const base64Data = extractBase64Data(resized.base64);
    const estimatedSize = Math.ceil((base64Data.length * 3) / 4);
    debugAlert('Size', `${Math.round(estimatedSize / 1024)}KB`);

    if (!isValidImageSize(estimatedSize)) {
      debugAlert('Size Error', `Too large: ${Math.round(estimatedSize / 1024 / 1024)}MB`);
      return { error: `Image too large: ${Math.round(estimatedSize / 1024 / 1024)}MB (max 5MB)` };
    }

    debugAlert('SUCCESS', 'Image processed!');
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    debugAlert('CATCH Error', errorMsg);
    return { error: errorMsg };
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
