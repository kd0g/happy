import * as React from 'react';
import { TextInput, View, NativeSyntheticEvent, TextInputKeyPressEventData, TextInputSelectionChangeEventData, NativeTouchEvent, GestureResponderEvent, InteractionManager } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import * as Clipboard from 'expo-clipboard';
import { Typography } from '@/constants/Typography';
import { AttachedImage } from '@/types/image';
import { processImageForAttachmentNative } from '@/utils/imageUtils.native';

export type SupportedKey = 'Enter' | 'Escape' | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Tab';

export interface KeyPressEvent {
    key: SupportedKey;
    shiftKey: boolean;
}

export type OnKeyPressCallback = (event: KeyPressEvent) => boolean;

export interface TextInputState {
    text: string;
    selection: {
        start: number;
        end: number;
    };
}

export interface MultiTextInputHandle {
    setTextAndSelection: (text: string, selection: { start: number; end: number }) => void;
    focus: () => void;
    blur: () => void;
    checkClipboardForImage: () => Promise<void>;
}

interface MultiTextInputProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    maxHeight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
    onKeyPress?: OnKeyPressCallback;
    onSelectionChange?: (selection: { start: number; end: number }) => void;
    onStateChange?: (state: TextInputState) => void;
    /** Called when an image is pasted from clipboard */
    onImagePaste?: (image: AttachedImage) => void;
}

export const MultiTextInput = React.forwardRef<MultiTextInputHandle, MultiTextInputProps>((props, ref) => {
    const {
        value,
        onChangeText,
        placeholder,
        maxHeight = 120,
        onKeyPress,
        onSelectionChange,
        onStateChange,
        onImagePaste
    } = props;

    const { theme } = useUnistyles();
    // Track latest selection in a ref
    const selectionRef = React.useRef({ start: 0, end: 0 });
    const inputRef = React.useRef<TextInput>(null);
    // Track if we're currently checking clipboard to prevent duplicates
    const isCheckingClipboard = React.useRef(false);
    // Track the last processed clipboard image to prevent duplicates
    const lastClipboardImageHash = React.useRef<string | null>(null);

    /**
     * Check clipboard for image content
     * This is called on focus since native doesn't have onPaste event
     * Uses InteractionManager to avoid blocking UI during image processing
     */
    const checkClipboardForImage = React.useCallback(async () => {
        if (!onImagePaste || isCheckingClipboard.current) return;

        isCheckingClipboard.current = true;

        try {
            // Check if clipboard has an image - this is fast
            const hasImage = await Clipboard.hasImageAsync();
            if (!hasImage) {
                isCheckingClipboard.current = false;
                return;
            }

            // Get the image from clipboard
            const clipboardImage = await Clipboard.getImageAsync({ format: 'png' });
            if (!clipboardImage?.data) {
                isCheckingClipboard.current = false;
                return;
            }

            // Create a simple hash to detect if this is the same image
            const imageHash = clipboardImage.data.substring(0, 100);
            if (imageHash === lastClipboardImageHash.current) {
                // Same image as before, skip
                isCheckingClipboard.current = false;
                return;
            }

            // Update hash immediately to prevent duplicate processing
            lastClipboardImageHash.current = imageHash;

            // Prepare base64 data
            const base64Data = clipboardImage.data.startsWith('data:')
                ? clipboardImage.data
                : `data:image/png;base64,${clipboardImage.data}`;

            // Use InteractionManager to process image after animations complete
            // This prevents UI freeze during heavy image processing
            InteractionManager.runAfterInteractions(async () => {
                try {
                    const processed = await processImageForAttachmentNative(base64Data, 'clipboard-image.png');

                    if ('error' in processed) {
                        console.warn('Failed to process clipboard image:', processed.error);
                        return;
                    }

                    // Notify parent about the pasted image
                    onImagePaste(processed);
                } catch (err) {
                    console.error('Error processing clipboard image:', err);
                } finally {
                    isCheckingClipboard.current = false;
                }
            });

        } catch (err) {
            console.error('Error checking clipboard for image:', err);
            isCheckingClipboard.current = false;
        }
    }, [onImagePaste]);

    const handleKeyPress = React.useCallback((e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
        if (!onKeyPress) return;

        const nativeEvent = e.nativeEvent;
        const key = nativeEvent.key;

        // Map native key names to our normalized format
        let normalizedKey: SupportedKey | null = null;

        switch (key) {
            case 'Enter':
                normalizedKey = 'Enter';
                break;
            case 'Escape':
                normalizedKey = 'Escape';
                break;
            case 'ArrowUp':
            case 'Up': // iOS may use different names
                normalizedKey = 'ArrowUp';
                break;
            case 'ArrowDown':
            case 'Down':
                normalizedKey = 'ArrowDown';
                break;
            case 'ArrowLeft':
            case 'Left':
                normalizedKey = 'ArrowLeft';
                break;
            case 'ArrowRight':
            case 'Right':
                normalizedKey = 'ArrowRight';
                break;
            case 'Tab':
                normalizedKey = 'Tab';
                break;
        }

        if (normalizedKey) {
            const keyEvent: KeyPressEvent = {
                key: normalizedKey,
                shiftKey: (nativeEvent as any).shiftKey || false
            };

            const handled = onKeyPress(keyEvent);
            if (handled) {
                e.preventDefault();
            }
        }
    }, [onKeyPress]);

    const handleTextChange = React.useCallback((text: string) => {
        // When text changes, assume cursor moves to end
        const selection = { start: text.length, end: text.length };
        selectionRef.current = selection;

        console.log('MultiTextInput.native: Text changed:', JSON.stringify({ text, selection }));

        onChangeText(text);

        if (onStateChange) {
            onStateChange({ text, selection });
        }
        if (onSelectionChange) {
            onSelectionChange(selection);
        }
    }, [onChangeText, onStateChange, onSelectionChange]);

    const handleSelectionChange = React.useCallback((e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
        if (e.nativeEvent.selection) {
            const { start, end } = e.nativeEvent.selection;
            const selection = { start, end };

            // Only update if selection actually changed
            if (selection.start !== selectionRef.current.start || selection.end !== selectionRef.current.end) {
                selectionRef.current = selection;
                console.log('MultiTextInput.native: Selection changed:', JSON.stringify(selection));

                if (onSelectionChange) {
                    onSelectionChange(selection);
                }
                if (onStateChange) {
                    onStateChange({ text: value, selection });
                }
            }
        }
    }, [value, onSelectionChange, onStateChange]);

    /**
     * Handle focus - no longer auto-checks clipboard as it was causing freezes
     * Clipboard paste is now triggered manually via the image picker action sheet
     */
    const handleFocus = React.useCallback(() => {
        // Clipboard check disabled - was causing UI freezes and unexpected behavior
        // Users can paste from clipboard via the image attachment button
    }, []);

    // Imperative handle for direct control
    React.useImperativeHandle(ref, () => ({
        setTextAndSelection: (text: string, selection: { start: number; end: number }) => {
            console.log('MultiTextInput.native: setTextAndSelection:', JSON.stringify({ text, selection }));

            if (inputRef.current) {
                // Use setNativeProps for direct manipulation
                inputRef.current.setNativeProps({
                    text: text,
                    selection: selection
                });

                // Update our ref
                selectionRef.current = selection;

                // Notify through callbacks
                onChangeText(text);
                if (onStateChange) {
                    onStateChange({ text, selection });
                }
                if (onSelectionChange) {
                    onSelectionChange(selection);
                }
            }
        },
        focus: () => {
            inputRef.current?.focus();
        },
        blur: () => {
            inputRef.current?.blur();
        },
        checkClipboardForImage
    }), [onChangeText, onStateChange, onSelectionChange, checkClipboardForImage]);

    return (
        <View style={{ width: '100%' }}>
            <TextInput
                ref={inputRef}
                style={{
                    width: '100%',
                    fontSize: 16,
                    maxHeight,
                    color: theme.colors.input.text,
                    textAlignVertical: 'top',
                    padding:0,
                    paddingTop: props.paddingTop,
                    paddingBottom: props.paddingBottom,
                    paddingLeft: props.paddingLeft,
                    paddingRight: props.paddingRight,
                    ...Typography.default(),
                }}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.input.placeholder}
                value={value}
                onChangeText={handleTextChange}
                onKeyPress={handleKeyPress}
                onSelectionChange={handleSelectionChange}
                onFocus={handleFocus}
                multiline={true}
                autoCapitalize="sentences"
                autoCorrect={true}
                keyboardType="default"
                returnKeyType="default"
                autoComplete="off"
                textContentType="none"
                submitBehavior="newline"
            />
        </View>
    );
});

MultiTextInput.displayName = 'MultiTextInput';
