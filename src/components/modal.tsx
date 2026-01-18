import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type CustomModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title?: string;
  message?: string;
  buttonText?: string;
};

const CustomModal: React.FC<CustomModalProps> = ({ visible, onClose, onConfirm, title, message = '', buttonText = 'Close' }) => {
  const { colors } = useTheme();

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.card,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 }, // Added shadowOffset
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 10
            }
          ]}
        >
          {title && (
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          )}
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: colors.primary }]}
              onPress={onConfirm || onClose}
            >
              <Text style={styles.confirmButtonText}>{buttonText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
            >
              <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', // bg-black/50
  },
  modalContainer: {
    width: '80%', // w-4/5
    borderRadius: 24, // rounded-3xl
    padding: 24, // p-6
    alignItems: 'center',
  },
  title: {
    fontSize: 20, // text-xl
    marginBottom: 12, // mb-3
    textAlign: 'center',
    fontFamily: 'Poppins_600SemiBold',
  },
  message: {
    fontSize: 14, // text-sm
    textAlign: 'center',
    marginBottom: 32, // mb-8
    lineHeight: 24, // leading-6
    fontFamily: 'Poppins_400Regular',
  },
  buttonContainer: {
    width: '100%',
    gap: 12, // gap-3
  },
  confirmButton: {
    width: '100%',
    borderRadius: 12, // rounded-xl
    paddingVertical: 14, // py-3.5
    alignItems: 'center',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 14, // text-sm
    fontFamily: 'Poppins_600SemiBold',
  },
  cancelButton: {
    width: '100%',
    borderRadius: 12, // rounded-xl
    paddingVertical: 14, // py-3.5
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14, // text-sm
    fontFamily: 'Poppins_500Medium',
  },
});

export default CustomModal;
