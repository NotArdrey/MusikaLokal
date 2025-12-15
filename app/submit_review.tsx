import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';

export default function SubmitReviewScreen() {
  const { width } = useWindowDimensions();
  const isNarrow = width < 400;
  const ratingButtonSize = Math.min(Math.max((width - 80) / 5 - 8, 40), 60);

  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const ratingOptions = [1, 2, 3, 4, 5];
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <View className="flex-1 bg-white px-6">
        <Header title="Submit Feedback" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <View className="flex flex-col justify-center items-center">
            <View className="mt-6">
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: isNarrow ? 14 : 16, textAlign: 'center' }}>
                How was your experience with us?
              </Text>
            </View>

            <View className="flex flex-row gap-2 items-center justify-center flex-wrap mt-5">
              {ratingOptions.map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setSelectedValue(item)}
                  className="rounded-xl border border-gray-300 items-center justify-center"
                  style={{
                    backgroundColor: item === selectedValue ? '#fde047' : '#ffffff',
                    width: ratingButtonSize,
                    height: ratingButtonSize,
                  }}
                >
                  <Text className="text-black" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: isNarrow ? 14 : 16 }}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="mt-6 items-center">
            <TextInput
              className="rounded-xl border border-gray-300 py-4 px-4 w-full"
              placeholder="Enter Your Feedback!"
              style={{ height: 180, textAlignVertical: 'top' }}
              multiline
            />
            <TouchableOpacity
              className="mt-5 rounded-xl bg-teal-500 py-4 items-center w-full"
              style={{ maxWidth: 300 }}
              onPress={() => setModalVisible(true)}
            >
              <Text className="text-white" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>
                Submit
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0">
          <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Confirm Feedback"
        message="Are you sure you want to submit this feedback?"
        buttonText="Submit"
      />
    </>
  );
}