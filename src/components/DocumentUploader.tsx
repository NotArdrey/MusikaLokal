import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import CustomAlert, { AlertType } from './CustomAlert';

interface DocumentUploaderProps {
    onFileSelect: (file: any) => void;
    label?: string;
    existingUrl?: string;
}

const DocumentUploader: React.FC<DocumentUploaderProps> = ({ onFileSelect, label = 'Upload Document', existingUrl }) => {
    const { colors, isDark } = useTheme();
    const [fileName, setFileName] = useState<string | null>(existingUrl ? 'Current CV' : null);
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

    const pickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf', // Limit to PDFs for now, or '*/*'
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];
            setFileName(file.name);
            onFileSelect(file);
        } catch (error) {
            console.error('Error picking document:', error);
            showAlert('error', 'Error', 'Error picking document');
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
                >
                    <Ionicons name="cloud-upload-outline" size={24} color={colors.primary} />
                    <Text style={[styles.uploadText, { color: colors.text }]}>Select PDF Resume/CV</Text>
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
