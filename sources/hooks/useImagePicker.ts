/**
 * Image picker hook for Happy Coder
 * Wraps expo-image-picker with permission handling and image processing
 */

import { useState, useCallback } from 'react';
import { Platform, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { AttachedImage, IMAGE_CONSTRAINTS } from '@/types/image';
import { generateImageId } from '@/utils/imageUtils';

const DEBUG_IMAGE_PICKER = false;
function debugAlert(title: string, message: string) {
  if (DEBUG_IMAGE_PICKER) {
    Alert.alert(`[PICKER] ${title}`, message);
  }
}

export type ImagePickerSource = 'gallery' | 'camera';

export interface UseImagePickerOptions {
  /** Maximum number of images to pick at once */
  maxImages?: number;
  /** Called when images are successfully picked */
  onImagesPicked?: (images: AttachedImage[]) => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
}

export interface UseImagePickerResult {
  /** Pick images from gallery */
  pickFromGallery: () => Promise<AttachedImage[]>;
  /** Take photo from camera */
  takePhoto: () => Promise<AttachedImage | null>;
  /** Check if picker is currently processing */
  isLoading: boolean;
  /** Request permissions for a specific source */
  requestPermission: (source: ImagePickerSource) => Promise<boolean>;
}

/**
 * Hook for picking images from gallery or camera
 */
export function useImagePicker(options: UseImagePickerOptions = {}): UseImagePickerResult {
  const {
    maxImages = IMAGE_CONSTRAINTS.MAX_IMAGES_PER_MESSAGE,
    onImagesPicked,
    onError,
  } = options;

  const [isLoading, setIsLoading] = useState(false);

  /**
   * Request media library permission
   */
  const requestMediaLibraryPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;

    const { status, canAskAgain } = await ImagePicker.getMediaLibraryPermissionsAsync();

    if (status === 'granted') {
      return true;
    }

    if (!canAskAgain) {
      Alert.alert(
        '사진 접근 권한 필요',
        '설정에서 사진 접근 권한을 허용해주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정으로 이동', onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }

    const { status: newStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return newStatus === 'granted';
  }, []);

  /**
   * Request camera permission
   */
  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;

    const { status, canAskAgain } = await ImagePicker.getCameraPermissionsAsync();

    if (status === 'granted') {
      return true;
    }

    if (!canAskAgain) {
      Alert.alert(
        '카메라 접근 권한 필요',
        '설정에서 카메라 접근 권한을 허용해주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정으로 이동', onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }

    const { status: newStatus } = await ImagePicker.requestCameraPermissionsAsync();
    return newStatus === 'granted';
  }, []);

  /**
   * Request permission for a specific source
   */
  const requestPermission = useCallback(
    async (source: ImagePickerSource): Promise<boolean> => {
      if (source === 'gallery') {
        return requestMediaLibraryPermission();
      } else {
        return requestCameraPermission();
      }
    },
    [requestMediaLibraryPermission, requestCameraPermission]
  );

  /**
   * Process picked assets into AttachedImage array
   */
  const processAssets = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[]): Promise<AttachedImage[]> => {
      const results: AttachedImage[] = [];

      debugAlert('processAssets', `Processing ${assets.length} asset(s)`);

      for (const asset of assets) {
        debugAlert('Asset', `URI: ${asset.uri?.substring(0, 60)}...\nSize: ${asset.width}x${asset.height}\nType: ${asset.mimeType || 'unknown'}`);

        try {
          // Use base64 from picker if available, otherwise read from file system
          let base64Data: string;

          if (asset.base64) {
            base64Data = asset.base64;
            debugAlert('Base64', 'Using picker base64');
          } else {
            // Read file as base64 using expo-file-system
            debugAlert('FileSystem', 'Reading file...');
            base64Data = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            debugAlert('FileSystem', `Read ${base64Data.length} chars`);
          }

          // Determine MIME type
          const mimeType = asset.mimeType || getMimeTypeFromUri(asset.uri);

          // Create full data URL
          const dataUrl = `data:${mimeType};base64,${base64Data}`;

          // Estimate file size (base64 is ~33% larger than binary)
          const estimatedSize = Math.ceil((base64Data.length * 3) / 4);

          // Check size limit (5MB)
          if (estimatedSize > IMAGE_CONSTRAINTS.MAX_FILE_SIZE) {
            const errorMsg = `Image too large: ${Math.round(estimatedSize / 1024 / 1024)}MB (max 5MB)`;
            debugAlert('Size Error', errorMsg);
            onError?.(errorMsg);
            continue;
          }

          const processed: AttachedImage = {
            id: generateImageId(),
            base64: dataUrl,
            mimeType: mimeType as AttachedImage['mimeType'],
            width: asset.width,
            height: asset.height,
            fileName: asset.fileName ?? undefined,
            fileSize: estimatedSize,
          };

          debugAlert('Processed OK', `ID: ${processed.id}\n${processed.width}x${processed.height}`);
          results.push(processed);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          debugAlert('Exception', errMsg);
          onError?.(errMsg);
        }
      }

      debugAlert('Results', `Returning ${results.length} image(s)`);
      return results;
    },
    [onError]
  );

  // Helper to get MIME type from URI
  function getMimeTypeFromUri(uri: string): string {
    const lowerUri = uri.toLowerCase();
    if (lowerUri.endsWith('.png')) return 'image/png';
    if (lowerUri.endsWith('.gif')) return 'image/gif';
    if (lowerUri.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  /**
   * Pick images from gallery
   */
  const pickFromGallery = useCallback(async (): Promise<AttachedImage[]> => {
    debugAlert('pickFromGallery', 'Starting...');
    try {
      // Request permission first
      const hasPermission = await requestMediaLibraryPermission();
      if (!hasPermission) {
        debugAlert('Permission', 'Denied');
        return [];
      }
      debugAlert('Permission', 'Granted');

      setIsLoading(true);

      debugAlert('Launch', 'Opening image library...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: maxImages > 1,
        selectionLimit: maxImages,
        quality: 0.85,
        exif: false,
        base64: true, // Get base64 directly from picker
      });

      if (result.canceled) {
        debugAlert('Canceled', 'User canceled');
        setIsLoading(false);
        return [];
      }

      if (!result.assets?.length) {
        debugAlert('No Assets', 'No assets returned');
        setIsLoading(false);
        return [];
      }

      debugAlert('Selected', `${result.assets.length} image(s)`);
      const images = await processAssets(result.assets);

      if (images.length > 0) {
        debugAlert('Calling', `onImagesPicked with ${images.length} images`);
        onImagesPicked?.(images);
      } else {
        debugAlert('Warning', 'No images after processing');
      }

      setIsLoading(false);
      return images;
    } catch (err) {
      setIsLoading(false);
      const errorMessage = err instanceof Error ? err.message : String(err);
      debugAlert('Error', errorMessage);
      onError?.(errorMessage);
      return [];
    }
  }, [maxImages, requestMediaLibraryPermission, processAssets, onImagesPicked, onError]);

  /**
   * Take photo from camera
   */
  const takePhoto = useCallback(async (): Promise<AttachedImage | null> => {
    try {
      // Request permission first
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        return null;
      }

      setIsLoading(true);

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        exif: false,
        base64: true, // Get base64 directly from camera
      });

      if (result.canceled || !result.assets?.length) {
        setIsLoading(false);
        return null;
      }

      const images = await processAssets(result.assets);
      const image = images[0] ?? null;

      if (image) {
        onImagesPicked?.([image]);
      }

      setIsLoading(false);
      return image;
    } catch (err) {
      setIsLoading(false);
      const errorMessage = err instanceof Error ? err.message : 'Failed to take photo';
      console.error('Error taking photo:', err);
      onError?.(errorMessage);
      return null;
    }
  }, [requestCameraPermission, processAssets, onImagesPicked, onError]);

  return {
    pickFromGallery,
    takePhoto,
    isLoading,
    requestPermission,
  };
}

/**
 * Show action sheet to choose image source
 */
export function showImageSourceActionSheet(
  pickFromGallery: () => void,
  takePhoto: () => void,
  pasteFromClipboard?: () => void
): void {
  const buttons: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[] = [
    { text: '취소', style: 'cancel' },
    { text: '갤러리에서 선택', onPress: pickFromGallery },
    { text: '카메라로 촬영', onPress: takePhoto },
  ];

  if (pasteFromClipboard) {
    buttons.push({ text: '클립보드에서 붙여넣기', onPress: pasteFromClipboard });
  }

  Alert.alert(
    '이미지 첨부',
    '이미지를 어디서 가져올까요?',
    buttons,
    { cancelable: true }
  );
}
