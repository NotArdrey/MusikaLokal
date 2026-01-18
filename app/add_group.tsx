import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function AddGroupScreen() {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [newMember, setNewMember] = useState('');

  const steps = [
    { id: 1, title: 'Group Info', icon: 'people' },
    { id: 2, title: 'Members', icon: 'person-add' },
    { id: 3, title: 'Review', icon: 'checkmark-circle' },
  ];

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else setModalVisible(true);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  const handleConfirm = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        name: groupName,
        genre,
        description,
        members,
      };

      const { error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'create', type: 'group', userId: user.id, payload }
      });

      if (error) throw error;

      setModalVisible(false);
      console.log('Group Created');
      router.back();
    } catch (e) {
      console.log('Error creating group:', e);
      alert('Failed to create group');
    }
  };

  const addMember = () => {
    if (newMember.trim()) {
      setMembers([...members, newMember.trim()]);
      setNewMember('');
    }
  };

  const removeMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const renderInput = (label: string, value: string, setValue: (text: string) => void, placeholder: string, multiline = false) => (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          style={[
            styles.textInput,
            {
              color: colors.text,
              height: multiline ? 120 : 'auto',
              textAlignVertical: multiline ? 'top' : 'center'
            }
          ]}
        />
      </View>
    </View>
  );

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Create Group" />

        {/* Enhanced Step Indicator (Fixed at top) */}
        <View style={styles.stepIndicatorContainer}>
          <View style={styles.stepIndicatorContent}>
            {/* Progress Line Background */}
            <View style={[styles.progressLineBg, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

            {/* Active Progress Line */}
            <View
              style={[
                styles.activeProgressLine,
                {
                  width: `${((step - 1) / (steps.length - 1)) * 100}%`,
                  backgroundColor: colors.primary
                }
              ]}
            />

            {steps.map((s) => {
              const isActive = step >= s.id;
              const isCurrent = step === s.id;
              return (
                <View key={s.id} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      {
                        backgroundColor: isActive ? colors.primary : (isDark ? '#334155' : '#E5E7EB'),
                        borderColor: isActive ? '#818cf8' : (isDark ? '#1E293B' : '#F3F4F6')
                      }
                    ]}
                  >
                    <Ionicons
                      name={isActive ? "checkmark" : s.icon as any}
                      size={18}
                      color={isActive ? "#fff" : colors.textSecondary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.stepText,
                      {
                        fontFamily: isCurrent ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                        color: isActive ? colors.text : colors.textSecondary,
                        fontWeight: isCurrent ? 'bold' : 'normal'
                      }
                    ]}
                  >
                    {s.title}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <ScrollView
          style={styles.formContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {step === 1 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Tell us about your group
              </Text>
              {renderInput('Group Name', groupName, setGroupName, 'e.g. The Sunday Collective')}
              {renderInput('Genre', genre, setGenre, 'e.g. Indie Folk, Jazz')}
              {renderInput('Description', description, setDescription, 'Brief bio about your band...', true)}
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Who's in the band?
              </Text>

              <View style={styles.addMemberRow}>
                <View style={[styles.inputWrapper, styles.flex1, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                  <TextInput
                    value={newMember}
                    onChangeText={setNewMember}
                    placeholder="Add member name..."
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.textInput, { color: colors.text, padding: 12 }]}
                  />
                </View>
                <TouchableOpacity
                  onPress={addMember}
                  style={[styles.addBtn, { backgroundColor: colors.primary }]}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              {members.length === 0 ? (
                <View style={[styles.dashedBox, { borderColor: isDark ? '#374151' : '#D1D5DB' }]}>
                  <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
                  <Text style={[styles.dashedBoxText, { color: colors.textSecondary }]}>
                    No members added yet
                  </Text>
                </View>
              ) : (
                <View style={styles.membersList}>
                  {members.map((member, index) => (
                    <View key={index} style={[styles.memberItem, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: isDark ? '#374151' : '#F3F4F6' }]}>
                      <View style={styles.memberInfo}>
                        <View style={[styles.avatarPlaceholder, { backgroundColor: '#E0E7FF' }]}>
                          <Text style={styles.avatarText}>{member.charAt(0)}</Text>
                        </View>
                        <Text style={[styles.memberName, { color: colors.text }]}>{member}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeMember(index)}>
                        <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Review Details
              </Text>

              <View style={[styles.reviewContainer, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }]}>
                <View>
                  <Text style={styles.reviewLabel}>Group Info</Text>
                  <Text style={[styles.reviewValue, { color: colors.text }]}>{groupName || 'No Name'}</Text>
                  <Text style={{ color: colors.textSecondary }}>{genre || 'No Genre'}</Text>
                </View>

                <View style={[styles.divider, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

                <View>
                  <Text style={styles.reviewLabel}>Members ({members.length})</Text>
                  <View style={styles.tagsWrapper}>
                    {members.map((m, i) => (
                      <View key={i} style={[styles.tag, { backgroundColor: isDark ? '#374151' : 'white', borderColor: isDark ? '#4B5563' : '#E5E7EB' }]}>
                        <Text style={{ fontSize: 12, color: colors.text }}>{m}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <Text style={styles.termsText}>
                By tapping Create Group, you agree to our Terms and Conditions.
              </Text>
            </View>
          )}

          {/* Navigation Buttons */}
          <View style={styles.navigationButtons}>
            {step > 1 && (
              <TouchableOpacity
                onPress={handleBack}
                style={[styles.backBtn, { borderColor: isDark ? '#374151' : '#E5E7EB' }]}
              >
                <Text style={[styles.backBtnText, { color: colors.text }]}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleNext}
              style={[styles.nextBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            >
              <Text style={styles.nextBtnText}>
                {step === 3 ? 'Create Group' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>

        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        title="Success!"
        message={`Group "${groupName}" has been successfully created.`}
        buttonText="View Group"
        onClose={handleConfirm}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  stepIndicatorContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  stepIndicatorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  progressLineBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    top: 20,
    zIndex: 0,
  },
  activeProgressLine: {
    position: 'absolute',
    left: 0,
    height: 4,
    top: 20,
    zIndex: 0,
  },
  stepItem: {
    alignItems: 'center',
    zIndex: 10,
    width: 80,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  stepText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  scrollContent: {
    paddingBottom: 150,
  },
  sectionTitle: {
    fontSize: 20,
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: 'Poppins_600SemiBold',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    marginBottom: 8,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'Poppins_600SemiBold',
  },
  inputWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  textInput: {
    padding: 16,
    fontFamily: 'Poppins_400Regular',
  },
  addMemberRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    marginBottom: 24,
  },
  dashedBoxText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
  },
  membersList: {
    gap: 8,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: 'bold',
    color: '#312E81', // primaryDark approx
  },
  memberName: {
    fontFamily: 'Poppins_500Medium',
  },
  reviewContainer: {
    padding: 16,
    borderRadius: 16,
    gap: 16,
    marginBottom: 16,
  },
  reviewLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#9CA3AF',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  reviewValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
  },
  tagsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  termsText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9CA3AF',
    paddingHorizontal: 16,
  },
  navigationButtons: {
    marginTop: 32,
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  backBtnText: {
    fontFamily: 'Poppins_600SemiBold',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextBtnText: {
    fontFamily: 'Poppins_600SemiBold',
    color: '#fff',
  },
});
