import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import BottomModal from './BottomModal';
import CustomAlert from './CustomAlert';

export const REPORT_REASONS_BY_TYPE: Record<string, string[]> = {
    group: [
        'Spam or scam',
        'Harassment or bullying',
        'Inappropriate content',
        'Fake profile or impersonation',
        'Hate speech',
        'Other',
    ],
    artist: [
        'Spam or scam',
        'Harassment or bullying',
        'Inappropriate content',
        'Fake profile or impersonation',
        'Hate speech',
        'Other',
    ],
    profile: [
        'Spam or scam',
        'Harassment or bullying',
        'Inappropriate content',
        'Fake profile or impersonation',
        'Hate speech',
        'Other',
    ],
    studio: [
        'False or misleading information',
        'Fake listing',
        'Inappropriate content or photos',
        'Price gouging or fraud',
        'Spam or scam',
        'Other',
    ],
    gig: [
        'Suspicious or fake gig',
        'Misleading job description',
        'Inappropriate content',
        'Non-payment or scam',
        'Spam',
        'Other',
    ],
    product: [
        'False or misleading listing',
        'Counterfeit or prohibited item',
        'Inappropriate images or description',
        'Spam or scam',
        'Unsafe or suspicious seller behavior',
        'Other',
    ],
    playlist: [
        'Inappropriate or offensive content',
        'Misleading or fake upload',
        'Spam or scam',
        'Harassment or bullying',
        'Unsafe or unauthorized content',
        'Other',
    ],
    music: [
        'Inappropriate or offensive content',
        'Misleading or fake upload',
        'Spam or scam',
        'Harassment or bullying',
        'Unsafe or unauthorized content',
        'Other',
    ],
};

// Fallback list (generic)
export const REPORT_REASONS = REPORT_REASONS_BY_TYPE.group;

interface ReportModalProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (reason: string, details?: string) => Promise<void>;
    targetName?: string;
    title?: string;
    reportType?: string;
}

export default function ReportModal({
    visible,
    onClose,
    onSubmit,
    targetName,
    title = 'Report',
    reportType,
}: ReportModalProps) {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const [selectedReason, setSelectedReason] = useState<string | null>(null);
    const [details, setDetails] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [feedbackVisible, setFeedbackVisible] = useState(false);

    // Pick reasons based on type; fallback to generic group reasons
    const reasons = (reportType && REPORT_REASONS_BY_TYPE[reportType.toLowerCase()])
        ? REPORT_REASONS_BY_TYPE[reportType.toLowerCase()]
        : REPORT_REASONS;

    const handleClose = () => {
        setSelectedReason(null);
        setDetails('');
        setSubmitted(false);
        setErrorMessage(null);
        setFeedbackVisible(false);
        onClose();
    };

    const handleSubmit = async () => {
        if (!selectedReason) {
            setFeedbackVisible(true);
            return;
        }
        setSubmitting(true);
        setErrorMessage(null);
        try {
            await onSubmit(selectedReason, details.trim() || undefined);
            setSubmitted(true);
        } catch (error: any) {
            setErrorMessage(error?.message || 'Unable to submit report right now.');
        } finally {
            setSubmitting(false);
        }
    };

    const cardBg = isDark ? '#1E2530' : '#FFFFFF';
    const overlayBg = 'rgba(0,0,0,0.65)';
    const itemBg = isDark ? '#252D3A' : '#F7F8FA';
    const selectedBg = isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.08)';
    const borderSelected = '#6366F1';
    const accent = colors.primary;

    return (
        <BottomModal
            visible={visible}
            overlayLabel="ReportModal"
            onClose={handleClose}
            backdropColor={overlayBg}
            closeOnBackdropPress
        >
                <Pressable
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: cardBg,
                            paddingBottom: Math.max(insets.bottom, 20) + 8,
                        },
                    ]}
                    onPress={() => {}} // prevent closing when tapping inside
                >
                    {/* Handle */}
                    <View style={styles.handle} />

                    {submitted ? (
                        /* ── Success State ── */
                        <View style={styles.successContainer}>
                            <View style={[styles.successIconWrap, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
                                <Ionicons name="shield-checkmark" size={48} color="#10B981" />
                            </View>
                            <Text style={[styles.successTitle, { color: colors.text }]}>
                                Report Submitted
                            </Text>
                            <Text style={[styles.successSub, { color: colors.textSecondary }]}>
                                Thanks for letting us know. Our team will review this report shortly and take appropriate action.
                            </Text>
                            <TouchableOpacity
                                style={[styles.doneBtn, { backgroundColor: accent }]}
                                onPress={handleClose}
                                activeOpacity={1}
                            >
                                <Text style={styles.doneBtnText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {/* Header */}
                            <View style={styles.headerRow}>
                                <TouchableOpacity activeOpacity={1} onPress={handleClose} style={styles.closeBtn} hitSlop={8}>
                                    <Ionicons name="close" size={22} color={colors.textSecondary} />
                                </TouchableOpacity>
                                <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
                                <View style={{ width: 38 }} />
                            </View>

                            {/* Sub-heading */}
                            <Text style={[styles.subheading, { color: colors.textSecondary }]}>
                                {targetName
                                    ? `What is wrong with ${targetName}?`
                                    : "What is the issue?"}
                            </Text>
                            <Text style={[styles.subheadingNote, { color: colors.textSecondary }]}>
                                Your report is anonymous. We will not share your identity with anyone.
                            </Text>

                            {/* Reasons List */}
                            <ScrollView
                                style={styles.reasonsScroll}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                {reasons.map((reason) => {
                                    const isSelected = selectedReason === reason;
                                    return (
                                        <TouchableOpacity
                                            key={reason}
                                            style={[
                                                styles.reasonRow,
                                                {
                                                    backgroundColor: isSelected ? selectedBg : itemBg,
                                                    borderColor: isSelected ? borderSelected : 'transparent',
                                                },
                                            ]}
                                            onPress={() => setSelectedReason(reason)}
                                            activeOpacity={1}
                                        >
                                            <Text
                                                style={[
                                                    styles.reasonText,
                                                    { color: isSelected ? borderSelected : colors.text },
                                                ]}
                                            >
                                                {reason}
                                            </Text>
                                            <View
                                                style={[
                                                    styles.radio,
                                                    {
                                                        borderColor: isSelected ? borderSelected : (isDark ? '#4B5563' : '#D1D5DB'),
                                                        backgroundColor: isSelected ? borderSelected : 'transparent',
                                                    },
                                                ]}
                                            >
                                                {isSelected && (
                                                    <Ionicons name="checkmark" size={13} color="#FFF" />
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}

                                {/* Additional details field – shown when "Other" is selected */}
                                {selectedReason === 'Other' && (
                                    <TextInput
                                        style={[
                                            styles.detailsInput,
                                            {
                                                backgroundColor: itemBg,
                                                color: colors.text,
                                                borderColor: isDark ? '#374151' : '#E5E7EB',
                                            },
                                        ]}
                                        placeholder="Tell us more (optional)…"
                                        placeholderTextColor={colors.textSecondary}
                                        multiline
                                        numberOfLines={3}
                                        value={details}
                                        onChangeText={setDetails}
                                        textAlignVertical="top"
                                    />
                                )}
                            </ScrollView>

                            {errorMessage ? (
                                <Text style={[styles.errorText, { color: '#EF4444' }]}>{errorMessage}</Text>
                            ) : null}

                            {/* Submit + Cancel */}
                            <View style={styles.footer}>
                                <TouchableOpacity
                                    style={[
                                        styles.submitBtn,
                                        {
                                            backgroundColor: selectedReason ? accent : (isDark ? '#374151' : '#E5E7EB'),
                                            opacity: submitting ? 0.7 : 1,
                                        },
                                    ]}
                                    onPress={handleSubmit}
                                    disabled={submitting || !selectedReason}
                                    activeOpacity={1}
                                >
                                    {submitting ? (
                                        <ActivityIndicator size="small" color="#FFF" />
                                    ) : (
                                        <Text
                                            style={[
                                                styles.submitBtnText,
                                                { color: selectedReason ? '#FFF' : colors.textSecondary },
                                            ]}
                                        >
                                            Submit Report
                                        </Text>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.cancelBtn, { borderColor: isDark ? '#374151' : '#E5E7EB' }]}
                                    onPress={handleClose}
                                    activeOpacity={1}
                                >
                                    <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                                        Cancel
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </Pressable>
            <CustomAlert
                visible={feedbackVisible}
                type="warning"
                title="Reason Required"
                message="Please select a reason before submitting your report."
                forceModal
                onClose={() => setFeedbackVisible(false)}
            />
        </BottomModal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    errorText: {
        fontSize: 13,
        fontWeight: '500',
        marginTop: 10,
    },
    sheet: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 12,
        maxHeight: '88%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 20,
    },
    handle: {
        width: 44,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#9CA3AF',
        alignSelf: 'center',
        marginBottom: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    closeBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(156,163,175,0.15)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
    },
    subheading: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 4,
    },
    subheadingNote: {
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 16,
    },
    reasonsScroll: {
        flexGrow: 0,
    },
    reasonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 14,
        marginBottom: 8,
        borderWidth: 1.5,
    },
    reasonText: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    radio: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    detailsInput: {
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        minHeight: 80,
        marginBottom: 8,
        marginTop: 4,
    },
    footer: {
        paddingTop: 12,
        gap: 10,
    },
    submitBtn: {
        height: 52,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    submitBtnText: {
        fontSize: 16,
        fontWeight: '700',
    },
    cancelBtn: {
        height: 48,
        borderRadius: 16,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelBtnText: {
        fontSize: 15,
        fontWeight: '500',
    },
    // Success state
    successContainer: {
        alignItems: 'center',
        paddingVertical: 24,
        paddingHorizontal: 16,
    },
    successIconWrap: {
        width: 96,
        height: 96,
        borderRadius: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    successTitle: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 10,
        textAlign: 'center',
    },
    successSub: {
        fontSize: 14,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 28,
    },
    doneBtn: {
        width: '100%',
        height: 52,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    doneBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
