import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import ImageUploader from '../src/components/ImageUploader';
import Navbar from '../src/components/navbar';
import ProductionInviteSection from '../src/components/ProductionInviteSection';
import { useBottomBarClearance } from '../src/hooks/useBottomBarClearance';
import { useAuth, useRequireAuth } from '../src/context/AuthContext';
import { emitToast } from '../src/events/toastBus';
import { useTheme } from '../src/context/ThemeContext';
import { ProductionInviteTarget, sendProductionTeamInvites } from '../src/utils/productionTeamInvites';

const readFunctionErrorBody = async (error: any) => {
  const response = error?.context;
  if (!response) return null;

  try {
    const readableResponse = typeof response.clone === 'function' ? response.clone() : response;
    if (typeof readableResponse.json === 'function') {
      return await readableResponse.json();
    }
  } catch (parseError) {
    console.warn('Failed to parse manage-production error response', parseError);
  }

  return null;
};

export default function AddProductionScreen() {
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
  const { session, userRole } = useAuth();

  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [logoImages, setLogoImages] = useState<string[]>([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const [inviteMessage, setInviteMessage] = useState('');
  const [selectedInviteTargets, setSelectedInviteTargets] = useState<ProductionInviteTarget[]>([]);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const hasIncompleteRequiredFields = !logoImages.length || !teamName.trim() || !description.trim();

  useEffect(() => {
    if (!authLoading && isAuthenticated && userRole && userRole !== 'producer') {
      setAlert({ type: 'warning', title: 'Production Only', message: 'Only production users can create a production team.' });
      router.replace('/manage');
    }
  }, [authLoading, isAuthenticated, userRole]);

  const invokeProduction = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-production', { body });
    if (error) {
      const responseBody = await readFunctionErrorBody(error);
      const status = Number((error as any)?.status || (error as any)?.context?.status || 0);
      const message =
        responseBody?.error ||
        responseBody?.message ||
        error.message ||
        'Production request failed.';
      console.warn('manage-production failed', {
        message,
        status,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
        context: (error as any).context,
        response: responseBody,
        body,
      });

      if ([502, 503, 504].includes(status)) {
        const transientError = new Error('Production services are temporarily unavailable. Please try again.');
        (transientError as any).status = status;
        throw transientError;
      }

      throw new Error(message);
    }

    if (data && typeof data === 'object' && (data as any).error && !(data as any).success) {
      throw new Error(String((data as any).error));
    }

    return data;
  }, []);

  const handleSubmit = async () => {
    if (!logoImages.length) {
      setAlert({ type: 'warning', title: 'Missing Logo', message: 'Upload a production team logo.' });
      return;
    }

    if (!teamName.trim()) {
      setAlert({ type: 'warning', title: 'Missing Name', message: 'Enter a production team name.' });
      return;
    }

    if (!description.trim()) {
      setAlert({ type: 'warning', title: 'Missing Description', message: 'Enter a production team description.' });
      return;
    }

    setSaving(true);
    try {
      const primaryLogo = logoImages[thumbnailIndex] || logoImages[0] || null;
      const data = await invokeProduction({
        action: 'create_production_team',
        name: teamName.trim(),
        description: description.trim() || null,
        logo_url: primaryLogo,
      });

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to create production team.');
      }

      const effectiveUserId = userId || session?.user?.id || null;
      const inviteSummary =
        effectiveUserId && data?.team?.id && selectedInviteTargets.length > 0
          ? await sendProductionTeamInvites({
              currentUserId: effectiveUserId,
              teamId: data.team.id,
              teamName: teamName.trim(),
              teamLogoUrl: primaryLogo,
              inviteMessage,
              inviteTargets: selectedInviteTargets,
            })
          : null;

      const inviteMessageSummary = inviteSummary
        ? inviteSummary.failedCount > 0
          ? `${inviteSummary.sentCount} invite(s) sent, ${inviteSummary.failedCount} failed.`
          : `${inviteSummary.sentCount} invite(s) sent.`
        : null;

      emitToast({
        type: 'success',
        title: 'Production Team Created',
        message: inviteMessageSummary
          ? `Your production team is ready to manage. ${inviteMessageSummary}`
          : 'Your production team is ready to manage.',
      });
      router.replace({ pathname: '/my_production', params: { refresh: String(Date.now()) } });
    } catch (error: any) {
      setAlert({ type: 'error', title: 'Error', message: error?.message || 'Failed to create production team.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Header title="Add Production" onBackPress={() => router.replace('/my_production')} />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary + '14' }]}>
            <Ionicons name="people-outline" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Create your production team</Text>
          <Text style={[styles.heroText, { color: colors.textSecondary }]}>Set up the team profile you will use for venue partnerships, member management, and production coordination.</Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Text style={[styles.label, { color: colors.text }]}>Team Logo *</Text>
          <ImageUploader
            images={logoImages}
            onImagesChange={setLogoImages}
            thumbnailIndex={thumbnailIndex}
            onThumbnailChange={setThumbnailIndex}
            maxImages={1}
            bucketName="listings"
            userId={userId || session?.user?.id || 'production-user'}
            folder="production"
          />

          <Text style={[styles.label, { color: colors.text }]}>Team Name *</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={teamName}
            onChangeText={setTeamName}
            placeholder="Enter your production team name"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.text }]}>Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your production team's focus, experience, or specialties"
            placeholderTextColor={colors.textSecondary}
            multiline
          />
          <Text style={[styles.descriptionHint, { color: colors.textSecondary }]}>
            This description is shown on your Manage Production About section.
          </Text>

          <ProductionInviteSection
            currentUserId={userId || session?.user?.id || null}
            selectedTargets={selectedInviteTargets}
            onSelectedTargetsChange={setSelectedInviteTargets}
            inviteMessage={inviteMessage}
            onInviteMessageChange={setInviteMessage}
            disabled={saving}
          />

          {hasIncompleteRequiredFields ? (
            <Text style={[styles.helperText, { color: '#F59E0B' }]}>Complete all required fields before creating your production team.</Text>
          ) : null}

          <TouchableOpacity activeOpacity={saving || hasIncompleteRequiredFields ? 1 : 0.78}
            style={[styles.submitBtn, { backgroundColor: hasIncompleteRequiredFields ? colors.border : colors.primary, opacity: saving || hasIncompleteRequiredFields ? 0.6 : 1 }]}
            onPress={handleSubmit}
            disabled={saving || hasIncompleteRequiredFields}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={[styles.submitBtnText, { color: hasIncompleteRequiredFields ? colors.textSecondary : "#fff" }]}>Create Production Team</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {alert ? <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} /> : null}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 14 },
  heroCard: { borderWidth: 1, borderRadius: 22, padding: 18 },
  heroIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold' },
  heroText: { marginTop: 6, fontSize: 13, lineHeight: 20, fontFamily: 'Poppins_400Regular' },
  formCard: { borderWidth: 1, borderRadius: 22, padding: 18 },
  label: { marginTop: 16, marginBottom: 10, fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Poppins_400Regular', textAlignVertical: 'center' },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  descriptionHint: { marginTop: 8, fontSize: 12, fontFamily: 'Poppins_400Regular' },
  helperText: { marginTop: 12, fontSize: 12, fontFamily: 'Poppins_500Medium' },
  submitBtn: { marginTop: 24, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Poppins_700Bold' },
});

