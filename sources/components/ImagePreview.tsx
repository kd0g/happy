import * as React from 'react';
import { View, ScrollView, Pressable, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { AttachedImage } from '@/types/image';

interface ImagePreviewProps {
    images: AttachedImage[];
    onRemove: (id: string) => void;
}

const THUMBNAIL_SIZE = 64;
const THUMBNAIL_BORDER_RADIUS = 8;

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        paddingHorizontal: 8,
        paddingTop: 8,
        paddingBottom: 4,
    },
    scrollContent: {
        flexDirection: 'row',
        gap: 8,
    },
    imageWrapper: {
        position: 'relative',
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
    },
    thumbnail: {
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        borderRadius: THUMBNAIL_BORDER_RADIUS,
        backgroundColor: theme.colors.surfacePressed,
    },
    removeButton: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: theme.colors.input.background,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: theme.colors.surface,
    },
    removeButtonPressed: {
        opacity: 0.7,
    },
    removeIcon: {
        color: theme.colors.textSecondary,
    },
}));

export function ImagePreview({ images, onRemove }: ImagePreviewProps) {
    const styles = stylesheet;
    const { theme } = useUnistyles();

    if (images.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {images.map((image) => (
                    <View key={image.id} style={styles.imageWrapper}>
                        <Image
                            source={{ uri: image.base64 }}
                            style={styles.thumbnail}
                            resizeMode="cover"
                        />
                        <Pressable
                            onPress={() => onRemove(image.id)}
                            style={({ pressed }) => [
                                styles.removeButton,
                                pressed && styles.removeButtonPressed,
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons
                                name="close"
                                size={12}
                                color={theme.colors.textSecondary}
                            />
                        </Pressable>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}
