import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
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
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="w-4/5 rounded-3xl p-6 items-center shadow-xl" style={{ backgroundColor: colors.card, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, elevation: 10 }}>
          {title && (
            <Text className="text-xl mb-3 text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{title}</Text>
          )}
          <Text className="text-sm text-center mb-8 leading-6" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>{message}</Text>

          <View className="w-full gap-3">
            <TouchableOpacity
              className="w-full rounded-xl py-3.5 items-center"
              style={{ backgroundColor: colors.primary }}
              onPress={onConfirm || onClose}
            >
              <Text className="text-white text-sm" style={{ fontFamily: 'Poppins_600SemiBold' }}>{buttonText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="w-full rounded-xl py-3.5 items-center"
              onPress={onClose}
            >
              <Text className="text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};


export default CustomModal;
