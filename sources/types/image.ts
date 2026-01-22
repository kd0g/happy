/**
 * Image attachment types for Happy Coder
 */

export interface AttachedImage {
  /** Unique identifier for this image */
  id: string;
  /** Base64 encoded image data (with data URL prefix) */
  base64: string;
  /** MIME type of the image */
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  /** Original width in pixels */
  width?: number;
  /** Original height in pixels */
  height?: number;
  /** File name if uploaded from file */
  fileName?: string;
  /** File size in bytes (before base64 encoding) */
  fileSize?: number;
}

/** Claude API image content block */
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    data: string;
  };
}

/** Claude API text content block */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/** Combined content for Claude API message */
export type MessageContent = string | (ImageContentBlock | TextContentBlock)[];

/** Maximum image constraints */
export const IMAGE_CONSTRAINTS = {
  /** Maximum file size in bytes (1MB per image) */
  MAX_FILE_SIZE: 1 * 1024 * 1024,
  /** Maximum dimension for resize (good for OCR) */
  MAX_DIMENSION: 1024,
  /** Maximum number of images per message */
  MAX_IMAGES_PER_MESSAGE: 5,
  /** Supported MIME types */
  SUPPORTED_TYPES: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const,
} as const;
