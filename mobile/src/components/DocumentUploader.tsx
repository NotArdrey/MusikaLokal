import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { ensureUploadPassesSafetyScreening } from '../services/uploadSafetyScreen';
import CustomAlert, { AlertType } from './CustomAlert';

const SAFETY_CHECK_TIMEOUT_MS = 6000;

interface DocumentUploaderProps {
    onFileSelect: (file: any) => void;
    label?: string;
    existingUrl?: string;
}

const withSafetyTimeout = async <T,>(promise: Promise<T>): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
            () => reject(new Error('Safety screening timed out. Upload blocked. Please try again.')),
            SAFETY_CHECK_TIMEOUT_MS,
        );
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

const DocumentUploader: React.FC<DocumentUploaderProps> = ({ onFileSelect, label = 'Upload Document', existingUrl }) => {
    const { colors, isDark } = useTheme();
    const [fileName, setFileName] = useState<string | null>(existingUrl ? 'Current document' : null);
    const [checking, setChecking] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{
        type: AlertType;
        title: string;
        message: string;
        buttons?: any[];
    }>({
        type: 'info',
        title: '',
        message: '',
    });

    const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
        setAlertConfig({ type, title, message, buttons });
        setAlertVisible(true);
    };

    const showUploadBlockedAlert = (message?: string) => {
        showAlert(
            'warning',
            'Upload blocked',
            message || 'This document did not pass safety screening.',
            [{ text: 'Choose another', style: 'default' }],
        );
    };

    const pickDocument = async () => {
        try {
            setChecking(true);
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf', // Limit to PDFs for now, or '*/*'
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];
            await withSafetyTimeout(
                ensureUploadPassesSafetyScreening(
                    {
                        name: file.name,
                        mimeType: file.mimeType || 'application/pdf',
                        size: typeof file.size === 'number' ? file.size : undefined,
                        uri: file.uri,
                        kind: 'document',
                    },
                    `document_uploader:${label}`,
                ),
            );

            setFileName(file.name);
            onFileSelect(file);
        } catch (error: any) {
            console.error('Error picking document:', error);
            const message = error?.message || 'Error picking document';
            if (String(message).toLowerCase().includes('safety screen')) {
                showUploadBlockedAlert(message);
            } else {
                showAlert('error', 'Upload failed', message);
            }
        } finally {
            setChecking(false);
        }
    };

    const clearDocument = () => {
        setFileName(null);
        onFileSelect(null);
    };

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{label} <Text style={{ color: '#EF4444' }}>*</Text></Text>

            {!fileName ? (
                <TouchableOpacity activeOpacity={1}
                    style={[styles.uploadBtn, { borderColor: colors.border, backgroundColor: isDark ? '#374151' : '#F9FAFB' }]}
                    onPress={pickDocument}
                    disabled={checking}
                >
                    <Ionicons name="cloud-upload-outline" size={24} color={colors.primary} />
                    <Text style={[styles.uploadText, { color: colors.text }]}>
                        {checking ? 'Checking document...' : 'Select PDF Document'}
                    </Text>
                </TouchableOpacity>
            ) : (
                <View style={[styles.fileContainer, { backgroundColor: isDark ? '#374151' : '#F3F4F6', borderColor: colors.primary }]}>
                    <View style={styles.fileInfo}>
                        <Ionicons name="document-text" size={24} color={colors.primary} />
                        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{fileName}</Text>
                    </View>
                    <TouchableOpacity activeOpacity={1} onPress={clearDocument} style={styles.removeBtn}>
                        <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            )}

            <CustomAlert
                visible={alertVisible}
                type={alertConfig.type}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onClose={() => setAlertVisible(false)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
    },
    label: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 14,
        marginBottom: 8,
    },
    uploadBtn: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: 12,
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    uploadText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 14,
    },
    fileContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    fileInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    fileName: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 14,
        flex: 1,
    },
    removeBtn: {
        padding: 4,
    }
});

export default DocumentUploader;
