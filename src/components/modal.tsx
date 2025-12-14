import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

type CustomModalProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  buttonText?: string;
};

const CustomModal: React.FC<CustomModalProps> = ({ visible, onClose, title, message = '' , buttonText=''}) => {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="w-4/5 bg-white rounded-2xl p-6 items-center">
          {title && (
            <Text className="text-xl text-gray-900 mb-2 text-center" style={{ fontFamily: 'Poppins_600SemiBold' }}>{title}</Text>
          )}
          <Text className="text-base text-gray-700 text-center mb-6" style={{ fontFamily: 'Poppins_400Regular' }}>{message}</Text>
          <TouchableOpacity className="bg-teal-500 rounded-lg px-5 py-2 self-stretch" onPress={onClose}>
            {buttonText &&(
              <Text className="text-white text-center text-base" style={{ fontFamily: 'Poppins_500Medium' }}>{buttonText}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity className="bg-red-500 rounded-lg px-5 py-2 self-stretch mt-3 items-center" onPress={onClose}>
            <Text className="text-white text-base" style={{ fontFamily: 'Poppins_500Medium' }}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};


export default CustomModal;
