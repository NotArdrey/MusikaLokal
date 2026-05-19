
import { Ionicons } from '@expo/vector-icons';
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    BottomSheetScrollView,
    useBottomSheetSpringConfigs,
} from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/src/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import TrackedBottomSheetModal from '../src/components/TrackedBottomSheetModal';
import { emitToast } from '../src/events/toastBus';
import { useTheme } from '../src/context/ThemeContext';
import { isE2EFixtureMode } from '../src/utils/e2eFixtures';
import { bottomSheetSpringConfig } from '../src/utils/motion';

type OnboardingStep = 'details' | 'verification' | 'email_verification';
type SignupRole = 'fan' | 'musician';
type VerificationMode = 'didit' | 'manual';

type SignupRoleOption = {
    role: SignupRole;
    title: string;
    description: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
};

type DocumentOption = {
    key: string;
    label: string;
    diditSupported: boolean;
    diditDocumentType?: 'passport' | 'id_card' | 'drivers_license';
};

type ManualUploadAsset = {
    base64: string;
    uri: string;
    mimeType: string;
    extension: string;
    fileName: string;
};

type MusicianVideoProofUpload = {
    uploadId: string;
    bucketName: string;
    path: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    expiresAt?: string | null;
};

type ManualImageTarget = 'front' | 'back' | 'selfie';

const ALLOWED_SIGNUP_ROLES: SignupRole[] = ['fan', 'musician'];
const MUSICIAN_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const MUSICIAN_VIDEO_ALLOWED_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']);

const SIGNUP_ROLE_OPTIONS: SignupRoleOption[] = [
    {
        role: 'fan',
        title: 'Register as a Fan',
        description: 'Follow artists, save favorites, and discover local music.',
        icon: 'heart-outline',
    },
    {
        role: 'musician',
        title: 'Register as a Musician',
        description: 'Create a music profile and join gigs, listings, and collaborations.',
        icon: 'musical-notes-outline',
    },
];

const PH_DOCUMENT_OPTIONS: DocumentOption[] = [
    { key: 'national_id', label: 'National ID card', diditSupported: true, diditDocumentType: 'id_card' },
    { key: 'passport', label: 'Passport', diditSupported: true, diditDocumentType: 'passport' },
    { key: 'drivers_license', label: 'Driver\'s license', diditSupported: true, diditDocumentType: 'drivers_license' },
    { key: 'health_insurance', label: 'Health Insurance Card', diditSupported: false },
    { key: 'umid', label: 'UMID', diditSupported: false },
    { key: 'postal_id', label: 'Postal ID', diditSupported: false },
    { key: 'voters_id', label: 'Voter\'s ID', diditSupported: false },
    { key: 'prc_id', label: 'PRC ID', diditSupported: false },
    { key: 'other', label: 'Other government ID', diditSupported: false },
];

const getDocumentOptionByKey = (key: string) => {
    return PH_DOCUMENT_OPTIONS.find((option) => option.key === key) ?? PH_DOCUMENT_OPTIONS[0];
};

const formatUploadFileSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const getVideoOriginalName = (asset: ImagePicker.ImagePickerAsset) => {
    const fallbackName = asset.uri?.split('/').pop() || 'music-video.mp4';
    return typeof (asset as any)?.fileName === 'string' && (asset as any).fileName.trim()
        ? (asset as any).fileName.trim()
        : fallbackName;
};

const resolveVideoMimeType = (asset: ImagePicker.ImagePickerAsset, originalName: string) => {
    const directMime = String(asset.mimeType || '').trim().toLowerCase();
    if (directMime === 'video/mov') return 'video/quicktime';
    if (MUSICIAN_VIDEO_ALLOWED_MIME_TYPES.has(directMime)) return directMime;

    const extension = (originalName.split('.').pop() || '').toLowerCase();
    if (extension === 'mov') return 'video/quicktime';
    if (extension === 'webm') return 'video/webm';
    if (extension === 'm4v') return 'video/x-m4v';
    return 'video/mp4';
};

const getVideoAssetSizeBytes = async (asset: ImagePicker.ImagePickerAsset) => {
    const directSize = Number((asset as any)?.fileSize || 0);
    if (Number.isFinite(directSize) && directSize > 0) return directSize;

    if (Platform.OS === 'web') {
        const webFile = (asset as any)?.file;
        if (typeof webFile?.size === 'number' && Number.isFinite(webFile.size)) return webFile.size;
        return null;
    }

    try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        return info.exists && typeof info.size === 'number' ? info.size : null;
    } catch {
        return null;
    }
};

const getSignedVideoUploadBody = async (asset: ImagePicker.ImagePickerAsset) => {
    if (Platform.OS === 'web') {
        const webFile = (asset as any)?.file;
        if (webFile) return webFile;
        return await (await fetch(asset.uri)).arrayBuffer();
    }

    return null;
};

const encodeStoragePath = (path: string) => {
    return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
};

const buildSignedVideoUploadUrl = (upload: any) => {
    const signedUrl = String(upload?.signedUrl || '').trim();
    if (signedUrl) {
        if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
        const baseUrl = supabaseUrl.replace(/\/+$/, '');
        return `${baseUrl}${signedUrl.startsWith('/') ? signedUrl : `/${signedUrl}`}`;
    }

    const baseUrl = supabaseUrl.replace(/\/+$/, '');
    const bucketName = String(upload?.bucketName || '').trim();
    const path = String(upload?.path || '').trim();
    const token = String(upload?.token || '').trim();
    return `${baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucketName)}/${encodeStoragePath(path)}?token=${encodeURIComponent(token)}`;
};

const readSignedVideoUploadError = (status: number, body?: string) => {
    let message = `Video upload failed with status ${status}.`;

    try {
        const parsed = JSON.parse(body || '{}');
        message = parsed?.message || parsed?.error || message;
    } catch {
        if (body) message = body;
    }

    return message;
};

const uploadMusicianVideoToSignedUrl = async (
    upload: any,
    asset: ImagePicker.ImagePickerAsset,
    mimeType: string,
) => {
    if (Platform.OS === 'web') {
        const uploadBody = await getSignedVideoUploadBody(asset);
        if (!uploadBody) {
            throw new Error('Could not read the selected video. Please try another file.');
        }

        const { error } = await supabase.storage
            .from(upload.bucketName)
            .uploadToSignedUrl(upload.path, upload.token, uploadBody as any, {
                contentType: mimeType,
            });

        if (error) {
            throw error;
        }

        return;
    }

    const uploadResult = await FileSystem.uploadAsync(buildSignedVideoUploadUrl(upload), asset.uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': mimeType,
            'cache-control': 'max-age=3600',
            'x-upsert': 'false',
        },
    });

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(readSignedVideoUploadError(uploadResult.status, uploadResult.body));
    }
};

const DEFAULT_SIGNUP_DOCUMENT_KEY = isE2EFixtureMode() ? 'health_insurance' : PH_DOCUMENT_OPTIONS[0].key;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENT_HINT = 'Use 8+ characters with uppercase, lowercase, a number, a symbol, and no spaces.';
const PASSWORD_REQUIREMENT_ERROR = 'Password must be at least 8 characters and include uppercase, lowercase, a number, a symbol, and no spaces.';
const PASSWORD_REQUIREMENTS = [
    { key: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (value: string) => value.length >= PASSWORD_MIN_LENGTH },
    { key: 'upper', label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
    { key: 'lower', label: 'One lowercase letter', test: (value: string) => /[a-z]/.test(value) },
    { key: 'number', label: 'One number', test: (value: string) => /[0-9]/.test(value) },
    { key: 'symbol', label: 'One symbol', test: (value: string) => /[^A-Za-z0-9\s]/.test(value) },
    { key: 'spaces', label: 'No spaces', test: (value: string) => !/\s/.test(value) },
];

const getPasswordRequirementState = (value: string) => PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    met: requirement.test(value),
}));

const getPasswordValidationError = (value: string) => {
    if (!getPasswordRequirementState(value).every((requirement) => requirement.met)) {
        return PASSWORD_REQUIREMENT_ERROR;
    }

    return '';
};

const isPasswordStrongEnough = (value: string) => !getPasswordValidationError(value);

const getLocalDateInputValue = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatSelectedDate = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

const isAllowedSignupRole = (role: unknown): role is SignupRole => {
    return typeof role === 'string' && ALLOWED_SIGNUP_ROLES.includes(role as SignupRole);
};

const isAdminRole = (role: unknown): boolean => {
    return typeof role === 'string' && role.toLowerCase() === 'admin';
};

const getSignupRoleFallbackName = (role: SignupRole) => role === 'fan' ? 'Fan' : 'Musician';

const isSupersededVerificationStatus = (status: unknown) => {
    const normalized = String(status || '').trim().toUpperCase();
    return normalized === 'SUPERSEDED' || normalized === 'SUPERSEDED_APPROVED';
};

const createEmailConfirmationRedirectUrl = () => {
    const baseUrl = Linking.createURL('/');
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}verified=true`;
};

const DIDIT_EMAIL_FLOW_LOG_PREFIX = '[DiditEmailFlow]';
const DIDIT_EMAIL_FLOW_DEBUG_VERSION = 'supabase-auth-signup-2026-05-03';
const SIGNUP_FLOW_LOG_PREFIX = '[SignupFlow]';
const SIGNUP_FLOW_DEBUG_VERSION = 'signup-diagnostics-2026-05-08';

const maskEmailForLog = (value?: string | null) => {
    const normalized = (value ?? '').trim();
    if (!normalized) return null;

    const [localPart, domain] = normalized.split('@');
    if (!domain) return normalized;

    const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length));
    return `${visiblePrefix}${localPart.length > 2 ? '***' : '*'}@${domain}`;
};

const summarizeErrorForDiditEmailLog = (error: unknown) => {
    const err = error as any;
    if (!err) return null;

    return {
        name: err.name ?? null,
        message: err.message ?? String(error),
        status: err.status ?? err.statusCode ?? null,
        code: err.code ?? err.error_code ?? null,
        details: err.details ?? null,
        hint: err.hint ?? null,
        rawKeys: typeof err === 'object' ? Object.keys(err) : [],
        contextStatus: err.context?.status ?? null,
        contextStatusText: err.context?.statusText ?? null,
    };
};

const summarizeAuthUserForDiditEmailLog = (user: any) => {
    if (!user) return null;

    return {
        id: user.id ?? null,
        email: maskEmailForLog(user.email),
        aud: user.aud ?? null,
        role: user.role ?? null,
        emailConfirmedAt: user.email_confirmed_at ?? null,
        confirmationSentAt: user.confirmation_sent_at ?? null,
        createdAt: user.created_at ?? null,
        identitiesCount: Array.isArray(user.identities) ? user.identities.length : null,
        metadata: {
            role: user.user_metadata?.role ?? null,
            isVerified: user.user_metadata?.is_verified ?? null,
            verificationStatus: user.user_metadata?.verification_status ?? null,
            diditSessionId: user.user_metadata?.didit_session_id ?? null,
        },
    };
};

const diditEmailDeliveryWasAccepted = (emailDelivery: any) => {
    return Boolean(emailDelivery?.sent || emailDelivery?.queued);
};

const diditEmailConfirmationWasDeferred = (payload: any, emailDelivery?: any) => {
    return Boolean(payload?.emailConfirmationDeferred || emailDelivery?.skipped);
};

const getEmailDeliveryFromInvokeError = (error: any) => {
    const responseBody = error?.responseBody;

    if (responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)) {
        return responseBody.emailDelivery ?? null;
    }

    if (typeof responseBody === 'string') {
        try {
            const parsed = JSON.parse(responseBody);
            return parsed?.emailDelivery ?? null;
        } catch {
            return null;
        }
    }

    return null;
};

const logDiditEmailFlow = (stage: string, payload: Record<string, unknown> = {}) => {
    console.log(`${DIDIT_EMAIL_FLOW_LOG_PREFIX} ${stage}`, {
        debugVersion: DIDIT_EMAIL_FLOW_DEBUG_VERSION,
        ...payload,
    });
};

const logDiditEmailFlowError = (stage: string, error: unknown, payload: Record<string, unknown> = {}) => {
    console.error(`${DIDIT_EMAIL_FLOW_LOG_PREFIX} ${stage}`, {
        debugVersion: DIDIT_EMAIL_FLOW_DEBUG_VERSION,
        ...payload,
        error: summarizeErrorForDiditEmailLog(error),
    });
};

const summarizeSessionRefForLog = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.startsWith('TEMP_')) {
        return `${raw.slice(0, 12)}...${raw.slice(-6)}`;
    }
    return raw.length > 14 ? `${raw.slice(0, 8)}...${raw.slice(-6)}` : raw;
};

const summarizeSignupInvokeData = (data: any) => {
    if (!data) return null;

    return {
        success: data.success ?? null,
        status: data.status ?? null,
        verificationStatus: data.verification_status ?? data.verification_data?.status ?? null,
        decision: data.decision ?? null,
        hasVerificationUrl: Boolean(data.verificationUrl || data.verification_url || data.url),
        sessionId: summarizeSessionRefForLog(data.sessionId || data.session_id || data.id),
        workflowId: data.workflowId || data.workflow_id || data.session?.workflow_id || null,
        hasSessionNonce: Boolean(data.sessionNonce),
        hasDerivedFullName: Boolean(data.derived?.fullName),
        diditProgress: {
            features: Array.isArray(data.features)
                ? data.features
                    .map((feature: any) => typeof feature === 'string' ? feature : feature?.feature || feature?.name || feature?.type)
                    .filter(Boolean)
                    .slice(0, 12)
                : [],
            idStatus: data.id_verifications?.[0]?.status || data.decision?.id_verifications?.[0]?.status || null,
            livenessCount: data.liveness_checks?.length ?? data.decision?.liveness_checks?.length ?? 0,
            livenessStatus: data.liveness_checks?.[0]?.status || data.decision?.liveness_checks?.[0]?.status || null,
            faceMatchCount: data.face_matches?.length ?? data.decision?.face_matches?.length ?? 0,
            faceMatchStatus: data.face_matches?.[0]?.status || data.decision?.face_matches?.[0]?.status || null,
            faceMatchScore:
                data.face_matches?.[0]?.score ??
                data.face_matches?.[0]?.similarity_percentage ??
                data.decision?.face_matches?.[0]?.score ??
                data.decision?.face_matches?.[0]?.similarity_percentage ??
                null,
        },
        error: data.error ?? null,
        details: data.details ?? null,
        reviewReason: data.verification_data?.review_reason ?? data.extracted_data?.review_reason ?? null,
        retryReason: data.verification_data?.retry_reason ?? data.extracted_data?.retry_reason ?? null,
        keys: typeof data === 'object' ? Object.keys(data).slice(0, 20) : [],
    };
};

const getDiditVerificationUrlFromInvokeData = (data: any) => {
    const candidates = [
        data?.verificationUrl,
        data?.verification_url,
        data?.url,
        data?.sessionUrl,
        data?.session_url,
        data?.session?.verificationUrl,
        data?.session?.verification_url,
        data?.session?.url,
    ];

    return candidates.find((value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim()))?.trim() || '';
};

const getSignupInvokeErrorMessage = (data: any) => {
    const error = String(data?.error || '').trim();
    const details = String(data?.details || '').trim();

    if (error && details && error.toLowerCase() !== 'internal server error') {
        return `${error}: ${details}`;
    }

    return details || error || 'Could not create verification session';
};

const normalizeDiditFlowStatus = (value: unknown) => String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();

const isApprovedDiditFlowStatus = (status: unknown) => normalizeDiditFlowStatus(status) === 'APPROVED';

const isPendingReviewDiditFlowStatus = (status: unknown) => [
    'PENDING_REVIEW',
    'PENDING_REVIEW_REQUIRED',
    'REVIEW',
    'MANUAL_REVIEW',
    'PENDING_MANUAL_REVIEW',
].includes(normalizeDiditFlowStatus(status));

const isFailedDiditFlowStatus = (status: unknown) => [
    'DECLINED',
    'REJECTED',
    'DENIED',
    'ABANDONED',
    'EXPIRED',
    'CANCELLED',
    'CANCELED',
].includes(normalizeDiditFlowStatus(status));

const isTerminalDiditFlowStatus = (status: unknown) => (
    isApprovedDiditFlowStatus(status) ||
    isPendingReviewDiditFlowStatus(status) ||
    isFailedDiditFlowStatus(status) ||
    isSupersededVerificationStatus(status)
);

const getDiditDecisionCandidates = (sessionData: any) => [
    sessionData?.decision,
    sessionData?.verification_data?.decision,
    sessionData?.verification_data,
    sessionData?.extracted_data?.decision,
    sessionData?.extracted_data,
    sessionData,
].filter(Boolean);

const firstDiditArray = (sessionData: any, key: string) => {
    for (const candidate of getDiditDecisionCandidates(sessionData)) {
        if (Array.isArray(candidate?.[key])) return candidate[key];
    }
    return [];
};

const diditSessionHasApprovedFaceMatch = (sessionData: any) => {
    const faceMatch = firstDiditArray(sessionData, 'face_matches')[0];
    const idVerification = firstDiditArray(sessionData, 'id_verifications')[0];

    return {
        hasFaceMatch: Boolean(faceMatch),
        faceStatus: normalizeDiditFlowStatus(faceMatch?.status),
        idStatus: normalizeDiditFlowStatus(idVerification?.status),
        approved: normalizeDiditFlowStatus(idVerification?.status) === 'APPROVED' &&
            normalizeDiditFlowStatus(faceMatch?.status) === 'APPROVED',
    };
};

const getDiditFlowStatusFromSession = (sessionData: any) => {
    const decisionCandidates = getDiditDecisionCandidates(sessionData);
    const idVerification = firstDiditArray(sessionData, 'id_verifications')[0];
    const faceMatch = firstDiditArray(sessionData, 'face_matches')[0];
    const idStatus = normalizeDiditFlowStatus(idVerification?.status);
    const faceStatus = normalizeDiditFlowStatus(faceMatch?.status);
    const businessStatuses = [
        sessionData?.status,
        sessionData?.verification_data?.status,
        sessionData?.businessStatus,
        sessionData?.verification_status,
        sessionData?.verification_data?.businessStatus,
    ].map(normalizeDiditFlowStatus).filter(Boolean);
    const sourceStatuses = [
        ...businessStatuses,
        sessionData?.diditResolvedStatus,
        sessionData?.rawDiditStatus,
        sessionData?.verification_data?.diditResolvedStatus,
        sessionData?.verification_data?.rawDiditStatus,
        ...decisionCandidates.map((candidate) => candidate?.status),
    ].map(normalizeDiditFlowStatus).filter(Boolean);

    const requiredCheckFailure = [idStatus, faceStatus].find(isFailedDiditFlowStatus);
    if (requiredCheckFailure) return requiredCheckFailure;

    if (idStatus === 'APPROVED' && faceStatus === 'APPROVED') {
        return businessStatuses.find(isPendingReviewDiditFlowStatus) ||
            businessStatuses.find(isApprovedDiditFlowStatus) ||
            'APPROVED';
    }

    const statuses = [idStatus, faceStatus, ...sourceStatuses].filter(Boolean);
    const failedStatus = sourceStatuses.find(isFailedDiditFlowStatus);
    if (failedStatus) return failedStatus;

    if (idStatus === 'PENDING_REVIEW' || faceStatus === 'PENDING_REVIEW') {
        return 'PENDING_REVIEW';
    }

    if (idStatus === 'APPROVED' && faceStatus !== 'APPROVED') {
        return 'PENDING';
    }

    return sourceStatuses.find(isPendingReviewDiditFlowStatus) ||
        sourceStatuses.find(isApprovedDiditFlowStatus) ||
        sourceStatuses[0] ||
        statuses[0] ||
        '';
};

const logSignupFlow = (stage: string, payload: Record<string, unknown> = {}) => {
    console.log(`${SIGNUP_FLOW_LOG_PREFIX} ${stage}`, {
        debugVersion: SIGNUP_FLOW_DEBUG_VERSION,
        timestamp: new Date().toISOString(),
        ...payload,
    });
};

const logSignupFlowError = (stage: string, error: unknown, payload: Record<string, unknown> = {}) => {
    console.log(`${SIGNUP_FLOW_LOG_PREFIX} ${stage}`, {
        debugVersion: SIGNUP_FLOW_DEBUG_VERSION,
        level: 'error',
        timestamp: new Date().toISOString(),
        ...payload,
        error: summarizeErrorForDiditEmailLog(error),
    });
};

export default function SignupScreen() {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const documentSheetRef = useRef<BottomSheetModal>(null);
    const manualExpirationSheetRef = useRef<BottomSheetModal>(null);
    const creatingDiditSessionRef = useRef(false);
    const lastVerificationEmailRef = useRef('');
    const diditStatusPollInFlightRef = useRef(false);
    const diditStatusPollFinalizedRef = useRef(false);
    const pendingReviewSignupRef = useRef(false);
    const documentSheetSnapPoints = useMemo(() => ['88%'], []);
    const manualCalendarSnapPoints = useMemo(() => ['70%'], []);
    const bottomSheetAnimationConfigs = useBottomSheetSpringConfigs(bottomSheetSpringConfig);

    // State
    // State
    const [step, setStep] = useState<OnboardingStep>('details');
    const [userId, setUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [verificationUrl, setVerificationUrl] = useState('');
    const [tempSessionRef, setTempSessionRef] = useState('');
    const [sessionId, setSessionId] = useState<string>('');
    const [sessionNonce, setSessionNonce] = useState<string>('');
    const [verificationMode, setVerificationMode] = useState<VerificationMode>('didit');
    const [selectedDocumentKey, setSelectedDocumentKey] = useState<string>(DEFAULT_SIGNUP_DOCUMENT_KEY);
    const [documentModalVisible, setDocumentModalVisible] = useState(false);
    const [manualFrontImage, setManualFrontImage] = useState<ManualUploadAsset | null>(null);
    const [manualBackImage, setManualBackImage] = useState<ManualUploadAsset | null>(null);
    const [manualSelfieImage, setManualSelfieImage] = useState<ManualUploadAsset | null>(null);
    const [manualFullName, setManualFullName] = useState('');
    const [manualIdNumber, setManualIdNumber] = useState('');
    const [manualIdExpiration, setManualIdExpiration] = useState('');
    const [manualExpirationCalendarVisible, setManualExpirationCalendarVisible] = useState(false);
    const [musicianVideoProof, setMusicianVideoProof] = useState<MusicianVideoProofUpload | null>(null);
    const [musicianVideoUploading, setMusicianVideoUploading] = useState(false);

    const { verified, session_id, check_verification, role } = useLocalSearchParams<{ verified: string; session_id: string; check_verification: string; role?: string }>();

    // Form Fields
    const [selectedRole, setSelectedRole] = useState<SignupRole>('fan');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

    const isSimpleTopToastButtons = (buttons?: any[]) => {
        if (!buttons || buttons.length === 0) return true;
        if (buttons.length !== 1) return false;

        const onlyButton = buttons[0];
        const normalizedText = String(onlyButton?.text ?? 'OK').trim().toLowerCase();
        const hasNoCallback = !onlyButton?.onPress;
        const isNeutralStyle =
            !onlyButton?.style || onlyButton.style === 'default' || onlyButton.style === 'cancel';

        return (
            hasNoCallback &&
            isNeutralStyle &&
            (normalizedText === 'ok' || normalizedText === 'close' || normalizedText === 'got it')
        );
    };

    const resolveAlertType = (title: string): AlertType => {
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes('error') || lowerTitle.includes('failed') || lowerTitle.includes('invalid') || lowerTitle.includes('timeout') || lowerTitle.includes('exists')) {
            return 'error';
        }
        if (lowerTitle.includes('success') || lowerTitle.includes('sent')) {
            return 'success';
        }
        if (lowerTitle.includes('pending') || lowerTitle.includes('processing') || lowerTitle.includes('required') || lowerTitle.includes('verification')) {
            return 'warning';
        }
        return 'info';
    };

    const showAlertNative = (title: string, message?: string, buttons?: any[]) => {
        const normalizedTitle = title || 'Notice';
        const normalizedMessage = message || '';
        const type = resolveAlertType(normalizedTitle);

        if ((type === 'success' || type === 'info') && isSimpleTopToastButtons(buttons)) {
            emitToast({
                type,
                title: normalizedTitle,
                message: normalizedMessage.trim() ? normalizedMessage : normalizedTitle,
            });
            return;
        }

        showAlert(type, normalizedTitle, normalizedMessage, buttons);
    };

    const Alert = { alert: showAlertNative };

    const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string; role?: string; document?: string; musicVideo?: string }>({});

    useEffect(() => {
        const requestedRole = Array.isArray(role) ? role[0] : role;
        if (isAllowedSignupRole(requestedRole)) {
            setSelectedRole(requestedRole);
        }
    }, [role]);

    const selectedDocumentOption = useMemo(() => getDocumentOptionByKey(selectedDocumentKey), [selectedDocumentKey]);
    const bottomSheetSurfaceColor = isDark ? '#1E2530' : '#FFFFFF';
    const renderSignupSheetBackdrop = useCallback((props: any) => (
        <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.65}
            pressBehavior="close"
        />
    ), []);
    const handleDocumentSheetDismiss = useCallback(() => {
        setDocumentModalVisible(false);
    }, []);
    const handleManualExpirationSheetDismiss = useCallback(() => {
        setManualExpirationCalendarVisible(false);
    }, []);
    const safeContentPadding = useMemo(() => ({
        paddingTop: Math.max(24, insets.top + 16),
        paddingBottom: Math.max(24, insets.bottom + 24),
    }), [insets.bottom, insets.top]);
    const safeManualFlowPadding = useMemo(() => ({
        paddingTop: Math.max(16, insets.top + 16),
        paddingBottom: Math.max(28, insets.bottom + 28),
    }), [insets.bottom, insets.top]);
    const safeVerificationHeaderPadding = useMemo(() => ({
        paddingTop: Math.max(16, insets.top + 16),
    }), [insets.top]);
    const safeModalPadding = useMemo(() => ({
        paddingBottom: Math.max(24, insets.bottom + 24),
    }), [insets.bottom]);

    useEffect(() => {
        if (documentModalVisible) {
            documentSheetRef.current?.present();
            return;
        }

        documentSheetRef.current?.dismiss();
    }, [documentModalVisible]);

    useEffect(() => {
        if (manualExpirationCalendarVisible) {
            manualExpirationSheetRef.current?.present();
            return;
        }

        manualExpirationSheetRef.current?.dismiss();
    }, [manualExpirationCalendarVisible]);

    // Reset verification state only after the user edits away from a known email.
    React.useEffect(() => {
        const normalizedEmail = email.trim().toLowerCase();
        const previousEmail = lastVerificationEmailRef.current;

        if (!previousEmail) {
            lastVerificationEmailRef.current = normalizedEmail;
            return;
        }

        if (previousEmail !== normalizedEmail) {
            logSignupFlow('email.changed.resetVerificationState', {
                previousEmail: maskEmailForLog(previousEmail),
                email: maskEmailForLog(normalizedEmail),
            });
            setVerificationUrl('');
            setSessionId('');
            setSessionNonce('');
            setTempSessionRef('');
            setMusicianVideoProof(null);
            AsyncStorage.removeItem('signup_current_session').catch((storageError) => {
                logSignupFlowError('email.changed.sessionClearError', storageError, {
                    storageKey: 'signup_current_session',
                });
            });
        }

        lastVerificationEmailRef.current = normalizedEmail;
    }, [email]);

    // Restore state on mount if returning from verification
    useEffect(() => {
        if (verified === 'true' || check_verification === 'true') {
            logSignupFlow('restoreState.requested', {
                verified,
                checkVerification: check_verification,
                sessionIdParam: summarizeSessionRefForLog(session_id),
            });
            const restoreState = async () => {
                try {
                    const savedState = await AsyncStorage.getItem('signup_current_session');
                    if (savedState) {
                        const {
                            email: sEmail,
                            password: sPassword,
                            selectedRole: sRole,
                            tempRef,
                            sSessionId,
                            sSessionNonce,
                            sVerificationUrl,
                            verificationMode: sVerificationMode,
                            selectedDocumentKey: sSelectedDocumentKey,
                            musicianVideoProof: sMusicianVideoProof,
                        } = JSON.parse(savedState);
                        logSignupFlow('restoreState.loaded', {
                            email: maskEmailForLog(sEmail),
                            hasPassword: Boolean(sPassword),
                            selectedRole: sRole ?? null,
                            verificationMode: sVerificationMode ?? null,
                            selectedDocumentKey: sSelectedDocumentKey ?? null,
                            tempRef: summarizeSessionRefForLog(tempRef),
                            sessionId: summarizeSessionRefForLog(sSessionId),
                            hasSessionNonce: Boolean(sSessionNonce),
                            sessionIdParam: summarizeSessionRefForLog(session_id),
                        });
                        if (sEmail) setEmail(sEmail);
                        if (sPassword) setPassword(sPassword);
                        if (isAllowedSignupRole(sRole)) {
                            setSelectedRole(sRole);
                        }
                        if (sVerificationMode === 'didit' || sVerificationMode === 'manual') {
                            setVerificationMode(sVerificationMode);
                        }
                        if (sSelectedDocumentKey) {
                            setSelectedDocumentKey(getDocumentOptionByKey(String(sSelectedDocumentKey)).key);
                        }
                        if (sMusicianVideoProof?.uploadId) {
                            setMusicianVideoProof(sMusicianVideoProof);
                        }
                        if (tempRef) setTempSessionRef(tempRef);
                        if (sSessionId) setSessionId(sSessionId);
                        if (sSessionNonce) setSessionNonce(sSessionNonce);
                        if (sVerificationUrl) setVerificationUrl(sVerificationUrl);

                        // If we have a session_id from params, override/set it
                        if (session_id) setSessionId(session_id);

                        setStep('verification');
                    } else {
                        logSignupFlow('restoreState.missingSavedState', {
                            verified,
                            checkVerification: check_verification,
                            sessionIdParam: summarizeSessionRefForLog(session_id),
                        });
                    }
                } catch (e) {
                    logSignupFlowError('restoreState.error', e, {
                        verified,
                        checkVerification: check_verification,
                        sessionIdParam: summarizeSessionRefForLog(session_id),
                    });
                }
            };
            restoreState();
        }
    }, [verified, check_verification, session_id]);

    // Polling System: Automatically check for verification completion
    // This bypasses any redirect issues by detecting status changes in the background
    useEffect(() => {
        let timer: any;
        let stopped = false;
        if (
            verificationMode === 'didit' &&
            step === 'verification' &&
            verificationUrl &&
            verified !== 'true' &&
            check_verification !== 'true'
        ) {
            let pollAttempt = 0;
            diditStatusPollFinalizedRef.current = false;
            logSignupFlow('backgroundPoll.started', {
                sessionId: summarizeSessionRefForLog(sessionId),
                tempSessionRef: summarizeSessionRefForLog(tempSessionRef),
                hasSessionNonce: Boolean(sessionNonce),
                hasVerificationUrl: Boolean(verificationUrl),
            });
            const poll = async () => {
                if (stopped || diditStatusPollInFlightRef.current || diditStatusPollFinalizedRef.current) return;
                const ref = sessionId || tempSessionRef;
                if (!ref) return;
                pollAttempt += 1;
                diditStatusPollInFlightRef.current = true;
                try {
                    const { data, error } = await supabase.functions.invoke('create-didit-session', {
                        body: { action: 'get_session', session_id: ref, sessionNonce }
                    });
                    if (stopped) return;
                    // Skip if there's an error (FunctionsHttpError) - just retry next poll
                    if (error) {
                        if (pollAttempt <= 3 || pollAttempt % 20 === 0) {
                            logSignupFlowError('backgroundPoll.invokeError', error, {
                                attempt: pollAttempt,
                                sessionId: summarizeSessionRefForLog(ref),
                                hasSessionNonce: Boolean(sessionNonce),
                            });
                        }
                        return;
                    }
                    const s = getDiditFlowStatusFromSession(data);
                    if (pollAttempt <= 3 || pollAttempt % 20 === 0 || isTerminalDiditFlowStatus(s)) {
                        logSignupFlow('backgroundPoll.result', {
                            attempt: pollAttempt,
                            sessionId: summarizeSessionRefForLog(ref),
                            status: s ?? null,
                            invokeData: summarizeSignupInvokeData(data),
                        });
                    }
                    // Only leave the Didit WebView automatically for clear pass/fail states.
                    // PENDING_REVIEW can appear while Face Match is still being prepared.
                    if (
                        isApprovedDiditFlowStatus(s) ||
                        isFailedDiditFlowStatus(s) ||
                        isSupersededVerificationStatus(s)
                    ) {
                        diditStatusPollFinalizedRef.current = true;
                        logSignupFlow('backgroundPoll.finalStatusDetected', {
                            attempt: pollAttempt,
                            sessionId: summarizeSessionRefForLog(ref),
                            status: s,
                        });
                        router.setParams({ check_verification: 'true' });
                    }
                } catch (e: any) {
                    // Silent catch - FunctionsHttpError or network errors are expected during polling
                    // The Didit session may not have a decision yet, which causes 404/500 errors
                    if (pollAttempt <= 3 || pollAttempt % 20 === 0) {
                        logSignupFlowError('backgroundPoll.exception', e, {
                            attempt: pollAttempt,
                            sessionId: summarizeSessionRefForLog(ref),
                            hasSessionNonce: Boolean(sessionNonce),
                        });
                    }
                } finally {
                    diditStatusPollInFlightRef.current = false;
                }
            };
            poll();
            timer = setInterval(poll, 2500);
        }
        return () => {
            stopped = true;
            if (timer) {
                logSignupFlow('backgroundPoll.stopped', {
                    sessionId: summarizeSessionRefForLog(sessionId),
                    tempSessionRef: summarizeSessionRefForLog(tempSessionRef),
                });
                clearInterval(timer);
            }
        };
    }, [step, verificationUrl, verified, sessionId, tempSessionRef, sessionNonce, check_verification, verificationMode]);

    // Auto-submit verification when data is ready and we are in the verification step
    useEffect(() => {
        let mounted = true;
        // Only run if we are in verification step, have all data, and came back from verification
        if (
            verificationMode === 'didit' &&
            step === 'verification' &&
            email &&
            password &&
            selectedRole &&
            (verified === 'true' || check_verification === 'true')
        ) {
            logSignupFlow('returnCheck.started', {
                email: maskEmailForLog(email),
                selectedRole,
                selectedDocumentKey,
                selectedDocumentLabel: selectedDocumentOption.label,
                verified,
                checkVerification: check_verification,
                sessionId: summarizeSessionRefForLog(sessionId),
                tempSessionRef: summarizeSessionRefForLog(tempSessionRef),
                hasSessionNonce: Boolean(sessionNonce),
            });

            const checkAndFinish = async (retries = 0) => {
                const refToCheck = sessionId || tempSessionRef;
                if (!refToCheck) {
                    logSignupFlow('returnCheck.missingSessionRef', {
                        retries,
                        hasEmail: Boolean(email),
                        selectedRole,
                    });
                    if (mounted) finishAccountCreation(); // Fallback
                    return;
                }

                try {
                    logSignupFlow('returnCheck.invoke.start', {
                        attempt: retries + 1,
                        sessionId: summarizeSessionRefForLog(refToCheck),
                        hasSessionNonce: Boolean(sessionNonce),
                    });
                    // Verify the ACTUAL status from Didit/Database
                    const { data: sessionData, error: invokeError } = await supabase.functions.invoke('create-didit-session', {
                        body: { action: 'get_session', session_id: refToCheck, sessionNonce }
                    });

                    if (invokeError) throw invokeError;
                    if (sessionData?.success === false && sessionData?.error) {
                        throw new Error(String(sessionData.error));
                    }

                    // Check status - supports robust checking of nested data
                    const status = getDiditFlowStatusFromSession(sessionData);
                    logSignupFlow('returnCheck.invoke.result', {
                        attempt: retries + 1,
                        sessionId: summarizeSessionRefForLog(refToCheck),
                        status: status ?? null,
                        invokeData: summarizeSignupInvokeData(sessionData),
                    });

                    // 1. SUCCESS
                    if (isApprovedDiditFlowStatus(status)) {
                        logSignupFlow('returnCheck.approved', {
                            attempt: retries + 1,
                            sessionId: summarizeSessionRefForLog(refToCheck),
                        });
                        if (mounted) finishAccountCreation();
                        return;
                    }

                    if (isPendingReviewDiditFlowStatus(status)) {
                        const faceMatchCheck = diditSessionHasApprovedFaceMatch(sessionData);
                        logSignupFlow('returnCheck.pendingReview', {
                            attempt: retries + 1,
                            sessionId: summarizeSessionRefForLog(refToCheck),
                            idStatus: faceMatchCheck.idStatus || null,
                            faceStatus: faceMatchCheck.faceStatus || null,
                            hasFaceMatch: faceMatchCheck.hasFaceMatch,
                        });
                        if (mounted) {
                            await finishAccountCreationPendingReview(refToCheck);
                        }
                        return;
                    }

                    // 2. FAILURE (Final) - Show alert and go back to signup form
                    if (isFailedDiditFlowStatus(status) || isSupersededVerificationStatus(status)) {
                        logSignupFlow('returnCheck.finalFailure', {
                            attempt: retries + 1,
                            sessionId: summarizeSessionRefForLog(refToCheck),
                            status,
                        });
                        setLoading(false);

                        // Clear all verification state
                        setVerificationUrl('');
                        setSessionId('');
                        setSessionNonce('');
                        setTempSessionRef('');
                        await AsyncStorage.removeItem('signup_current_session');
                        router.setParams({ verified: '', check_verification: '' });

                        // Determine the alert message based on status
                        let title = 'Verification Failed';
                        let message = 'Your identity could not be verified. Please try again.';

                        if (status === 'DECLINED' || status === 'Declined') {
                            title = 'Invalid I.D.';
                            message = 'Your I.D. was declined or does not match. Please try again with a valid government-issued I.D.';
                        } else if (status === 'ABANDONED' || status === 'Abandoned') {
                            title = 'Verification Incomplete';
                            message = 'You did not complete the verification process. Please try again.';
                        } else if (isSupersededVerificationStatus(status)) {
                            title = 'Verification Link Replaced';
                            message = 'This verification attempt was replaced by a newer one. Please start verification again.';
                        }

                        // Go back to signup form
                        setStep('details');

                        // Show alert AFTER going back
                        Alert.alert(title, message, [{ text: 'OK' }]);
                        return;
                    }

                    // 3. PENDING / RETRY (Created, Submitted, Processing)
                    const maxRetries = 60;
                    const retryDelayMs = 2000;
                    if (retries < maxRetries) {
                        if (retries < 5 || retries % 10 === 0) {
                            logSignupFlow('returnCheck.retryScheduled', {
                                nextAttempt: retries + 2,
                                maxRetries: maxRetries + 1,
                                retryDelayMs,
                                sessionId: summarizeSessionRefForLog(refToCheck),
                                status: status ?? null,
                            });
                        }
                        setTimeout(() => {
                            if (mounted) checkAndFinish(retries + 1);
                        }, retryDelayMs);
                    } else {
                        // Didit can return before its final decision is available. Keep
                        // the session so the user can retry without starting over.
                        logSignupFlow('returnCheck.stillProcessingAfterRetries', {
                            attempts: retries + 1,
                            sessionId: summarizeSessionRefForLog(refToCheck),
                            lastStatus: status ?? null,
                        });
                        setLoading(false);
                        Alert.alert(
                            'Still Processing',
                            'Didit is taking longer than usual to confirm your verification. Please wait a moment, then tap "I Have Verified" to check again.',
                            [{ text: 'OK' }]
                        );
                    }

                } catch (e: any) {
                    // Handle FunctionsHttpError gracefully
                    // FunctionsHttpError is thrown when the Edge Function returns non-2xx status
                    let errorStatus = null;
                    let errorMessage = e?.message || 'Unknown error';

                    // Try multiple ways to extract error details
                    try {
                        // Method 1: Check if error has a response body
                        if (e?.context?.body) {
                            const reader = e.context.body.getReader();
                            const result = await reader.read();
                            const text = new TextDecoder().decode(result.value);
                            const errorJson = JSON.parse(text);
                            errorStatus = getDiditFlowStatusFromSession(errorJson);
                        }
                    } catch { /* ignore parse errors */ }

                    try {
                        // Method 2: Check if it's a FunctionsHttpError with details in message
                        if (e?.name === 'FunctionsHttpError' && e?.message) {
                            // Sometimes the error message contains JSON
                            const jsonMatch = e.message.match(/\{.*\}/);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);
                                errorStatus = getDiditFlowStatusFromSession(parsed) || errorStatus;
                            }
                        }
                    } catch { /* ignore parse errors */ }


                    // If we got a status from error, handle it
                    if (errorStatus && isPendingReviewDiditFlowStatus(errorStatus)) {
                        logSignupFlow('returnCheck.errorStatusPendingReview', {
                            attempt: retries + 1,
                            sessionId: summarizeSessionRefForLog(refToCheck),
                            errorStatus,
                            errorMessage,
                        });
                        await finishAccountCreationPendingReview(refToCheck);
                        return;
                    }

                    if (errorStatus && (isFailedDiditFlowStatus(errorStatus) || isSupersededVerificationStatus(errorStatus))) {
                        logSignupFlow('returnCheck.errorStatusFinalFailure', {
                            attempt: retries + 1,
                            sessionId: summarizeSessionRefForLog(refToCheck),
                            errorStatus,
                            errorMessage,
                        });
                        setLoading(false);
                        setVerificationUrl('');
                        setSessionId('');
                        setSessionNonce('');
                        setTempSessionRef('');
                        await AsyncStorage.removeItem('signup_current_session');
                        router.setParams({ verified: '', check_verification: '' });

                        let title = 'Verification Failed';
                        let message = 'Please try again.';
                        if (errorStatus === 'DECLINED' || errorStatus === 'Declined') {
                            title = 'Invalid I.D.';
                            message = 'Your I.D. was declined. Please try again with a valid government-issued I.D.';
                        } else if (isSupersededVerificationStatus(errorStatus)) {
                            title = 'Verification Link Replaced';
                            message = 'This verification attempt was replaced by a newer one. Please start verification again.';
                        }

                        setStep('details');
                        Alert.alert(title, message, [{ text: 'OK' }]);
                        return;
                    }

                    const isSessionValidationError = /verification session could not be validated|start verification again|session_validation_failed/i.test(errorMessage);
                    if (isSessionValidationError) {
                        logSignupFlowError('returnCheck.sessionValidationReset', e, {
                            attempt: retries + 1,
                            sessionId: summarizeSessionRefForLog(refToCheck),
                            hasSessionNonce: Boolean(sessionNonce),
                            errorMessage,
                        });
                        setLoading(false);
                        setVerificationUrl('');
                        setSessionId('');
                        setSessionNonce('');
                        setTempSessionRef('');
                        await AsyncStorage.removeItem('signup_current_session');
                        router.setParams({ verified: '', check_verification: '' });
                        setStep('verification');

                        setTimeout(() => {
                            if (mounted) {
                                startNewVerificationSession({ forceNew: true }).catch((restartError) => {
                                    logSignupFlowError('returnCheck.sessionValidationRestartFailed', restartError, {
                                        previousSessionId: summarizeSessionRefForLog(refToCheck),
                                    });
                                });
                            }
                        }, 150);
                        return;
                    }

                    // Retry on network/function error (FunctionsHttpError is common during initial polling)
                    if (retries < 8) {
                        logSignupFlowError('returnCheck.exceptionRetryScheduled', e, {
                            attempt: retries + 1,
                            nextAttempt: retries + 2,
                            sessionId: summarizeSessionRefForLog(refToCheck),
                            errorStatus,
                            errorMessage,
                        });
                        setTimeout(() => { if (mounted) checkAndFinish(retries + 1); }, 2000);
                    } else {
                        logSignupFlowError('returnCheck.exceptionExhausted', e, {
                            attempts: retries + 1,
                            sessionId: summarizeSessionRefForLog(refToCheck),
                            errorStatus,
                            errorMessage,
                        });
                        setLoading(false);
                        Alert.alert(
                            'Connection Error',
                            'Could not connect to verification server. Please tap "I Have Verified" to try again.',
                            [{ text: 'OK' }]
                        );
                    }
                }
            };

            // Start the check loop
            checkAndFinish(0);

            return () => { mounted = false; };
        }
    }, [step, email, password, selectedRole, verified, check_verification, verificationMode, sessionId, tempSessionRef, sessionNonce]);

    const [permission, requestPermission] = useCameraPermissions();

    // Auto-start verification session for Mobile when entering verification step
    useEffect(() => {
        let mounted = true;
        if (
            verificationMode === 'didit' &&
            Platform.OS !== 'web' &&
            step === 'verification' &&
            !verificationUrl &&
            verified !== 'true' &&
            check_verification !== 'true'
        ) {
            logSignupFlow('mobileAutoStart.evaluate', {
                step,
                verificationMode,
                hasVerificationUrl: Boolean(verificationUrl),
                verified,
                permissionGranted: Boolean(permission?.granted),
                hasEmail: Boolean(email),
                selectedRole,
                selectedDocumentKey,
            });
            // Check permissions first
            if (!permission?.granted) {
                logSignupFlow('mobileAutoStart.requestCameraPermission', {
                    permissionStatus: permission?.status ?? null,
                });
                requestPermission().then(response => {
                    if (response.granted && mounted) {
                        logSignupFlow('mobileAutoStart.permissionGranted', {
                            permissionStatus: response.status ?? null,
                        });
                        // Permissions granted, start session
                        const timer = setTimeout(() => {
                            if (mounted) {
                                startNewVerificationSession().catch(e => undefined);
                            }
                        }, 100);
                    } else if (mounted) {
                        logSignupFlow('mobileAutoStart.permissionDenied', {
                            permissionStatus: response.status ?? null,
                        });
                        Alert.alert('Permission Required', 'Camera access is needed for identity verification.');
                    }
                });
            } else {
                logSignupFlow('mobileAutoStart.permissionAlreadyGranted', {
                    permissionStatus: permission?.status ?? null,
                });
                // Already granted
                const timer = setTimeout(() => {
                    if (mounted) {
                        startNewVerificationSession().catch(e => undefined);
                    }
                }, 100);
                return () => { clearTimeout(timer); mounted = false; };
            }
        }
        return () => { mounted = false; };
    }, [step, verificationUrl, verified, check_verification, permission, verificationMode]);


    // Theme Styles
    const themeStyles = {
        container: { backgroundColor: colors.background },
        text: { color: colors.text },
        textSecondary: { color: colors.textSecondary },
        inputContainer: {
            backgroundColor: isDark ? '#1F2937' : '#F9FAFB',
            borderColor: isDark ? '#374151' : '#E5E7EB',
        },
        primaryButton: { backgroundColor: colors.primary },
        primaryText: { color: colors.primary },
        card: {
            backgroundColor: isDark ? '#1F2937' : 'white',
            borderColor: isDark ? '#374151' : '#E5E7EB',
        }
    };
    const todayDateString = useMemo(() => getLocalDateInputValue(), []);
    const manualExpirationDateLabel = manualIdExpiration ? formatSelectedDate(manualIdExpiration) : 'Choose date';
    const manualExpirationCalendarCurrent = manualIdExpiration && manualIdExpiration >= todayDateString
        ? manualIdExpiration
        : todayDateString;
    const manualExpirationMarkedDates = useMemo(() => {
        if (!manualIdExpiration) return {};

        return {
            [manualIdExpiration]: {
                selected: true,
                selectedColor: colors.primary,
                selectedTextColor: '#FFFFFF',
            },
        };
    }, [colors.primary, manualIdExpiration]);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passwordRequirementState = useMemo(() => getPasswordRequirementState(password), [password]);
    const passwordStrengthScore = passwordRequirementState.filter((requirement) => requirement.met).length;
    const passwordStrengthPercent = (passwordStrengthScore / PASSWORD_REQUIREMENTS.length) * 100;
    const passwordStrengthLabel = passwordStrengthScore === PASSWORD_REQUIREMENTS.length
        ? 'Strong'
        : passwordStrengthScore >= 4
            ? 'Almost there'
            : passwordStrengthScore >= 2
                ? 'Weak'
                : 'Too weak';
    const passwordStrengthColor = passwordStrengthScore === PASSWORD_REQUIREMENTS.length
        ? '#16A34A'
        : passwordStrengthScore >= 4
            ? '#D97706'
            : '#DC2626';
    const showPasswordGuidance = Boolean(password) || Boolean(errors.password);
    const isMusicianSignup = selectedRole === 'musician';
    const isDetailsStepReady =
        isAllowedSignupRole(selectedRole) &&
        emailRegex.test(email.trim()) &&
        isPasswordStrongEnough(password) &&
        password === confirmPassword &&
        Boolean(selectedDocumentOption?.key) &&
        (!isMusicianSignup || Boolean(musicianVideoProof?.uploadId));
    const isManualReviewReady = !selectedDocumentOption.diditSupported &&
        Boolean(manualFrontImage) &&
        Boolean(manualBackImage) &&
        Boolean(manualSelfieImage) &&
        Boolean(manualFullName.trim()) &&
        Boolean(manualIdNumber.trim()) &&
        Boolean(manualIdExpiration.trim()) &&
        (!isMusicianSignup || Boolean(musicianVideoProof?.uploadId));

    const clearDiditSignupSession = useCallback(async (reason: string) => {
        setVerificationUrl('');
        setSessionId('');
        setSessionNonce('');
        setTempSessionRef('');
        try {
            await AsyncStorage.removeItem('signup_current_session');
            logSignupFlow('diditSession.cleared', {
                reason,
                storageKey: 'signup_current_session',
            });
        } catch (storageError) {
            logSignupFlowError('diditSession.clearError', storageError, {
                reason,
                storageKey: 'signup_current_session',
            });
        }
    }, []);

    const handleDocumentSelect = (documentKey: string) => {
        if (documentKey !== selectedDocumentKey) {
            void clearDiditSignupSession('document_changed');
        }
        setSelectedDocumentKey(documentKey);
        setDocumentModalVisible(false);
        if (errors.document) {
            setErrors((prev) => ({ ...prev, document: undefined }));
        }
    };

    const handleRoleSelect = (nextRole: SignupRole) => {
        if (nextRole !== selectedRole) {
            void clearDiditSignupSession('role_changed');
            if (nextRole !== 'musician') {
                setMusicianVideoProof(null);
            }
        }
        setSelectedRole(nextRole);
        if (errors.role) {
            setErrors((prev) => ({ ...prev, role: undefined }));
        }
    };

    const handleManualExpirationSelect = (day: DateData) => {
        if (day.dateString < todayDateString) {
            Alert.alert('Expired ID', 'Please choose an ID expiration date that is today or later.');
            return;
        }

        setManualIdExpiration(day.dateString);
        setManualExpirationCalendarVisible(false);
    };

    /**
     * Logic to handle account checking and creation (Step 2 -> 3)
     */

    // Helper to generate a fresh session URL
    const startNewVerificationSession = async ({ forceNew = true }: { forceNew?: boolean } = {}) => {
        if (creatingDiditSessionRef.current) {
            logSignupFlow('diditSession.startBlocked.inFlight', {
                email: maskEmailForLog(email),
                selectedRole,
                selectedDocumentKey,
                hasVerificationUrl: Boolean(verificationUrl),
                sessionId: summarizeSessionRefForLog(sessionId),
                tempSessionRef: summarizeSessionRefForLog(tempSessionRef),
            });
            return verificationUrl;
        }

        creatingDiditSessionRef.current = true;
        const existingSessionId = forceNew ? '' : sessionId;
        const existingSessionNonce = forceNew ? '' : sessionNonce;
        const tempRef = forceNew || !tempSessionRef
            ? `TEMP_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`
            : tempSessionRef;
        logSignupFlow('diditSession.start', {
            email: maskEmailForLog(email),
            selectedRole,
            selectedDocumentKey,
            selectedDocumentLabel: selectedDocumentOption.label,
            diditDocumentType: selectedDocumentOption?.diditDocumentType || 'id_card',
            tempRef: summarizeSessionRefForLog(tempRef),
            existingSessionId: summarizeSessionRefForLog(existingSessionId),
            hasExistingSessionNonce: Boolean(existingSessionNonce),
            forceNew,
            platform: Platform.OS,
        });
        setTempSessionRef(tempRef);

        // Persist state before redirecting
        try {
            await AsyncStorage.setItem('signup_current_session', JSON.stringify({
                email,
                password,
                selectedRole,
                tempRef,
                verificationMode,
                selectedDocumentKey,
                musicianVideoProof,
                sSessionId: existingSessionId || undefined,
                sSessionNonce: existingSessionNonce || undefined,
            }));
            logSignupFlow('diditSession.statePersisted.preCreate', {
                email: maskEmailForLog(email),
                selectedRole,
                verificationMode,
                selectedDocumentKey,
                tempRef: summarizeSessionRefForLog(tempRef),
                existingSessionId: summarizeSessionRefForLog(existingSessionId),
                hasExistingSessionNonce: Boolean(existingSessionNonce),
            });
        } catch (e) {
            logSignupFlowError('diditSession.statePersistFailed.preCreate', e, {
                tempRef: summarizeSessionRefForLog(tempRef),
            });
        }

        // NEUTRAL SIGNAL: Don't assume 'verified=true'. Just signal that flow returned.
        let redirectUrl = Linking.createURL('/', { queryParams: { check_verification: 'true' } });

        // WEB FIX: Explicitly use the current window location to ensure we return to this specific page
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('check_verification', 'true');
            // Remove old params if present
            currentUrl.searchParams.delete('verified');
            redirectUrl = currentUrl.toString();
        }
        logSignupFlow('diditSession.redirectPrepared', {
            tempRef: summarizeSessionRefForLog(tempRef),
            redirectUrl,
            platform: Platform.OS,
        });

        try {
            logSignupFlow('diditSession.invokeCreate.start', {
                functionName: 'create-didit-session',
                email: maskEmailForLog(email),
                selectedRole,
                tempRef: summarizeSessionRefForLog(tempRef),
                documentType: selectedDocumentOption?.diditDocumentType || 'id_card',
                hasRedirectUrl: Boolean(redirectUrl),
                existingSessionId: summarizeSessionRefForLog(existingSessionId),
                hasExistingSessionNonce: Boolean(existingSessionNonce),
                forceNew,
            });
            // Call our Edge Function to create the session
            // This ensures the callback URL is properly set to our verification-redirect function
            const { data, error } = await supabase.functions.invoke('create-didit-session', {
                body: {
                    userId: tempRef,
                    email: email || undefined, // Optional
                    role: selectedRole,
                    document_type: selectedDocumentOption?.diditDocumentType || 'id_card',
                    redirect_url: redirectUrl, // Tells the edge function where to eventually send the user
                    existing_session_id: existingSessionId || undefined,
                    sessionNonce: existingSessionNonce || undefined,
                    force_new: forceNew || undefined,
                }
            });

            if (error) throw error;
            logSignupFlow('diditSession.invokeCreate.result', {
                tempRef: summarizeSessionRefForLog(tempRef),
                invokeData: summarizeSignupInvokeData(data),
                workflowId: data?.workflowId || data?.workflow_id || null,
            });
            if (data?.success === false) {
                throw new Error(getSignupInvokeErrorMessage(data));
            }

            const createdVerificationUrl = getDiditVerificationUrlFromInvokeData(data);
            if (!createdVerificationUrl) throw new Error('No verification URL returned');

            // Save the ACTUAL Didit Session ID
            const createdSessionId = data.sessionId || data.session_id || data.id;
            const responseSessionNonce = typeof data.sessionNonce === 'string' ? data.sessionNonce : '';
            const createdSessionNonce = responseSessionNonce || (createdSessionId === existingSessionId ? existingSessionNonce : '');
            if (createdSessionId) {
                setSessionId(createdSessionId);
                setSessionNonce(createdSessionNonce);
                // Update storage with the real ID
                try {
                    await AsyncStorage.setItem('signup_current_session', JSON.stringify({
                        email,
                        password,
                        selectedRole,
                        tempRef,
                        verificationMode,
                        selectedDocumentKey,
                        musicianVideoProof,
                        sSessionId: createdSessionId,
                        sSessionNonce: createdSessionNonce,
                        sVerificationUrl: createdVerificationUrl,
                    }));
                    logSignupFlow('diditSession.statePersisted.postCreate', {
                        email: maskEmailForLog(email),
                        selectedRole,
                        verificationMode,
                        selectedDocumentKey,
                        tempRef: summarizeSessionRefForLog(tempRef),
                        sessionId: summarizeSessionRefForLog(createdSessionId),
                        hasSessionNonce: Boolean(createdSessionNonce),
                    });
                } catch (e) {
                    logSignupFlowError('diditSession.statePersistFailed.postCreate', e, {
                        tempRef: summarizeSessionRefForLog(tempRef),
                        sessionId: summarizeSessionRefForLog(createdSessionId),
                    });
                }
            } else {
                logSignupFlow('diditSession.missingSessionIdInResponse', {
                    tempRef: summarizeSessionRefForLog(tempRef),
                    invokeData: summarizeSignupInvokeData(data),
                });
            }

            setVerificationUrl(createdVerificationUrl);
            logSignupFlow('diditSession.ready', {
                tempRef: summarizeSessionRefForLog(tempRef),
                sessionId: summarizeSessionRefForLog(createdSessionId),
                workflowId: data?.workflowId || data?.workflow_id || null,
                hasSessionNonce: Boolean(createdSessionNonce),
                hasVerificationUrl: Boolean(createdVerificationUrl),
                reused: Boolean(data?.reused),
            });
            return createdVerificationUrl;
        } catch (e: any) {
            logSignupFlowError('diditSession.invokeCreate.error', e, {
                tempRef: summarizeSessionRefForLog(tempRef),
                email: maskEmailForLog(email),
                selectedRole,
                selectedDocumentKey,
                existingSessionId: summarizeSessionRefForLog(existingSessionId),
                hasExistingSessionNonce: Boolean(existingSessionNonce),
            });
            const errorMessage = String(e?.message || '').trim();
            const isRateLimited = e?.status === 429 || /too many/i.test(errorMessage);
            Alert.alert(
                isRateLimited ? 'Verification Paused' : 'Error',
                isRateLimited
                    ? errorMessage || 'Too many verification attempts. Please wait before trying again.'
                    : 'Could not start verification session. Please try again.',
            );
            return '';
        } finally {
            creatingDiditSessionRef.current = false;
        }
    };

    /**
     * Logic to handle transitioning to Verification (Step 2 -> 3)
     * We do NOT create the account yet. Verification happens first.
     */
    const handleWebVerify = async () => {
        logSignupFlow('openVerification.requested', {
            hasExistingVerificationUrl: Boolean(verificationUrl),
            sessionId: summarizeSessionRefForLog(sessionId),
            tempSessionRef: summarizeSessionRefForLog(tempSessionRef),
            hasSessionNonce: Boolean(sessionNonce),
            platform: Platform.OS,
        });
        let urlToOpen = verificationUrl;
        if (!urlToOpen) {
            urlToOpen = await startNewVerificationSession();
        }
        if (!urlToOpen) {
            logSignupFlow('openVerification.blockedNoUrl', {
                sessionId: summarizeSessionRefForLog(sessionId),
                tempSessionRef: summarizeSessionRefForLog(tempSessionRef),
            });
            return;
        }

        if (Platform.OS === 'web') {
            logSignupFlow('openVerification.webNavigate', {
                hasUrl: Boolean(urlToOpen),
            });
            window.open(urlToOpen, '_self');
        } else {
            logSignupFlow('openVerification.nativeAuthSession.start', {
                hasUrl: Boolean(urlToOpen),
                sessionId: summarizeSessionRefForLog(sessionId),
                tempSessionRef: summarizeSessionRefForLog(tempSessionRef),
            });
            await WebBrowser.openAuthSessionAsync(urlToOpen);
            logSignupFlow('openVerification.nativeAuthSession.returned', {
                sessionId: summarizeSessionRefForLog(sessionId),
                tempSessionRef: summarizeSessionRefForLog(tempSessionRef),
            });
        }
    };

    const handleMobileNavState = (event: any) => {
        // Intercept redirect and trigger verification check
        if (event.url.includes('check_verification=true') || event.url.includes('musikalokal://')) {
            router.setParams({ check_verification: 'true' });
        }
    };

    const saveManualImage = (target: ManualImageTarget, asset: ManualUploadAsset) => {
        if (target === 'front') {
            setManualFrontImage(asset);
            return;
        }

        if (target === 'back') {
            setManualBackImage(asset);
            return;
        }

        setManualSelfieImage(asset);
    };

    const normalizeManualImageAsset = (asset: ImagePicker.ImagePickerAsset, target: ManualImageTarget): ManualUploadAsset | null => {
        if (!asset.base64) {
            return null;
        }

        const uri = asset.uri || '';
        const inferredExtension = uri.split('.').pop()?.toLowerCase() || 'jpg';
        const extension = inferredExtension === 'jpeg' ? 'jpg' : inferredExtension;
        const mimeType = asset.mimeType || `image/${extension === 'jpg' ? 'jpeg' : extension}`;

        return {
            base64: asset.base64,
            uri,
            mimeType,
            extension,
            fileName: (asset as any)?.fileName || `${target}.${extension}`,
        };
    };

    const pickManualImage = async (target: ManualImageTarget) => {
        try {
            if (Platform.OS !== 'web') {
                const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (permissionResult.status !== 'granted') {
                    Alert.alert('Permission Required', 'Please allow photo access to upload your ID images.');
                    return;
                }
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.7,
                base64: true,
            });

            if (result.canceled || !result.assets?.[0]) {
                return;
            }

            const asset = result.assets[0];
            const normalized = normalizeManualImageAsset(asset, target);
            if (!normalized) {
                Alert.alert('Upload Failed', 'Could not read the selected image. Please try another file.');
                return;
            }

            saveManualImage(target, normalized);
        } catch (err: any) {
            console.error('Manual image picker error:', err);
            Alert.alert('Upload Failed', err?.message || 'Unable to select image.');
        }
    };

    const captureManualImage = async (target: ManualImageTarget) => {
        try {
            if (Platform.OS === 'web') {
                await pickManualImage(target);
                return;
            }

            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (permissionResult.status !== 'granted') {
                Alert.alert('Permission Required', 'Please allow camera access to capture your ID images.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.7,
                base64: true,
            });

            if (result.canceled || !result.assets?.[0]) {
                return;
            }

            const normalized = normalizeManualImageAsset(result.assets[0], target);
            if (!normalized) {
                Alert.alert('Capture Failed', 'Could not read the captured image. Please try again.');
                return;
            }

            saveManualImage(target, normalized);
        } catch (err: any) {
            console.error('Manual camera capture error:', err);
            Alert.alert('Capture Failed', err?.message || 'Unable to capture image.');
        }
    };

    const pickAndUploadMusicianVideoProof = async () => {
        if (selectedRole !== 'musician') {
            return;
        }

        if (!emailRegex.test(email.trim())) {
            Alert.alert('Email Required', 'Enter a valid email before uploading your music video proof.');
            return;
        }

        try {
            if (Platform.OS !== 'web') {
                const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (permissionResult.status !== 'granted') {
                    Alert.alert('Permission Required', 'Please allow media access to upload your music video proof.');
                    return;
                }
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['videos'],
                allowsEditing: false,
                quality: 1,
            });

            if (result.canceled || !result.assets?.[0]) {
                return;
            }

            const asset = result.assets[0];
            const originalName = getVideoOriginalName(asset);
            const mimeType = resolveVideoMimeType(asset, originalName);
            const sizeBytes = await getVideoAssetSizeBytes(asset);

            if (!MUSICIAN_VIDEO_ALLOWED_MIME_TYPES.has(mimeType)) {
                Alert.alert('Unsupported Video', 'Please upload an MP4, MOV, M4V, or WebM music video.');
                return;
            }

            if (!sizeBytes || sizeBytes > MUSICIAN_VIDEO_MAX_BYTES) {
                Alert.alert('Video Too Large', 'Please upload a music video that is 50MB or smaller.');
                return;
            }

            setMusicianVideoUploading(true);
            const { data: slotData, error: slotError } = await supabase.functions.invoke('manual-identity-review', {
                body: {
                    action: 'create_musician_video_upload',
                    email: email.trim(),
                    role: selectedRole,
                    originalName,
                    mimeType,
                    sizeBytes,
                },
            });

            if (slotError) {
                throw slotError;
            }

            const upload = (slotData as any)?.upload;
            if (!upload?.bucketName || !upload?.path || !upload?.token || !upload?.uploadId) {
                throw new Error('The server did not return a valid upload slot.');
            }

            await uploadMusicianVideoToSignedUrl(upload, asset, mimeType);

            setMusicianVideoProof({
                uploadId: upload.uploadId,
                bucketName: upload.bucketName,
                path: upload.path,
                originalName,
                mimeType,
                sizeBytes,
                expiresAt: upload.expiresAt || null,
            });
            Alert.alert('Video Uploaded', 'Your music video proof is attached. Continue with identity verification next.');
        } catch (err: any) {
            console.error('Musician video proof upload failed:', err);
            Alert.alert('Upload Failed', err?.message || 'Unable to upload your music video proof.');
        } finally {
            setMusicianVideoUploading(false);
        }
    };

    const finishAccountCreationPendingReview = async (refToLink?: string) => {
        if (pendingReviewSignupRef.current) {
            logSignupFlow('pendingReviewAccountCreation.blocked', {
                reason: 'already_in_flight',
                diditSessionId: summarizeSessionRefForLog(refToLink),
            });
            return;
        }
        pendingReviewSignupRef.current = true;
        logSignupFlow('pendingReviewAccountCreation.start', {
            email: maskEmailForLog(email),
            selectedRole,
            selectedDocumentKey,
            selectedDocumentLabel: selectedDocumentOption.label,
            diditSessionId: summarizeSessionRefForLog(refToLink),
            hasSessionNonce: Boolean(sessionNonce),
        });
        if (!email || !password || !selectedRole) {
            logSignupFlow('pendingReviewAccountCreation.blocked', {
                reason: 'missing_signup_state',
                hasEmail: Boolean(email),
                hasPassword: Boolean(password),
                hasSelectedRole: Boolean(selectedRole),
            });
            Alert.alert('Session Reset', 'Please re-enter your details to continue signup.');
            setStep('details');
            pendingReviewSignupRef.current = false;
            return;
        }

        if (!isAllowedSignupRole(selectedRole) || isAdminRole(selectedRole)) {
            logSignupFlow('pendingReviewAccountCreation.blocked', {
                reason: 'unsupported_role',
                selectedRole,
            });
            Alert.alert('Unsupported Account Type', 'Only fan and musician accounts can be registered right now.');
            setStep('details');
            pendingReviewSignupRef.current = false;
            return;
        }

        if (selectedRole === 'musician' && !musicianVideoProof?.uploadId) {
            Alert.alert('Music Video Required', 'Please upload your music video proof before continuing.');
            setStep('details');
            pendingReviewSignupRef.current = false;
            return;
        }

        setLoading(true);

        const fallbackName = email.split('@')[0] || getSignupRoleFallbackName(selectedRole);

        try {
            const emailRedirectTo = createEmailConfirmationRedirectUrl();
            logSignupFlow('pendingReviewAccountCreation.invoke.start', {
                functionName: 'create-unverified-user',
                email: maskEmailForLog(email),
                selectedRole,
                diditSessionId: summarizeSessionRefForLog(refToLink),
                hasSessionNonce: Boolean(sessionNonce),
                redirectTo: emailRedirectTo,
            });
            const { error: pendingSignupError } = await supabase.functions.invoke('create-unverified-user', {
                body: {
                    email: email.trim(),
                    password,
                    role: selectedRole,
                    fullName: fallbackName,
                    isVerified: false,
                    verificationStatus: 'PENDING_REVIEW',
                    diditSessionId: refToLink || null,
                    sessionNonce,
                    selectedDocumentType: selectedDocumentOption.label,
                    selectedDocumentTypeKey: selectedDocumentOption.key,
                    verificationMode: 'didit',
                    musicVideoUploadId: selectedRole === 'musician' ? musicianVideoProof?.uploadId : null,
                    redirectTo: emailRedirectTo,
                },
            });

            if (pendingSignupError) {
                logSignupFlowError('pendingReviewAccountCreation.invoke.error', pendingSignupError, {
                    diditSessionId: summarizeSessionRefForLog(refToLink),
                    email: maskEmailForLog(email),
                });
                throw pendingSignupError;
            }
            logSignupFlow('pendingReviewAccountCreation.invoke.success', {
                diditSessionId: summarizeSessionRefForLog(refToLink),
                email: maskEmailForLog(email),
            });

            try {
                await AsyncStorage.removeItem('signup_current_session');
                logSignupFlow('pendingReviewAccountCreation.sessionCleared', {
                    storageKey: 'signup_current_session',
                });
            } catch {
            }

            setVerificationUrl('');
            setSessionId('');
            setSessionNonce('');
            setTempSessionRef('');
            router.setParams({ verified: '', check_verification: '' });

            router.replace({
                pathname: '/',
                params: {
                    accountCreated: 'true',
                    email,
                    diditPendingReview: 'true',
                },
            } as any);
            logSignupFlow('pendingReviewAccountCreation.redirectLogin', {
                email: maskEmailForLog(email),
                diditSessionId: summarizeSessionRefForLog(refToLink),
            });
        } catch (authErr: any) {
            logSignupFlowError('pendingReviewAccountCreation.catch', authErr, {
                email: maskEmailForLog(email),
                diditSessionId: summarizeSessionRefForLog(refToLink),
            });
            Alert.alert('Creation Failed', authErr?.message || 'Unable to create your account right now.');
        } finally {
            setLoading(false);
            pendingReviewSignupRef.current = false;
        }
    };

    const submitManualReviewSignup = async () => {
        logSignupFlow('manualSignup.submitRequested', {
            email: maskEmailForLog(email),
            selectedRole,
            selectedDocumentKey,
            selectedDocumentLabel: selectedDocumentOption.label,
            diditSupported: selectedDocumentOption.diditSupported,
            hasFrontImage: Boolean(manualFrontImage),
            hasBackImage: Boolean(manualBackImage),
            hasSelfieImage: Boolean(manualSelfieImage),
            hasManualFullName: Boolean(manualFullName.trim()),
            hasManualIdNumber: Boolean(manualIdNumber.trim()),
            hasManualIdExpiration: Boolean(manualIdExpiration.trim()),
        });
        if (selectedDocumentOption.diditSupported) {
            logSignupFlow('manualSignup.blocked', {
                reason: 'document_supported_by_didit',
                selectedDocumentKey,
            });
            Alert.alert('Supported ID', 'This document is supported by Didit. Please continue with automatic verification.');
            return;
        }

        if (!manualFrontImage) {
            logSignupFlow('manualSignup.blocked', { reason: 'missing_front_image' });
            Alert.alert('Upload Required', 'Please upload the front photo of your ID to continue.');
            return;
        }

        if (!manualBackImage) {
            logSignupFlow('manualSignup.blocked', { reason: 'missing_back_image' });
            Alert.alert('Upload Required', 'Please upload the back photo of your ID to continue.');
            return;
        }

        if (!manualSelfieImage) {
            logSignupFlow('manualSignup.blocked', { reason: 'missing_selfie_image' });
            Alert.alert('Upload Required', 'Please upload a selfie holding your ID to continue.');
            return;
        }

        const enteredFullName = manualFullName.trim();
        const enteredIdNumber = manualIdNumber.trim();
        const enteredIdExpiration = manualIdExpiration.trim();
        const expirationDate = new Date(`${enteredIdExpiration}T00:00:00Z`);

        if (!enteredFullName) {
            logSignupFlow('manualSignup.blocked', { reason: 'missing_full_name' });
            Alert.alert('Name Required', 'Please enter the full name shown on your ID.');
            return;
        }

        if (!enteredIdNumber) {
            logSignupFlow('manualSignup.blocked', { reason: 'missing_id_number' });
            Alert.alert('ID Number Required', 'Please enter the ID number shown on your document.');
            return;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(enteredIdExpiration) || Number.isNaN(expirationDate.getTime()) || expirationDate.toISOString().slice(0, 10) !== enteredIdExpiration) {
            logSignupFlow('manualSignup.blocked', {
                reason: 'invalid_expiration_date',
                enteredIdExpiration,
            });
            Alert.alert('Invalid Expiration Date', 'Please enter the ID expiration date in YYYY-MM-DD format.');
            return;
        }

        if (enteredIdExpiration < getLocalDateInputValue()) {
            logSignupFlow('manualSignup.blocked', {
                reason: 'expired_id',
                enteredIdExpiration,
            });
            Alert.alert('Expired ID', 'Please choose an ID expiration date that is today or later.');
            return;
        }

        if (!email || !password || !selectedRole) {
            logSignupFlow('manualSignup.blocked', {
                reason: 'missing_signup_state',
                hasEmail: Boolean(email),
                hasPassword: Boolean(password),
                hasSelectedRole: Boolean(selectedRole),
            });
            Alert.alert('Session Reset', 'Please go back and complete your signup details first.');
            setStep('details');
            return;
        }

        if (selectedRole === 'musician' && !musicianVideoProof?.uploadId) {
            Alert.alert('Music Video Required', 'Please upload your music video proof before submitting manual review.');
            setStep('details');
            return;
        }

        setLoading(true);

        try {
            logSignupFlow('manualSignup.invoke.start', {
                functionName: 'manual-identity-review',
                action: 'submit_manual_review_signup',
                email: maskEmailForLog(email),
                selectedRole,
                selectedDocumentKey,
                selectedDocumentLabel: selectedDocumentOption.label,
                idExpiration: enteredIdExpiration,
                imageSummary: {
                    front: manualFrontImage ? { mimeType: manualFrontImage.mimeType, extension: manualFrontImage.extension } : null,
                    back: manualBackImage ? { mimeType: manualBackImage.mimeType, extension: manualBackImage.extension } : null,
                    selfie: manualSelfieImage ? { mimeType: manualSelfieImage.mimeType, extension: manualSelfieImage.extension } : null,
                },
            });
            const { error: manualSubmitError } = await supabase.functions.invoke('manual-identity-review', {
                body: {
                    action: 'submit_manual_review_signup',
                    email: email.trim(),
                    password,
                    role: selectedRole,
                    fullName: enteredFullName,
                    identityDocumentNumber: enteredIdNumber,
                    idDocumentExpiry: enteredIdExpiration,
                    documentType: selectedDocumentOption.label,
                    documentTypeKey: selectedDocumentOption.key,
                    documentCountry: 'PHL',
                    musicVideoUploadId: selectedRole === 'musician' ? musicianVideoProof?.uploadId : null,
                    frontImage: manualFrontImage,
                    backImage: manualBackImage,
                    selfieImage: manualSelfieImage,
                },
            });

            if (manualSubmitError) {
                logSignupFlowError('manualSignup.invoke.error', manualSubmitError, {
                    email: maskEmailForLog(email),
                    selectedRole,
                    selectedDocumentKey,
                });
                throw manualSubmitError;
            }
            logSignupFlow('manualSignup.invoke.success', {
                email: maskEmailForLog(email),
                selectedRole,
                selectedDocumentKey,
            });

            try {
                await AsyncStorage.removeItem('signup_current_session');
                logSignupFlow('manualSignup.sessionCleared', {
                    storageKey: 'signup_current_session',
                });
            } catch (storageError) {
                logSignupFlowError('manualSignup.sessionClearError', storageError, {
                    storageKey: 'signup_current_session',
                });
            }

            router.replace({
                pathname: '/',
                params: {
                    accountCreated: 'true',
                    email,
                    verificationPendingReview: 'true',
                },
            } as any);
            logSignupFlow('manualSignup.redirectLogin', {
                email: maskEmailForLog(email),
                verificationPendingReview: true,
            });
        } catch (authErr: any) {
            logSignupFlowError('manualSignup.catch', authErr, {
                email: maskEmailForLog(email),
                selectedRole,
                selectedDocumentKey,
            });
            if (authErr?.message?.includes('already registered') || authErr?.status === 422) {
                Alert.alert('Account Exists', 'This email is already registered. Please log in to continue.');
                return;
            }

            Alert.alert('Manual Review Failed', authErr?.message || 'Unable to submit your manual review request.');
        } finally {
            setLoading(false);
        }
    };

    const handleNext = async () => {
        logSignupFlow('detailsNext.pressed', {
            email: maskEmailForLog(email),
            selectedRole,
            selectedDocumentKey,
            selectedDocumentLabel: selectedDocumentOption.label,
            diditSupported: selectedDocumentOption.diditSupported,
            passwordLength: password.length,
            confirmPasswordLength: confirmPassword.length,
            passwordsMatch: password === confirmPassword,
        });
        setErrors({});
        const newErrors: any = {};

        if (!isAllowedSignupRole(selectedRole)) {
            logSignupFlow('detailsNext.blocked', {
                reason: 'unsupported_role',
                selectedRole,
            });
            setErrors({ role: 'Please select a valid account type.' });
            Alert.alert('Unsupported Account Type', 'Only fan and musician accounts can be registered right now.');
            setStep('details');
            return;
        }

        // Basic Validation
        if (!email) newErrors.email = 'Required';
        else if (!emailRegex.test(email)) newErrors.email = 'Invalid email';

        if (!password) {
            newErrors.password = 'Required';
        } else {
            const passwordError = getPasswordValidationError(password);
            if (passwordError) newErrors.password = passwordError;
        }

        if (!selectedDocumentOption?.key) {
            newErrors.document = 'Please select an ID type';
        }

        if (selectedRole === 'musician' && !musicianVideoProof?.uploadId) {
            newErrors.musicVideo = 'Please upload your music video proof';
        }

        if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

        if (Object.keys(newErrors).length > 0) {
            logSignupFlow('detailsNext.validationFailed', {
                email: maskEmailForLog(email),
                selectedRole,
                selectedDocumentKey,
                errorFields: Object.keys(newErrors),
                errors: newErrors,
            });
            setErrors(newErrors);
            const issues = Object.entries(newErrors).map(([field, message]) => {
                const label =
                    field === 'confirmPassword'
                        ? 'Confirm password'
                        : field.charAt(0).toUpperCase() + field.slice(1);
                return `${label}: ${message}`;
            });
            Alert.alert(
                'Required Fields',
                `Please fix the following before continuing:\n- ${issues.join('\n- ')}`,
            );
            return;
        }

        setLoading(true);

        try {
            logSignupFlow('detailsNext.profileLookup.start', {
                email: maskEmailForLog(email),
            });
            // Check if profile exists (optional, nice to have to prevent dupe emails early)
            const { data: profile } = await supabase
                .from('profiles')
                .select('id, is_verified, role, verification_status')
                .eq('email', email.trim())
                .maybeSingle();
            logSignupFlow('detailsNext.profileLookup.result', {
                email: maskEmailForLog(email),
                foundProfile: Boolean(profile),
                profileId: summarizeSessionRefForLog((profile as any)?.id),
                profileRole: (profile as any)?.role ?? null,
                profileVerificationStatus: (profile as any)?.verification_status ?? null,
                profileIsVerified: Boolean((profile as any)?.is_verified),
            });

            if (isAdminRole(profile?.role)) {
                logSignupFlow('detailsNext.blocked', {
                    reason: 'admin_profile',
                    email: maskEmailForLog(email),
                    profileId: summarizeSessionRefForLog((profile as any)?.id),
                });
                Alert.alert('Unsupported Account Type', 'Admin accounts cannot be used in the mobile app.');
                setLoading(false);
                return;
            }

            if (profile) {
                const existingStatus = String((profile as any).verification_status || '').trim().toUpperCase();
                const canRetryVerification = ['DECLINED', 'ABANDONED'].includes(existingStatus);

                if (profile.is_verified) {
                    logSignupFlow('detailsNext.blocked', {
                        reason: 'existing_verified_profile',
                        email: maskEmailForLog(email),
                        profileId: summarizeSessionRefForLog((profile as any)?.id),
                        existingStatus,
                    });
                    Alert.alert('Account Exists', 'This email is already registered and verified. Please login.', [{ text: 'Login', onPress: () => router.push('/') }]);
                    setLoading(false);
                    return;
                }

                if (!canRetryVerification) {
                    logSignupFlow('detailsNext.blocked', {
                        reason: 'existing_profile_not_retryable',
                        email: maskEmailForLog(email),
                        profileId: summarizeSessionRefForLog((profile as any)?.id),
                        existingStatus,
                    });
                    Alert.alert('Account Exists', 'This email is already registered. Please login to continue verification.', [{ text: 'Login', onPress: () => router.push('/') }]);
                    setLoading(false);
                    return;
                }
            }

            if (selectedDocumentOption.diditSupported) {
                logSignupFlow('detailsNext.modeSelected', {
                    mode: 'didit',
                    selectedDocumentKey,
                    selectedDocumentLabel: selectedDocumentOption.label,
                    diditDocumentType: selectedDocumentOption.diditDocumentType,
                });
                await clearDiditSignupSession('enter_didit_verification');
                setVerificationMode('didit');
                setManualFrontImage(null);
                setManualBackImage(null);
                setManualSelfieImage(null);
            } else {
                logSignupFlow('detailsNext.modeSelected', {
                    mode: 'manual',
                    selectedDocumentKey,
                    selectedDocumentLabel: selectedDocumentOption.label,
                });
                setVerificationMode('manual');
                setVerificationUrl('');
                setSessionId('');
                setSessionNonce('');
                setTempSessionRef('');
            }

            // Proceed to Verification Step WITHOUT creating account
            setStep('verification');
            logSignupFlow('detailsNext.stepChanged', {
                nextStep: 'verification',
                verificationMode: selectedDocumentOption.diditSupported ? 'didit' : 'manual',
                email: maskEmailForLog(email),
            });

        } catch (e: any) {
            logSignupFlowError('detailsNext.error', e, {
                email: maskEmailForLog(email),
                selectedRole,
                selectedDocumentKey,
            });
            Alert.alert('Error', 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    const finishAccountCreation = async () => {
        // 1. Sanity Check: Ensure we have params
        if (!email || !password || !selectedRole) {
            logDiditEmailFlow('finishAccountCreation.blocked', {
                reason: 'missing_signup_state',
                hasEmail: Boolean(email),
                hasPassword: Boolean(password),
                hasSelectedRole: Boolean(selectedRole),
                platform: Platform.OS,
            });
            Alert.alert('Session Reset', 'Please re-enter your details to finish creating your account.', [{
                text: 'OK', onPress: () => {
                    router.setParams({ verified: '' });
                    setStep('details');
                }
            }]);
            return;
        }

        if (!isAllowedSignupRole(selectedRole) || isAdminRole(selectedRole)) {
            logDiditEmailFlow('finishAccountCreation.blocked', {
                reason: 'unsupported_role',
                selectedRole,
                platform: Platform.OS,
            });
            Alert.alert('Unsupported Account Type', 'Only fan and musician accounts can be registered right now.');
            setStep('details');
            return;
        }

        if (selectedRole === 'musician' && !musicianVideoProof?.uploadId) {
            Alert.alert('Music Video Required', 'Please upload your music video proof before creating a musician account.');
            setStep('details');
            return;
        }

        // 2. Security Check: Validate the verification result on the server
        const refToLink = sessionId || tempSessionRef || verificationUrl.split('reference=')[1]?.split('&')[0];

        logDiditEmailFlow('finishAccountCreation.start', {
            email: maskEmailForLog(email),
            selectedRole,
            verificationMode,
            documentType: selectedDocumentOption.label,
            documentTypeKey: selectedDocumentOption.key,
            diditSessionId: refToLink ?? null,
            sessionIdState: sessionId || null,
            tempSessionRefState: tempSessionRef || null,
            hasVerificationUrl: Boolean(verificationUrl),
            platform: Platform.OS,
        });

        if (!refToLink) {
            logDiditEmailFlow('finishAccountCreation.blocked', {
                reason: 'missing_didit_session',
                email: maskEmailForLog(email),
                sessionIdState: sessionId || null,
                tempSessionRefState: tempSessionRef || null,
                verificationUrlContainsReference: verificationUrl.includes('reference='),
                platform: Platform.OS,
            });
            Alert.alert('Verification Error', 'No verification session found. Please try confirming your identity again.');
            return;
        }

        setLoading(true);

        // Fetch Didit Data via Edge Function
        let verifiedName = '';
        let verifiedNameSource: 'didit' | 'email_fallback' = 'email_fallback';
        let diditSessionData: any = null;
        try {
            logDiditEmailFlow('didit.getSession.start', {
                diditSessionId: refToLink,
                email: maskEmailForLog(email),
                platform: Platform.OS,
            });

            const { data: sessionData, error: invokeError } = await supabase.functions.invoke('create-didit-session', {
                body: { action: 'get_session', session_id: refToLink, sessionNonce }
            });

            if (invokeError) {
                logDiditEmailFlowError('didit.getSession.invokeError', invokeError, {
                    diditSessionId: refToLink,
                    email: maskEmailForLog(email),
                    platform: Platform.OS,
                });
            }

            if (sessionData) {
                diditSessionData = sessionData;
                const diditSessionForLog = sessionData as any;
                const faceMatchCheck = diditSessionHasApprovedFaceMatch(sessionData);
                logDiditEmailFlow('didit.getSession.result', {
                    diditSessionId: refToLink,
                    email: maskEmailForLog(email),
                    sessionKeys: typeof sessionData === 'object' ? Object.keys(sessionData as Record<string, unknown>) : [],
                    status: diditSessionForLog.status ?? null,
                    decision: diditSessionForLog.decision ?? null,
                    verificationStatus: diditSessionForLog.verification_status ?? null,
                    idStatus: faceMatchCheck.idStatus || null,
                    faceStatus: faceMatchCheck.faceStatus || null,
                    hasFaceMatch: faceMatchCheck.hasFaceMatch,
                    hasApprovedFaceMatch: faceMatchCheck.approved,
                    hasDerivedFullName: Boolean(diditSessionForLog.derived?.fullName),
                    platform: Platform.OS,
                });

                if (sessionData?.derived?.fullName) {
                    verifiedName = sessionData.derived.fullName;
                    verifiedNameSource = 'didit';
                }
            }
        } catch (e: any) {
            logDiditEmailFlowError('didit.getSession.exception', e, {
                diditSessionId: refToLink,
                email: maskEmailForLog(email),
                platform: Platform.OS,
            });
        }

        const diditStatus = getDiditFlowStatusFromSession(diditSessionData);
        if (isFailedDiditFlowStatus(diditStatus) || isSupersededVerificationStatus(diditStatus)) {
            logDiditEmailFlow('finishAccountCreation.blocked', {
                reason: 'didit_final_failure',
                diditSessionId: refToLink,
                email: maskEmailForLog(email),
                status: diditStatus || null,
                platform: Platform.OS,
            });
            setLoading(false);
            setVerificationUrl('');
            setSessionId('');
            setSessionNonce('');
            setTempSessionRef('');
            await AsyncStorage.removeItem('signup_current_session');
            router.setParams({ verified: '', check_verification: '' });
            setStep('details');

            Alert.alert(
                diditStatus === 'ABANDONED' ? 'Verification Incomplete' : 'Invalid I.D.',
                diditStatus === 'ABANDONED'
                    ? 'You did not complete the verification process. Please try again.'
                    : 'Your I.D. was declined or does not match. Please try again with a valid government-issued I.D.',
            );
            return;
        }

        if (isPendingReviewDiditFlowStatus(diditStatus)) {
            logDiditEmailFlow('finishAccountCreation.pendingReview', {
                diditSessionId: refToLink,
                email: maskEmailForLog(email),
                status: diditStatus || null,
                platform: Platform.OS,
            });
            await finishAccountCreationPendingReview(refToLink);
            return;
        }

        const faceMatchCheck = diditSessionHasApprovedFaceMatch(diditSessionData);
        if (!faceMatchCheck.approved) {
            logDiditEmailFlow('finishAccountCreation.blocked', {
                reason: 'missing_or_unapproved_face_match',
                diditSessionId: refToLink,
                email: maskEmailForLog(email),
                idStatus: faceMatchCheck.idStatus || null,
                faceStatus: faceMatchCheck.faceStatus || null,
                hasFaceMatch: faceMatchCheck.hasFaceMatch,
                platform: Platform.OS,
            });
            setLoading(false);
            Alert.alert(
                'Face Match Not Completed',
                'Your ID was scanned, but Didit did not return an approved face match. Please restart identity verification after confirming the workflow requires Liveness and Face Match.',
            );
            return;
        }

        // Fallback for name if Didit fails
        if (!verifiedName) {
            verifiedName = email.split('@')[0] || getSignupRoleFallbackName(selectedRole);
        }

        logDiditEmailFlow('verifiedName.resolved', {
            email: maskEmailForLog(email),
            source: verifiedNameSource,
            hasVerifiedName: Boolean(verifiedName),
            platform: Platform.OS,
        });

        try {
            // 3. Create the auth user/profile through the signup Edge Function.
            // Direct supabase.auth.signUp() hard-fails when the project SMTP
            // provider rejects confirmation email delivery.
            const emailRedirectTo = createEmailConfirmationRedirectUrl();
            logDiditEmailFlow('auth.edgeSignup.start', {
                email: maskEmailForLog(email),
                selectedRole,
                verificationMode,
                diditSessionId: refToLink,
                documentType: selectedDocumentOption.label,
                documentTypeKey: selectedDocumentOption.key,
                redirectTo: emailRedirectTo,
                payloadPreview: {
                    role: selectedRole,
                    verification_status: 'APPROVED',
                    is_verified: true,
                    didit_session_id: refToLink,
                    selected_document_type: selectedDocumentOption.label,
                    verification_mode: verificationMode,
                    hasFullName: Boolean(verifiedName),
                },
                platform: Platform.OS,
            });

            const { data: signupData, error: signupError } = await supabase.functions.invoke('create-unverified-user', {
                body: {
                    email: email.trim(),
                    password,
                    role: selectedRole,
                    fullName: verifiedName,
                    isVerified: true,
                    verificationStatus: 'APPROVED',
                    diditSessionId: refToLink,
                    sessionNonce,
                    selectedDocumentType: selectedDocumentOption.label,
                    selectedDocumentTypeKey: selectedDocumentOption.key,
                    verificationMode,
                    musicVideoUploadId: selectedRole === 'musician' ? musicianVideoProof?.uploadId : null,
                    redirectTo: emailRedirectTo,
                },
            });

            const signupUser = (signupData as any)?.user;
            const emailDelivery = (signupData as any)?.emailDelivery;
            const duplicateIdentityReview = Boolean((signupData as any)?.duplicateIdentityReview);

            logDiditEmailFlow('auth.edgeSignup.result', {
                email: maskEmailForLog(email),
                diditSessionId: refToLink,
                hasError: Boolean(signupError),
                error: summarizeErrorForDiditEmailLog(signupError),
                user: summarizeAuthUserForDiditEmailLog(signupUser),
                duplicateIdentityReview,
                emailDelivery: emailDelivery
                    ? {
                        sent: Boolean(emailDelivery.sent),
                        queued: Boolean(emailDelivery.queued),
                        provider: emailDelivery.provider ?? null,
                        hasError: Boolean(emailDelivery.error),
                        hasSupabaseAuthError: Boolean(emailDelivery.supabaseAuthError),
                        hasResendError: Boolean(emailDelivery.resendError),
                    }
                    : null,
                platform: Platform.OS,
            });

            if (signupError) {
                logDiditEmailFlowError('auth.edgeSignup.error', signupError, {
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    redirectTo: emailRedirectTo,
                    platform: Platform.OS,
                });
                throw signupError;
            }

            if (signupUser) {
                logDiditEmailFlow('profile.create.final', {
                    profileCreated: true,
                    source: 'create-unverified-user',
                    userId: signupUser.id,
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    platform: Platform.OS,
                });

                // Clear the temporary signup session
                try {
                    logDiditEmailFlow('signupSession.cleanup.start', {
                        storageKey: 'signup_current_session',
                        email: maskEmailForLog(email),
                        platform: Platform.OS,
                    });
                    await AsyncStorage.removeItem('signup_current_session');
                } catch (e) {
                    logDiditEmailFlowError('signupSession.cleanup.error', e, {
                        storageKey: 'signup_current_session',
                        email: maskEmailForLog(email),
                        platform: Platform.OS,
                    });
                }

                // SUCCESS: Alert and Redirect to Login
                // SUCCESS: Redirect to Login immediately
                // The Login screen will handle showing the "Email Sent" popup
                logDiditEmailFlow('redirect.login.start', {
                    accountCreated: true,
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    platform: Platform.OS,
                });
                router.replace({
                    pathname: '/',
                    params: {
                        accountCreated: 'true',
                        email: email,
                        ...(duplicateIdentityReview ? { diditPendingReview: 'true' } : { diditVerified: 'true' }),
                    }
                } as any);
            } else {
                logDiditEmailFlow('auth.edgeSignup.noUser', {
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    emailDeliveryAccepted: diditEmailDeliveryWasAccepted(emailDelivery),
                    platform: Platform.OS,
                });
                if (selectedRole === 'musician') {
                    throw new Error('Musician signup must complete through secure verification review. Please try again.');
                }
            }

        } catch (authErr: any) {
            logDiditEmailFlowError('finishAccountCreation.catch', authErr, {
                email: maskEmailForLog(email),
                diditSessionId: refToLink,
                platform: Platform.OS,
            });
            // Handle "User already registered" specifically
            if (authErr?.message?.includes('already registered') || authErr?.status === 422) {
                logDiditEmailFlow('auth.signUp.accountAlreadyRegistered', {
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    status: authErr?.status ?? null,
                    platform: Platform.OS,
                });

                const resendRedirectTo = createEmailConfirmationRedirectUrl();
                logDiditEmailFlow('auth.resendExisting.start', {
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    redirectTo: resendRedirectTo,
                    provider: 'create-unverified-user',
                    platform: Platform.OS,
                });

                const { data: resendData, error: resendError } = await supabase.functions.invoke('create-unverified-user', {
                    body: {
                        action: 'resend_confirmation_email',
                        email: email.trim(),
                        redirectTo: resendRedirectTo,
                    },
                });

                const emailDelivery = (resendData as any)?.emailDelivery;
                const errorEmailDelivery = getEmailDeliveryFromInvokeError(resendError);
                const confirmationDeferred = diditEmailConfirmationWasDeferred(resendData, emailDelivery ?? errorEmailDelivery);
                if (resendError && !diditEmailDeliveryWasAccepted(errorEmailDelivery)) {
                    logDiditEmailFlowError('auth.resendExisting.error', resendError, {
                        email: maskEmailForLog(email),
                        diditSessionId: refToLink,
                        redirectTo: resendRedirectTo,
                        platform: Platform.OS,
                    });
                    Alert.alert('Account Exists', 'This email is already registered. We tried to resend the verification link but failed. Please log in.');
                } else if (confirmationDeferred) {
                    Alert.alert(
                        'Verification In Review',
                        (resendData as any)?.message || 'Email confirmation will be sent after identity review is approved.'
                    );
                } else {
                    logDiditEmailFlow('auth.resendExisting.success', {
                        email: maskEmailForLog(email),
                        diditSessionId: refToLink,
                        redirectTo: resendRedirectTo,
                        emailDelivery: (emailDelivery ?? errorEmailDelivery)
                            ? {
                                sent: Boolean((emailDelivery ?? errorEmailDelivery).sent),
                                queued: Boolean((emailDelivery ?? errorEmailDelivery).queued),
                                provider: (emailDelivery ?? errorEmailDelivery).provider ?? null,
                            }
                            : null,
                        platform: Platform.OS,
                    });
                    Alert.alert('Account Exists', 'This email is already registered. We have sent a new verification link to your inbox.');
                    setStep('email_verification');
                }
                return;
            }
            Alert.alert('Creation Failed', authErr.message);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Resend Confirmation Email
     */
    const handleResendEmail = async () => {
        if (!email) {
            logDiditEmailFlow('auth.resendManual.blocked', {
                reason: 'missing_email',
                platform: Platform.OS,
            });
            return;
        }

        const emailRedirectTo = createEmailConfirmationRedirectUrl();
        logDiditEmailFlow('auth.resendManual.start', {
            email: maskEmailForLog(email),
            redirectTo: emailRedirectTo,
            type: 'signup',
            platform: Platform.OS,
        });

        try {
            const { data, error } = await supabase.functions.invoke('create-unverified-user', {
                body: {
                    action: 'resend_confirmation_email',
                    email: email.trim(),
                    redirectTo: emailRedirectTo,
                },
            });
            const emailDelivery = (data as any)?.emailDelivery;
            const errorEmailDelivery = getEmailDeliveryFromInvokeError(error);
            const confirmationDeferred = diditEmailConfirmationWasDeferred(data, emailDelivery ?? errorEmailDelivery);
            logDiditEmailFlow('auth.resendManual.result', {
                email: maskEmailForLog(email),
                hasError: Boolean(error),
                error: summarizeErrorForDiditEmailLog(error),
                emailDelivery: (emailDelivery ?? errorEmailDelivery)
                    ? {
                        sent: Boolean((emailDelivery ?? errorEmailDelivery).sent),
                        queued: Boolean((emailDelivery ?? errorEmailDelivery).queued),
                        provider: (emailDelivery ?? errorEmailDelivery).provider ?? null,
                    }
                    : null,
                redirectTo: emailRedirectTo,
                platform: Platform.OS,
            });

            if (error && !diditEmailDeliveryWasAccepted(errorEmailDelivery)) {
                logDiditEmailFlowError('auth.resendManual.error', error, {
                    email: maskEmailForLog(email),
                    redirectTo: emailRedirectTo,
                    platform: Platform.OS,
                });
                throw error;
            }
            if (confirmationDeferred) {
                Alert.alert(
                    'Verification In Review',
                    (data as any)?.message || 'Email confirmation will be sent after identity review is approved.'
                );
                return;
            }
            Alert.alert('Email Sent', 'A new verification link has been sent to your email.');
        } catch (e: any) {
            logDiditEmailFlowError('auth.resendManual.catch', e, {
                email: maskEmailForLog(email),
                redirectTo: emailRedirectTo,
                platform: Platform.OS,
            });
            Alert.alert('Error', e.message);
        }
    };

    /**
     * Render Step 2: Details
     */
    const renderDetailsStep = () => (
        <View style={styles.stepContainer}>
            <Text style={[styles.stepTitle, themeStyles.text]}>Create your account</Text>
            <Text style={[styles.stepSubtitle, themeStyles.textSecondary]}>Enter your credentials to get started.</Text>

            <View style={styles.roleSectionContainer}>
                <Text style={[styles.documentSectionTitle, themeStyles.text]}>Register as</Text>
                <View style={styles.roleGrid}>
                    {SIGNUP_ROLE_OPTIONS.map((option) => {
                        const selected = selectedRole === option.role;

                        return (
                            <TouchableOpacity
                                key={option.role}
                                activeOpacity={1}
                                accessibilityRole="button"
                                accessibilityLabel={`signup-role-${option.role}`}
                                accessibilityState={{ selected }}
                                testID={`signup-role-${option.role}`}
                                onPress={() => handleRoleSelect(option.role)}
                                style={[
                                    styles.roleCardBig,
                                    {
                                        backgroundColor: selected ? (isDark ? 'rgba(79, 70, 229, 0.18)' : 'rgba(79, 70, 229, 0.08)') : colors.surface,
                                        borderColor: selected ? colors.primary : colors.border,
                                    },
                                ]}
                            >
                                <View style={[styles.roleIconBubble, { backgroundColor: selected ? colors.primary : (isDark ? '#111827' : '#F3F4F6') }]}>
                                    <Ionicons name={option.icon} size={22} color={selected ? '#FFFFFF' : colors.textSecondary} />
                                </View>
                                <View style={styles.roleCopy}>
                                    <Text style={[styles.roleLabelBig, themeStyles.text]}>{option.title}</Text>
                                    <Text style={[styles.roleDescBig, themeStyles.textSecondary]}>{option.description}</Text>
                                </View>
                                {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {errors.role ? <Text style={{ color: 'red', fontSize: 12 }}>{errors.role}</Text> : null}
            </View>

            <View style={styles.formGap}>
                {/* Email */}
                <View style={[styles.inputContainer, themeStyles.inputContainer, errors.email ? { borderColor: 'red' } : null]}>
                    <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.input, themeStyles.text]}
                        placeholder="Email"
                        placeholderTextColor={colors.textSecondary}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        accessibilityLabel="signup-email-input"
                        testID="signup-email-input"
                    />
                </View>
                {errors.email && <Text style={{ color: 'red', fontSize: 12 }}>{errors.email}</Text>}

                {/* Password */}
                <View style={[styles.inputContainer, themeStyles.inputContainer, errors.password ? { borderColor: 'red' } : null]}>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.input, themeStyles.text]}
                        placeholder="Password"
                        placeholderTextColor={colors.textSecondary}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        accessibilityLabel="signup-password-input"
                        testID="signup-password-input"
                    />
                    <TouchableOpacity activeOpacity={1} onPress={() => setShowPassword(!showPassword)}>
                        <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
                {errors.password ? (
                    <Text style={{ color: 'red', fontSize: 12 }}>{errors.password}</Text>
                ) : !showPasswordGuidance ? (
                    <Text style={[styles.passwordRequirementText, themeStyles.textSecondary]}>{PASSWORD_REQUIREMENT_HINT}</Text>
                ) : null}
                {showPasswordGuidance ? (
                    <View style={[styles.passwordStrengthCard, themeStyles.inputContainer]}>
                        <View style={styles.passwordStrengthHeader}>
                            <Text style={[styles.passwordStrengthTitle, themeStyles.text]}>Password strength</Text>
                            <Text style={[styles.passwordStrengthLabel, { color: passwordStrengthColor }]}>{passwordStrengthLabel}</Text>
                        </View>
                        <View style={[styles.passwordMeterTrack, { backgroundColor: isDark ? '#111827' : '#E5E7EB' }]}>
                            <View
                                style={[
                                    styles.passwordMeterFill,
                                    {
                                        width: `${passwordStrengthPercent}%`,
                                        backgroundColor: passwordStrengthColor,
                                    },
                                ]}
                            />
                        </View>
                        <View style={styles.passwordChecklist}>
                            {passwordRequirementState.map((requirement) => (
                                <View key={requirement.key} style={styles.passwordChecklistItem}>
                                    <Ionicons
                                        name={requirement.met ? 'checkmark-circle' : 'ellipse-outline'}
                                        size={15}
                                        color={requirement.met ? '#16A34A' : colors.textSecondary}
                                    />
                                    <Text
                                        style={[
                                            styles.passwordChecklistText,
                                            requirement.met ? { color: isDark ? '#86EFAC' : '#15803D' } : themeStyles.textSecondary,
                                        ]}
                                    >
                                        {requirement.label}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}

                {/* Confirm */}
                <View style={[styles.inputContainer, themeStyles.inputContainer, errors.confirmPassword ? { borderColor: 'red' } : null]}>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.input, themeStyles.text]}
                        placeholder="Confirm Password"
                        placeholderTextColor={colors.textSecondary}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirmPassword}
                        accessibilityLabel="signup-confirm-password-input"
                        testID="signup-confirm-password-input"
                    />
                    <TouchableOpacity activeOpacity={1} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                        <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
                {errors.confirmPassword ? (
                    <Text style={{ color: 'red', fontSize: 12 }}>{errors.confirmPassword}</Text>
                ) : confirmPassword ? (
                    <View style={styles.confirmPasswordHintRow}>
                        <Ionicons
                            name={password === confirmPassword ? 'checkmark-circle' : 'alert-circle-outline'}
                            size={15}
                            color={password === confirmPassword ? '#16A34A' : '#D97706'}
                        />
                        <Text
                            style={[
                                styles.confirmPasswordHintText,
                                { color: password === confirmPassword ? (isDark ? '#86EFAC' : '#15803D') : '#D97706' },
                            ]}
                        >
                            {password === confirmPassword ? 'Passwords match' : 'Passwords must match'}
                        </Text>
                    </View>
                ) : null}

                <View style={styles.documentSectionContainer}>
                    <Text style={[styles.documentSectionTitle, themeStyles.text]}>Select your ID type (Philippines)</Text>
                    <Text style={[styles.documentSectionSubtitle, themeStyles.textSecondary]}>
                        Supported IDs continue with Didit. Unsupported IDs can be uploaded manually for admin review (5-7 business days).
                    </Text>

                    <TouchableOpacity
                        activeOpacity={1}
                        accessibilityLabel="signup-document-select-button"
                        onPress={() => setDocumentModalVisible(true)}
                        style={[styles.documentSelectButton, themeStyles.inputContainer, errors.document ? { borderColor: 'red' } : null]}
                        testID="signup-document-select-button"
                    >
                        <Ionicons name="id-card-outline" size={20} color={colors.textSecondary} />
                        <View style={styles.documentSelectCopy}>
                            <Text style={[styles.documentSelectValue, themeStyles.text]}>{selectedDocumentOption.label}</Text>
                            <Text
                                style={[
                                    styles.documentSelectionMeta,
                                    { color: selectedDocumentOption.diditSupported ? '#16A34A' : '#D97706' },
                                ]}
                            >
                                {selectedDocumentOption.diditSupported ? 'Auto verification' : 'Manual review'}
                            </Text>
                        </View>
                        <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>

                    {errors.document ? <Text style={{ color: 'red', fontSize: 12 }}>{errors.document}</Text> : null}
                </View>

                {isMusicianSignup ? (
                    <View style={styles.musicianVideoSection}>
                        <View style={styles.sectionHeadingRow}>
                            <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>Musician proof</Text>
                            <Text style={[styles.sectionHint, themeStyles.textSecondary]}>Required before verification</Text>
                        </View>
                        <TouchableOpacity
                            activeOpacity={musicianVideoUploading ? 1 : 0.78}
                            accessibilityLabel="signup-musician-video-upload-button"
                            onPress={() => void pickAndUploadMusicianVideoProof()}
                            disabled={musicianVideoUploading}
                            style={[styles.manualUploadCard, styles.musicianVideoProofCard, themeStyles.inputContainer]}
                            testID="signup-musician-video-upload-button"
                        >
                            <View style={[styles.manualUploadIcon, { backgroundColor: isDark ? '#111827' : '#EEF2FF' }]}>
                                <Ionicons name="videocam-outline" size={20} color={colors.primary} />
                            </View>
                            <View style={styles.manualUploadCopy}>
                                <Text style={[styles.manualUploadTitle, themeStyles.text]}>
                                    {musicianVideoProof ? 'Music video uploaded' : 'Upload music video'}
                                </Text>
                                <Text style={[styles.manualUploadPlaceholder, themeStyles.textSecondary]}>
                                    {musicianVideoProof
                                        ? `${musicianVideoProof.originalName} - ${formatUploadFileSize(musicianVideoProof.sizeBytes)}`
                                        : 'MP4, MOV, M4V, or WebM up to 50MB'}
                                </Text>
                            </View>
                            <View style={[styles.manualUploadAction, { backgroundColor: musicianVideoProof ? (isDark ? '#334155' : '#F3F4F6') : colors.primary }]}>
                                {musicianVideoUploading ? (
                                    <ActivityIndicator size="small" color={musicianVideoProof ? colors.text : '#FFFFFF'} />
                                ) : (
                                    <Ionicons name={musicianVideoProof ? 'swap-horizontal-outline' : 'cloud-upload-outline'} size={16} color={musicianVideoProof ? colors.text : '#FFFFFF'} />
                                )}
                            </View>
                        </TouchableOpacity>
                        {errors.musicVideo ? <Text style={{ color: 'red', fontSize: 12 }}>{errors.musicVideo}</Text> : null}
                    </View>
                ) : null}
            </View>

            <TouchableOpacity
                onPress={handleNext}
                disabled={loading || !isDetailsStepReady}
                activeOpacity={loading || !isDetailsStepReady ? 1 : 0.78}
                accessibilityLabel="signup-next-button"
                style={[
                    styles.nextButton,
                    { backgroundColor: isDetailsStepReady ? colors.primary : (isDark ? '#374151' : '#E5E7EB') },
                    { opacity: loading || !isDetailsStepReady ? 0.6 : 1 },
                    !isDetailsStepReady ? styles.nextButtonDisabled : null,
                ]}
                testID="signup-next-button"
            >
                {loading ? <ActivityIndicator color="white" /> : <Text style={[styles.nextButtonText, { color: isDetailsStepReady ? "white" : colors.textSecondary }]}>Next</Text>}
            </TouchableOpacity>

            <View style={styles.authFooterLinkContainer}>
                <Text style={[styles.authFooterText, themeStyles.textSecondary]}>
                    Already have an account?{' '}
                </Text>
                <TouchableOpacity
                    activeOpacity={0.65}
                    onPress={() => router.push('/')}
                    style={styles.authFooterLinkPressable}
                >
                    <Text style={[styles.authFooterLinkText, { color: colors.primary }]}>Log in</Text>
                </TouchableOpacity>
            </View>

            <TrackedBottomSheetModal
                ref={documentSheetRef}
                overlayLabel="SignupDocumentTypeModal"
                index={0}
                snapPoints={documentSheetSnapPoints}
                animationConfigs={bottomSheetAnimationConfigs}
                animateOnMount
                enableDynamicSizing={false}
                enablePanDownToClose
                backdropComponent={renderSignupSheetBackdrop}
                backgroundStyle={{
                    backgroundColor: bottomSheetSurfaceColor,
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                }}
                handleComponent={null}
                onDismiss={handleDocumentSheetDismiss}
            >
                    <View style={[styles.documentModalSheet, safeModalPadding, { backgroundColor: bottomSheetSurfaceColor }]}>
                        <View style={styles.documentModalHeader}>
                            <TouchableOpacity
                                activeOpacity={1}
                                onPress={() => setDocumentModalVisible(false)}
                                style={[
                                    styles.documentModalCloseButton,
                                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                                ]}
                            >
                                <Ionicons name="close" size={22} color={colors.textSecondary} />
                            </TouchableOpacity>
                            <Text style={[styles.documentModalTitle, themeStyles.text]}>Select ID type</Text>
                            <View style={styles.documentModalHeaderSpacer} />
                        </View>
                        <Text style={[styles.documentModalSubtitle, themeStyles.textSecondary]}>
                            Choose the government ID you will use for verification.
                        </Text>

                        <BottomSheetScrollView
                            style={styles.documentModalBody}
                            contentContainerStyle={styles.documentModalList}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="always"
                        >
                            {PH_DOCUMENT_OPTIONS.map((option) => {
                                const selected = selectedDocumentKey === option.key;
                                return (
                                    <TouchableOpacity
                                        key={option.key}
                                        activeOpacity={1}
                                        accessibilityLabel={`signup-document-option-${option.key}`}
                                        onPress={() => handleDocumentSelect(option.key)}
                                        testID={`signup-document-option-${option.key}`}
                                        style={[
                                            styles.documentModalOption,
                                            {
                                                backgroundColor: selected
                                                    ? (isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.08)')
                                                    : (isDark ? '#252D3A' : '#F7F8FA'),
                                                borderColor: selected ? colors.primary : 'transparent',
                                            },
                                        ]}
                                    >
                                        <View
                                            style={[
                                                styles.documentModalOptionIcon,
                                                { backgroundColor: option.diditSupported ? 'rgba(22, 163, 74, 0.10)' : 'rgba(217, 119, 6, 0.10)' },
                                            ]}
                                        >
                                            <Ionicons
                                                name={option.diditSupported ? 'shield-checkmark-outline' : 'document-text-outline'}
                                                size={18}
                                                color={option.diditSupported ? '#16A34A' : '#D97706'}
                                            />
                                        </View>
                                        <View style={styles.documentModalOptionCopy}>
                                            <Text style={[styles.documentModalOptionTitle, themeStyles.text]}>{option.label}</Text>
                                            <Text
                                                style={[
                                                    styles.documentModalOptionMeta,
                                                    { color: option.diditSupported ? '#16A34A' : '#D97706' },
                                                ]}
                                            >
                                                {option.diditSupported ? 'Auto verification' : 'Manual review'}
                                            </Text>
                                        </View>
                                        <View style={styles.documentModalOptionCheck}>
                                            {selected ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} /> : null}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </BottomSheetScrollView>
                    </View>
            </TrackedBottomSheetModal>
        </View>
    );

    /**
     * Render Step 3: Verification
     */
    const renderVerificationStep = () => {
        // const { verified } = useLocalSearchParams(); // Inherit from parent scope to avoid hook errors

        // Helper function to manually check status (used by "Click here" button)
        const manualStatusCheck = async () => {
            logSignupFlow('manualStatusCheck.pressed', {
                sessionId: summarizeSessionRefForLog(sessionId),
                tempSessionRef: summarizeSessionRefForLog(tempSessionRef),
                hasSessionNonce: Boolean(sessionNonce),
                email: maskEmailForLog(email),
            });
            setLoading(true);
            const refToCheck = sessionId || tempSessionRef;
            if (!refToCheck) {
                logSignupFlow('manualStatusCheck.blocked', {
                    reason: 'missing_session_ref',
                    hasSessionId: Boolean(sessionId),
                    hasTempSessionRef: Boolean(tempSessionRef),
                });
                Alert.alert('Error', 'No verification session found. Please try again.');
                setLoading(false);
                setStep('details');
                return;
            }

            try {
                logSignupFlow('manualStatusCheck.invoke.start', {
                    sessionId: summarizeSessionRefForLog(refToCheck),
                    hasSessionNonce: Boolean(sessionNonce),
                });
                const { data: sessionData } = await supabase.functions.invoke('create-didit-session', {
                    body: { action: 'get_session', session_id: refToCheck, sessionNonce }
                });

                if (sessionData?.success === false && sessionData?.error) {
                    throw new Error(String(sessionData.error));
                }

                const status = getDiditFlowStatusFromSession(sessionData);
                logSignupFlow('manualStatusCheck.invoke.result', {
                    sessionId: summarizeSessionRefForLog(refToCheck),
                    status: status ?? null,
                    invokeData: summarizeSignupInvokeData(sessionData),
                });

                if (isApprovedDiditFlowStatus(status)) {
                    logSignupFlow('manualStatusCheck.approved', {
                        sessionId: summarizeSessionRefForLog(refToCheck),
                    });
                    finishAccountCreation();
                } else if (isPendingReviewDiditFlowStatus(status)) {
                    const faceMatchCheck = diditSessionHasApprovedFaceMatch(sessionData);
                    logSignupFlow('manualStatusCheck.pendingReview', {
                        sessionId: summarizeSessionRefForLog(refToCheck),
                        idStatus: faceMatchCheck.idStatus || null,
                        faceStatus: faceMatchCheck.faceStatus || null,
                        hasFaceMatch: faceMatchCheck.hasFaceMatch,
                    });
                    await finishAccountCreationPendingReview(refToCheck);
                    return;
                } else if (isFailedDiditFlowStatus(status) || isSupersededVerificationStatus(status)) {
                    logSignupFlow('manualStatusCheck.finalFailure', {
                        sessionId: summarizeSessionRefForLog(refToCheck),
                        status,
                    });
                    // Failed - show alert and go back to form
                    setLoading(false);
                    setVerificationUrl('');
                    setSessionId('');
                    setSessionNonce('');
                    setTempSessionRef('');
                    await AsyncStorage.removeItem('signup_current_session');
                    router.setParams({ verified: '', check_verification: '' });

                    let title = 'Invalid I.D.';
                    let message = 'Your I.D. was declined. Please try again with a valid government-issued I.D.';
                    if (status === 'ABANDONED' || status === 'Abandoned') {
                        title = 'Verification Incomplete';
                        message = 'You did not complete the verification. Please try again.';
                    } else if (isSupersededVerificationStatus(status)) {
                        title = 'Verification Link Replaced';
                        message = 'This verification attempt was replaced by a newer one. Please start verification again.';
                    }

                    setStep('details');
                    Alert.alert(title, message, [{ text: 'OK' }]);
                } else {
                    // Still processing - let the auto-check continue
                    logSignupFlow('manualStatusCheck.stillProcessing', {
                        sessionId: summarizeSessionRefForLog(refToCheck),
                        status: status ?? null,
                    });
                    setLoading(false);
                    Alert.alert('Still Processing', 'Verification is still in progress. Please wait a moment.');
                }
            } catch (e: any) {
                logSignupFlowError('manualStatusCheck.error', e, {
                    sessionId: summarizeSessionRefForLog(refToCheck),
                    hasSessionNonce: Boolean(sessionNonce),
                });
                setLoading(false);
                const errorMessage = String(e?.message || '').trim();
                if (/verification session could not be validated|start verification again|session_validation_failed/i.test(errorMessage)) {
                    setVerificationUrl('');
                    setSessionId('');
                    setSessionNonce('');
                    setTempSessionRef('');
                    await AsyncStorage.removeItem('signup_current_session');
                    router.setParams({ verified: '', check_verification: '' });
                    setStep('verification');
                    void startNewVerificationSession({ forceNew: true });
                    return;
                }
                // More helpful error message for FunctionsHttpError
                const isFunctionError = e?.name === 'FunctionsHttpError' || e?.message?.includes('FunctionsHttpError');
                Alert.alert(
                    'Verification Check Failed',
                    isFunctionError
                        ? 'The verification server is processing your request. Please wait a moment and try again.'
                        : 'Could not check verification status. Please check your connection and try again.',
                    [{ text: 'OK' }]
                );
            }
        };

        if (verificationMode === 'manual') {
            const renderManualAsset = (
                label: string,
                asset: ManualUploadAsset | null,
                target: ManualImageTarget,
                icon: keyof typeof Ionicons.glyphMap = 'image-outline',
            ) => (
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => void pickManualImage(target)}
                    style={[styles.manualUploadCard, themeStyles.inputContainer]}
                >
                    <View style={[styles.manualUploadIcon, { backgroundColor: isDark ? '#111827' : '#EEF2FF' }]}>
                        <Ionicons name={icon as any} size={20} color={colors.primary} />
                    </View>

                    <View style={styles.manualUploadCopy}>
                        <View style={styles.manualUploadTitleRow}>
                            <Text style={[styles.manualUploadTitle, themeStyles.text]}>{label}</Text>
                        </View>

                        {asset ? (
                            <View style={styles.manualPreviewRow}>
                                <Image source={{ uri: asset.uri }} style={styles.manualPreviewImage} resizeMode="cover" />
                                <View style={styles.manualPreviewCopy}>
                                    <Text numberOfLines={1} style={[styles.manualUploadFileName, themeStyles.text]}>{asset.fileName}</Text>
                                    <Text style={[styles.manualUploadSubtitle, themeStyles.textSecondary]}>Use camera or gallery to replace</Text>
                                </View>
                            </View>
                        ) : (
                            <Text style={[styles.manualUploadPlaceholder, themeStyles.textSecondary]}>Capture or upload document image</Text>
                        )}
                    </View>

                    <View style={styles.manualUploadActionGroup}>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => void captureManualImage(target)}
                            style={[styles.manualUploadAction, { backgroundColor: colors.primary }]}
                            accessibilityLabel={`Capture ${label}`}
                        >
                            <Ionicons name="camera-outline" size={16} color="#FFFFFF" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => void pickManualImage(target)}
                            style={[styles.manualUploadAction, { backgroundColor: asset ? (isDark ? '#334155' : '#F3F4F6') : colors.primary }]}
                            accessibilityLabel={`Upload ${label}`}
                        >
                            <Ionicons name={asset ? 'swap-horizontal-outline' : 'cloud-upload-outline'} size={16} color={asset ? colors.text : '#FFFFFF'} />
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            );

            return (
                <View style={styles.stepContainer}>
                    <ScrollView contentContainerStyle={[styles.manualFlowContainer, safeManualFlowPadding]} showsVerticalScrollIndicator={false}>
                        <TouchableOpacity activeOpacity={1} onPress={() => setStep('details')} style={styles.backLink}>
                            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
                            <Text style={themeStyles.textSecondary}>Back</Text>
                        </TouchableOpacity>

                        <View style={[styles.manualReviewIntroCard, themeStyles.card]}>
                            <View style={[styles.manualReviewIntroIcon, { backgroundColor: `${colors.primary}1A` }]}>
                                <Ionicons name="id-card-outline" size={26} color={colors.primary} />
                            </View>
                            <View
                                style={styles.manualReviewIntroCopy}
                                testID="signup-manual-review-page"
                                accessibilityLabel="signup-manual-review-page"
                            >
                                <Text style={[styles.stepTitle, themeStyles.text, styles.manualReviewTitle]}>Manual ID review</Text>
                                <Text style={[styles.stepSubtitle, themeStyles.textSecondary, styles.manualReviewSubtitle]}>
                                    {selectedDocumentOption.label} is not currently supported by Didit in the Philippines. Upload your ID below and our team will review within 5-7 business days.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.manualInfoFields}>
                            <View style={styles.manualInfoField}>
                                <Text style={[styles.manualInfoFieldLabel, themeStyles.textSecondary]}>Full name on ID</Text>
                                <View style={[styles.manualInfoControl, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                                    <Ionicons name="person-outline" size={18} color={colors.textSecondary} style={styles.manualInfoIcon} />
                                    <TextInput
                                        value={manualFullName}
                                        onChangeText={setManualFullName}
                                        placeholder="Juan Dela Cruz"
                                        placeholderTextColor={colors.textSecondary}
                                        autoCapitalize="words"
                                        style={[styles.manualInfoInput, themeStyles.text]}
                                    />
                                </View>
                            </View>

                            <View style={styles.manualInfoField}>
                                <Text style={[styles.manualInfoFieldLabel, themeStyles.textSecondary]}>ID number</Text>
                                <View style={[styles.manualInfoControl, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                                    <Ionicons name="keypad-outline" size={18} color={colors.textSecondary} style={styles.manualInfoIcon} />
                                    <TextInput
                                        value={manualIdNumber}
                                        onChangeText={setManualIdNumber}
                                        placeholder="ID number on document"
                                        placeholderTextColor={colors.textSecondary}
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        style={[styles.manualInfoInput, themeStyles.text]}
                                    />
                                </View>
                            </View>

                            <View style={styles.manualInfoField}>
                                <Text style={[styles.manualInfoFieldLabel, themeStyles.textSecondary]}>ID expiration date</Text>
                                <View style={[styles.manualInfoControl, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                                    <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} style={styles.manualInfoIcon} />
                                    <TouchableOpacity
                                        activeOpacity={1}
                                        onPress={() => setManualExpirationCalendarVisible(true)}
                                        style={styles.manualInfoDateButton}
                                        accessibilityRole="button"
                                    >
                                        <Text
                                            numberOfLines={1}
                                            style={[
                                                styles.manualInfoDateText,
                                                { color: manualIdExpiration ? colors.text : colors.textSecondary },
                                            ]}
                                        >
                                            {manualExpirationDateLabel}
                                        </Text>
                                    </TouchableOpacity>
                                    <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                                </View>
                            </View>
                        </View>

                        <View style={styles.manualUploadList}>
                            {renderManualAsset('Front of ID', manualFrontImage, 'front', 'card-outline')}
                            {renderManualAsset('Back of ID', manualBackImage, 'back', 'albums-outline')}
                            {renderManualAsset('Selfie holding ID', manualSelfieImage, 'selfie', 'person-circle-outline')}
                        </View>

                        <View style={[styles.manualFlowHintCard, themeStyles.inputContainer]}>
                            <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
                            <Text style={[styles.manualFlowHint, themeStyles.textSecondary]}>
                                Admin will approve or reject your submission, and we will automatically email you once the decision is made.
                            </Text>
                        </View>

                        <TouchableOpacity
                            activeOpacity={loading || !isManualReviewReady ? 1 : 0.78}
                            onPress={() => void submitManualReviewSignup()}
                            disabled={loading || !isManualReviewReady}
                            style={[
                                styles.nextButton,
                                { backgroundColor: isManualReviewReady ? colors.primary : (isDark ? '#374151' : '#E5E7EB'), marginTop: 8 },
                                { opacity: loading || !isManualReviewReady ? 0.6 : 1 },
                                !isManualReviewReady ? styles.nextButtonDisabled : null,
                            ]}
                        >
                            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.nextButtonText, { color: isManualReviewReady ? "white" : colors.textSecondary }]}>Submit for Manual Review</Text>}
                        </TouchableOpacity>
                    </ScrollView>

                    <TrackedBottomSheetModal
                        ref={manualExpirationSheetRef}
                        overlayLabel="SignupManualExpirationCalendarModal"
                        index={0}
                        snapPoints={manualCalendarSnapPoints}
                        animationConfigs={bottomSheetAnimationConfigs}
                        animateOnMount
                        enableDynamicSizing={false}
                        enablePanDownToClose
                        backdropComponent={renderSignupSheetBackdrop}
                        backgroundStyle={{
                            backgroundColor: bottomSheetSurfaceColor,
                            borderTopLeftRadius: 28,
                            borderTopRightRadius: 28,
                        }}
                        handleComponent={null}
                        onDismiss={handleManualExpirationSheetDismiss}
                    >
                        <View style={[styles.documentModalSheet, styles.manualCalendarSheet, safeModalPadding, { backgroundColor: bottomSheetSurfaceColor }]}>
                            <View style={styles.documentModalHeader}>
                                <TouchableOpacity
                                    activeOpacity={1}
                                    onPress={() => setManualExpirationCalendarVisible(false)}
                                    style={[
                                        styles.documentModalCloseButton,
                                        { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                                    ]}
                                >
                                    <Ionicons name="close" size={22} color={colors.textSecondary} />
                                </TouchableOpacity>
                                <Text style={[styles.documentModalTitle, themeStyles.text]}>ID expiration date</Text>
                                <View style={styles.documentModalHeaderSpacer} />
                            </View>
                            <Text style={[styles.documentModalSubtitle, themeStyles.textSecondary]}>
                                Select the date printed on your ID.
                            </Text>

                            <View style={styles.manualCalendarContainer}>
                                <Calendar
                                    current={manualExpirationCalendarCurrent}
                                    minDate={todayDateString}
                                    onDayPress={handleManualExpirationSelect}
                                    markedDates={manualExpirationMarkedDates}
                                    enableSwipeMonths
                                    theme={{
                                        calendarBackground: isDark ? '#1E2530' : '#FFFFFF',
                                        textSectionTitleColor: colors.textSecondary,
                                        dayTextColor: colors.text,
                                        monthTextColor: colors.text,
                                        todayTextColor: colors.primary,
                                        selectedDayBackgroundColor: colors.primary,
                                        selectedDayTextColor: '#FFFFFF',
                                        arrowColor: colors.primary,
                                    }}
                                />
                            </View>
                        </View>
                    </TrackedBottomSheetModal>
                </View>
            );
        }

        // 1. Processing State (Returning from Didit)
        if (verified === 'true' || check_verification === 'true') {
            return (
                <View style={styles.stepContainer}>
                    <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}>
                        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 24 }} />
                        <Text style={[styles.stepTitle, themeStyles.text, { textAlign: 'center' }]}>Processing...</Text>
                        <Text style={[styles.stepSubtitle, themeStyles.textSecondary, { textAlign: 'center', maxWidth: 400 }]}>
                            Verifying your identity and creating your account.
                        </Text>

                        {!loading && (
                            <TouchableOpacity activeOpacity={1}
                                onPress={manualStatusCheck}
                                style={{ marginTop: 20 }}
                            >
                                <Text style={{ color: colors.primary, fontWeight: '600' }}>Click here if not redirected...</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            );
        }

        // 2. Mobile WebView
        if (Platform.OS !== 'web') {
            return (
                <View style={{ flex: 1, backgroundColor: colors.background }}>
                    <View style={[{ padding: 16, flexDirection: 'row', alignItems: 'center' }, safeVerificationHeaderPadding]}>
                        <Text style={[themeStyles.text, { fontSize: 18, fontWeight: 'bold' }]}>Identity Verification</Text>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => {
                                void startNewVerificationSession({ forceNew: true });
                            }}
                            style={{ marginLeft: 'auto', marginRight: 18 }}
                        >
                            <Text style={{ color: colors.primary }}>New link</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={1} onPress={() => router.push('/')}>
                            <Text style={{ color: colors.primary }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                    {verificationUrl ? (
                        <WebView
                            source={{ uri: verificationUrl }}
                            style={{ flex: 1 }}
                            onNavigationStateChange={handleMobileNavState}
                            startInLoadingState
                            renderLoading={() => <ActivityIndicator size="large" color={colors.primary} style={StyleSheet.absoluteFill} />}
                            onShouldStartLoadWithRequest={(request) => {
                                // INTERCEPTOR: Prevent the broken HTML page from loading
                                // Check for the function URL OR the static storage file
                                if (request.url.includes('verification-redirect') || request.url.includes('verification-v2.html')) {
                                    // We caught the redirect; now confirm the real status with our Edge Function.
                                    router.setParams({ verified: '', check_verification: 'true' });
                                    return false;
                                }
                                return true;
                            }}
                        />
                    ) : (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={[themeStyles.textSecondary, { marginTop: 20 }]}>Preparing secure session...</Text>
                        </View>
                    )}
                </View>
            );
        }

        // 3. Web UI
        return (
            <View style={styles.stepContainer}>
                <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                    <Ionicons name="shield-checkmark-outline" size={64} color={colors.primary} style={{ marginBottom: 24 }} />
                    <Text style={[styles.stepTitle, themeStyles.text, { textAlign: 'center' }]}>Verify Your Identity</Text>
                    <Text style={[styles.stepSubtitle, themeStyles.textSecondary, { textAlign: 'center', maxWidth: 400 }]}>
                        We use a secure third-party service to verify your identity. Please complete this step to activate your account.
                    </Text>

                    <TouchableOpacity activeOpacity={1}
                        onPress={handleWebVerify}
                        style={[styles.nextButton, themeStyles.primaryButton, { width: 250, marginTop: 32 }]}
                    >
                        <Text style={styles.nextButtonText}>Start Verification</Text>
                        <Ionicons name="open-outline" size={20} color="white" style={{ marginLeft: 8 }} />
                    </TouchableOpacity>

                    <TouchableOpacity activeOpacity={1}
                        onPress={() => {
                            startNewVerificationSession({ forceNew: true }).then(newUrl => {
                                if (newUrl && Platform.OS === 'web') window.open(newUrl, '_self');
                            });
                        }}
                        style={{ marginTop: 16 }}
                    >
                        <Text style={[themeStyles.textSecondary, { textDecorationLine: 'underline', fontSize: 13 }]}>
                            Link not working? Generate a new one
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity activeOpacity={1} onPress={() => router.push('/')} style={{ marginTop: 24 }}>
                        <Text style={themeStyles.textSecondary}>{"I'll do this later"}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };


    /**
     * Render Step 4: Email Verification Confirmation
     */
    const renderEmailVerificationStep = () => (
        <View style={styles.stepContainer}>
            <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}>
                <View style={{
                    width: 100, height: 100, borderRadius: 50,
                    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                    alignItems: 'center', justifyContent: 'center', marginBottom: 32
                }}>
                    <Ionicons name="mail-unread-outline" size={50} color={colors.primary} />
                </View>

                <Text style={[styles.stepTitle, themeStyles.text, { textAlign: 'center' }]}>Check your inbox</Text>

                <Text style={[styles.stepSubtitle, themeStyles.textSecondary, { textAlign: 'center', maxWidth: 400, marginBottom: 8 }]}>
                    We have sent a confirmation link to:
                </Text>
                <Text style={[themeStyles.text, { fontSize: 18, fontWeight: '600', marginBottom: 32, fontFamily: 'Poppins_600SemiBold' }]}>
                    {email}
                </Text>

                <Text style={[themeStyles.textSecondary, { textAlign: 'center', maxWidth: 350, fontSize: 14, marginBottom: 40, lineHeight: 22 }]}>
                    Confirm your email, then return to MusikaLokal to log in.
                </Text>

                {/* 'Back to Login' button removed as requested */}

                <TouchableOpacity activeOpacity={1}
                    onPress={handleResendEmail}
                    style={{ marginTop: 24 }}
                >
                    <Text style={[themeStyles.textSecondary, { fontSize: 13, textDecorationLine: 'underline' }]}>
                        Resend email
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    // Main Render
    if (step === 'verification' || step === 'email_verification') {
        // Verification steps take over full screen mostly
        return (
            <>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.flex1, themeStyles.container]}>
                    {step === 'verification' ? renderVerificationStep() : renderEmailVerificationStep()}
                </KeyboardAvoidingView>
                <CustomAlert
                    visible={alertVisible}
                    type={alertConfig.type}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    buttons={alertConfig.buttons}
                    onClose={() => setAlertVisible(false)}
                />
            </>
        );
    }

    return (
        <>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.flex1, themeStyles.container]}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={[styles.contentContainer, safeContentPadding]}>
                        {step === 'details' && renderDetailsStep()}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
            <CustomAlert
                visible={alertVisible}
                type={alertConfig.type}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onClose={() => setAlertVisible(false)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    flex1: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    contentContainer: { flex: 1, padding: 24, justifyContent: 'center' },
    stepContainer: { flex: 1, width: '100%', maxWidth: 500, alignSelf: 'center' },
    stepTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 8, fontFamily: 'Poppins_700Bold' },
    stepSubtitle: { fontSize: 16, marginBottom: 32, fontFamily: 'Poppins_400Regular' },
    roleSectionContainer: { marginBottom: 24, gap: 12 },
    roleGrid: { gap: 12 },
    roleCardBig: {
        flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, gap: 14, minHeight: 88
    },
    roleIconBubble: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    roleCopy: { flex: 1, gap: 4 },
    roleLabelBig: { fontSize: 18, fontWeight: '600', fontFamily: 'Poppins_600SemiBold' },
    roleDescBig: { fontSize: 12, lineHeight: 18, fontFamily: 'Poppins_400Regular' },
    sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
    sectionEyebrow: { fontSize: 11, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Poppins_700Bold' },
    sectionHint: { fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_400Regular' },
    musicianVideoSection: { marginBottom: 18 },
    nextButton: {
        height: 56,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        shadowColor: "#4F46E5",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
    },
    nextButtonDisabled: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
    nextButtonText: { color: 'white', fontSize: 16, fontWeight: '600', fontFamily: 'Poppins_600SemiBold' },
    authFooterLinkContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        marginTop: 18,
    },
    authFooterText: { fontSize: 14, fontFamily: 'Poppins_400Regular' },
    authFooterLinkPressable: { paddingVertical: 4, paddingHorizontal: 2 },
    authFooterLinkText: { fontSize: 14, textAlign: 'center', fontFamily: 'Poppins_600SemiBold' },
    inputContainer: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56, borderRadius: 16, borderWidth: 1
    },
    input: {
        flex: 1,
        marginLeft: 12,
        height: '100%',
        fontFamily: 'Poppins_400Regular',
        includeFontPadding: false,
        textAlignVertical: 'center',
        paddingVertical: 0,
    },
    formGap: { gap: 16 },
    passwordRequirementText: { fontSize: 12, lineHeight: 18, fontFamily: 'Poppins_400Regular' },
    passwordStrengthCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
    passwordStrengthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    passwordStrengthTitle: { fontSize: 13, lineHeight: 18, fontFamily: 'Poppins_600SemiBold' },
    passwordStrengthLabel: { fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', textTransform: 'uppercase' },
    passwordMeterTrack: { height: 7, borderRadius: 999, overflow: 'hidden' },
    passwordMeterFill: { height: '100%', borderRadius: 999 },
    passwordChecklist: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    passwordChecklistItem: { width: '48%', minWidth: 140, flexDirection: 'row', alignItems: 'center', gap: 6 },
    passwordChecklistText: { flex: 1, fontSize: 11, lineHeight: 15, fontFamily: 'Poppins_400Regular' },
    confirmPasswordHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18 },
    confirmPasswordHintText: { fontSize: 12, lineHeight: 18, fontFamily: 'Poppins_500Medium' },
    backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 4 },
    documentSectionContainer: { gap: 8, marginTop: 4 },
    documentSectionTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    documentSectionSubtitle: { fontSize: 12, lineHeight: 18, fontFamily: 'Poppins_400Regular' },
    documentSelectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 62,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 9,
        gap: 12,
    },
    documentSelectCopy: { flex: 1, gap: 2 },
    documentSelectValue: { fontSize: 14, lineHeight: 18, fontFamily: 'Poppins_600SemiBold' },
    documentSelectionMeta: { fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_700Bold', textTransform: 'uppercase' },
    documentModalSheet: {
        flex: 1,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 12,
        borderWidth: 0,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 16,
    },
    documentModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        borderBottomWidth: 0,
    },
    documentModalHeaderCopy: { flex: 1, gap: 4, paddingRight: 16 },
    documentModalHeaderSpacer: { width: 38, height: 38 },
    documentModalTitle: { flex: 1, fontSize: 18, textAlign: 'center', fontFamily: 'Poppins_700Bold' },
    documentModalSubtitle: { fontSize: 13, lineHeight: 19, marginBottom: 16, textAlign: 'center', fontFamily: 'Poppins_400Regular' },
    documentModalCloseButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 0 },
    documentModalBody: { flexGrow: 0 },
    documentModalList: { gap: 8, paddingBottom: 4 },
    documentModalOption: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 58,
        borderRadius: 14,
        borderWidth: 1.5,
        paddingHorizontal: 14,
        paddingVertical: 9,
        gap: 12,
    },
    documentModalOptionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    documentModalOptionCopy: { flex: 1, gap: 2 },
    documentModalOptionTitle: { fontSize: 15, lineHeight: 20, fontFamily: 'Poppins_600SemiBold' },
    documentModalOptionMeta: { fontSize: 11, lineHeight: 15, fontFamily: 'Poppins_700Bold', textTransform: 'uppercase' },
    documentModalOptionCheck: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    manualFlowContainer: { paddingHorizontal: 20, paddingBottom: 28, gap: 16 },
    manualReviewIntroCard: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
    },
    manualReviewIntroIcon: {
        width: 52,
        height: 52,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    manualReviewIntroCopy: { flex: 1 },
    manualReviewTitle: { fontSize: 24, marginBottom: 6 },
    manualReviewSubtitle: { fontSize: 14, lineHeight: 21, marginBottom: 0 },
    manualInfoFields: { gap: 14 },
    manualInfoField: { gap: 6 },
    manualInfoControl: {
        height: 52,
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    manualInfoIcon: { width: 20, textAlign: 'center' },
    manualInfoFieldLabel: { fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_500Medium', marginLeft: 2 },
    manualInfoInput: {
        flex: 1,
        height: '100%',
        fontSize: 14,
        lineHeight: 18,
        fontFamily: 'Poppins_500Medium',
        includeFontPadding: false,
        paddingVertical: 0,
        paddingHorizontal: 0,
        margin: 0,
        textAlignVertical: 'center',
    },
    manualInfoDateButton: {
        flex: 1,
        height: '100%',
        justifyContent: 'center',
    },
    manualInfoDateText: {
        fontSize: 14,
        lineHeight: 18,
        fontFamily: 'Poppins_500Medium',
    },
    manualCalendarSheet: {
        maxHeight: '78%',
    },
    manualCalendarContainer: {
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 18,
    },
    manualUploadList: { gap: 12 },
    manualUploadCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 14,
        gap: 12,
    },
    musicianVideoProofCard: {
        minHeight: 72,
    },
    manualUploadIcon: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    manualUploadCopy: { flex: 1, gap: 8, minWidth: 0 },
    manualUploadTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    manualUploadTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Poppins_600SemiBold' },
    manualUploadSubtitle: { fontSize: 11, lineHeight: 15, fontFamily: 'Poppins_400Regular' },
    manualPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
    manualPreviewImage: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#D1D5DB' },
    manualPreviewCopy: { flex: 1, minWidth: 0 },
    manualUploadFileName: { fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_500Medium' },
    manualUploadPlaceholder: { fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_400Regular' },
    manualUploadAction: {
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    manualUploadActionGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    manualFlowHintCard: {
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    manualFlowHint: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Poppins_400Regular' },
});




