/**
 * Image picker hook for Happy Coder
 * Wraps expo-image-picker with permission handling and image processing
 */

import { useState, useCallback } from 'react';
import { Platform, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AttachedImage, IMAGE_CONSTRAINTS } from '@/types/image';
import { processImageForAttachmentNative } from '@/utils/imageUtils.native';

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

      for (const asset of assets) {
        const processed = await processImageForAttachmentNative(
          asset.uri,
          asset.fileName ?? undefined
        );

        if ('error' in processed) {
          console.warn('Failed to process image:', processed.error);
          onError?.(processed.error);
          continue;
        }

        // Override dimensions from picker if available
        if (asset.width && asset.height) {
          processed.width = asset.width;
          processed.height = asset.height;
        }

        results.push(processed);
      }

      return results;
    },
    [onError]
  );

  /**
   * Pick images from gallery
   */
  const pickFromGallery = useCallback(async (): Promise<AttachedImage[]> => {
    try {
      // Request permission first
      const hasPermission = await requestMediaLibraryPermission();
      if (!hasPermission) {
        return [];
      }

      setIsLoading(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: maxImages > 1,
        selectionLimit: maxImages,
        quality: 0.9,
        exif: false,
      });

      if (result.canceled || !result.assets?.length) {
        setIsLoading(false);
        return [];
      }

      const images = await processAssets(result.assets);

      if (images.length > 0) {
        onImagesPicked?.(images);
      }

      setIsLoading(false);
      return images;
    } catch (err) {
      setIsLoading(false);
      const errorMessage = err instanceof Error ? err.message : 'Failed to pick images';
      console.error('Error picking images:', err);
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
        quality: 0.9,
        exif: false,
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
