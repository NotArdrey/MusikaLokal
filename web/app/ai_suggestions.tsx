import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import GuestSignInGate from '../src/components/GuestSignInGate';
import Header from '../src/components/header';
import { normalizeVisibleInput } from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { useBottomBarClearance } from '../src/hooks/useBottomBarClearance';
import {
    askInstrumentSuggestionFollowupWithGroq,
    generateInstrumentSuggestionsWithGroq,
    getGroqModelInfo,
} from '../src/services/groqModelRouter';
import { getOfflineInstrumentSuggestions } from '../src/utils/offlineInstrumentRecommender';
import {
    EXPERIENCE_OPTIONS,
    ExperienceLevel,
    InstrumentSuggestion,
    MUSIC_GENRES,
    PURPOSE_OPTIONS,
    STARTER_BUDGET_OPTIONS,
    StarterBudget,
    SuggestionPurpose,
} from '../src/types/instruments';

const OFFLINE_PROFILE_CACHE_KEY = 'offline_instrument_profile_v1';
const MAX_CHAT_PANEL_HEIGHT_RATIO = 0.78;
const MAX_CHAT_MESSAGE_HEIGHT_RATIO = 0.42;
const PHP_SYMBOL = '\u20b1';

const formatBudgetAmountInput = (value: string) => {
    const digits = value.replace(/[^\d]/g, '').slice(0, 9);
    if (!digits) return '';

    const normalizedDigits = digits.replace(/^0+(?=\d)/, '');
    const amount = Number(normalizedDigits);
    return Number.isFinite(amount) ? amount.toLocaleString('en-US') : normalizedDigits;
};

const parseBudgetAmountInput = (value: string) => {
    const digits = value.replace(/[^\d]/g, '');
    if (!digits) return undefined;

    const amount = Number(digits);
    return Number.isFinite(amount) && amount > 0 ? amount : undefined;
};

const formatBudgetAmountLabel = (amount: number) =>
    `${PHP_SYMBOL}${amount.toLocaleString('en-US')}`;

interface CachedOfflineProfile {
    full_name: string;
    roles: string[];
    genres: string[];
}

interface FollowupChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    blocked?: boolean;
}

interface CommunityMatch {
    id: string;
    kind: 'person' | 'duo' | 'group';
    name: string;
    subtitle: string;
    image?: string | null;
    reason: string;
    score: number;
}

const FOLLOWUP_SCOPE_NOTICE = 'I can only help with your suggested instruments and related music guidance.';
const FOLLOWUP_ERROR_NOTICE = 'AI chat could not respond right now. Please try again.';
const REMOVED_PROVIDER_PATTERN = /qwen\/qwen3-32b/gi;

function cleanAiText(text: string) {
    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*/gi, '')
        .replace(/<\/think>/gi, '')
        .split('\n')
        .filter((line) => !/^\s*(system|developer|assistant|user|analysis|planning|plan|prompt|instruction|hidden reasoning|chain[- ]of[- ]thought)\s*[:\-]/i.test(line))
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanProviderCopy(text: string | null | undefined) {
    if (!text) return text ?? null;
    return text.replace(REMOVED_PROVIDER_PATTERN, 'Groq AI');
}

export default function AiSuggestionsScreen() {
    const { colors, isDark } = useTheme();
    const { isGuest } = useAuth();
    const insets = useSafeAreaInsets();
    const { contentBottomPadding } = useBottomBarClearance(32);
    const params = useLocalSearchParams<{ refresh?: string }>();
    const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
    const { width: winWidth } = useWindowDimensions();
    const isWebDesktop = Platform.OS === 'web' && winWidth >= 768;
    const accentColor = colors.primary;
    const pageBackground = colors.background;
    const pageCardBackground = colors.card;
    const surfaceBackground = colors.inputBackground;
    const borderSoft = colors.border;
    const textPrimary = colors.text;
    const textSecondary = colors.textSecondary;

    // State
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    const [genreSearch, setGenreSearch] = useState('');
    const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('beginner');
    const [purpose, setPurpose] = useState<SuggestionPurpose>('band');
    const [starterBudget, setStarterBudget] = useState<StarterBudget>('not_sure');
    const [customBudgetAmount, setCustomBudgetAmount] = useState('');
    const [suggestions, setSuggestions] = useState<InstrumentSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'preferences' | 'results'>('preferences');
    const [currentInstruments, setCurrentInstruments] = useState<string[]>([]);
    const [isAIPowered, setIsAIPowered] = useState(false);
    const [aiProvider, setAIProvider] = useState<string>('');
    const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
    const [isFollowupChatOpen, setIsFollowupChatOpen] = useState(false);
    const [followupQuestion, setFollowupQuestion] = useState('');
    const [followupMessages, setFollowupMessages] = useState<FollowupChatMessage[]>([]);
    const [followupLoading, setFollowupLoading] = useState(false);
    const [communityMatches, setCommunityMatches] = useState<CommunityMatch[]>([]);
    const [loadingCommunity, setLoadingCommunity] = useState(false);
    const resultsScrollRef = React.useRef<ScrollView | null>(null);
    const followupSectionYRef = React.useRef(0);
    const followupMessagesScrollRef = React.useRef<ScrollView | null>(null);
    const groqInfo = getGroqModelInfo();
    const groqModelLabel = groqInfo.modelLabel;
    const groqTransportLabel = groqInfo.transportLabel;
    const groqConfigured = groqInfo.configured;
    const groqStatusMessage = groqInfo.statusMessage;
    const groqModelSource = groqInfo.modelSource;
    const groqApiKeySource = groqInfo.apiKeySource;
    const groqApiKeySignature = groqInfo.apiKeySignature;
    const isCustomBudgetSelected = starterBudget === 'custom';
    const selectedCustomBudgetPhp = isCustomBudgetSelected ? parseBudgetAmountInput(customBudgetAmount) : undefined;
    const isSuggestionFormReady =
        selectedGenres.length > 0 &&
        Boolean(experienceLevel) &&
        Boolean(purpose) &&
        Boolean(starterBudget) &&
        (!isCustomBudgetSelected || Boolean(selectedCustomBudgetPhp));
    const isSuggestionSubmitDisabled = loading || !isSuggestionFormReady;

    // User profile data
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [userGenres, setUserGenres] = useState<string[]>([]);
    const [userName, setUserName] = useState<string>('');

    const isGroqQuotaExhausted = (message: string | null | undefined) => {
        if (!message) return false;
        return /out of api calls|rate limit|too many requests|insufficient[_ -]?quota|quota|credits|\b429\b/i.test(message);
    };

    const normalizeMatchText = (value: unknown) => String(value ?? '').trim().toLowerCase();

    const getSelectedBudgetLabel = () => {
        if (starterBudget === 'custom') {
            return selectedCustomBudgetPhp ? formatBudgetAmountLabel(selectedCustomBudgetPhp) : 'Specific amount';
        }

        return STARTER_BUDGET_OPTIONS.find((option) => option.value === starterBudget)?.label || 'Not sure';
    };

    const formatBudgetLevel = (value: InstrumentSuggestion['budgetLevel']) => {
        if (value === 'no_budget') return 'No budget yet';
        if (value === 'low') return 'Low';
        if (value === 'medium') return 'Medium';
        if (value === 'high') return 'High';
        return 'Flexible';
    };

    const buildCommunityReason = (
        kind: CommunityMatch['kind'],
        matchedTerms: string[],
    ) => {
        const target = kind === 'person' ? 'Profile' : kind === 'duo' ? 'Duo' : 'Group';
        if (matchedTerms.length > 0) {
            return `${target} match for ${matchedTerms.slice(0, 2).join(' and ')}.`;
        }
        return `${target} match based on your journey preferences.`;
    };

    const loadCommunityMatches = useCallback(
        async (nextSuggestions: InstrumentSuggestion[]) => {
            if (!nextSuggestions.length) {
                setCommunityMatches([]);
                return;
            }

            setLoadingCommunity(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                const currentUserId = user?.id || null;
                const topSuggestions = nextSuggestions.slice(0, 3);
                const targetTerms = [
                    ...topSuggestions.map((item) => item.name),
                    ...topSuggestions.map((item) => item.recommendedRole || ''),
                    ...selectedGenres,
                ]
                    .map(normalizeMatchText)
                    .filter(Boolean);

                let profileQuery = supabase
                    .from('profiles')
                    .select('id, full_name, avatar_url, location, address, role')
                    .eq('role', 'musician')
                    .limit(30);

                let groupQuery = supabase
                    .from('groups_with_stats')
                    .select('id, owner_id, name, images, group_type, genre, location, description')
                    .in('group_type', ['duo', 'band'])
                    .limit(30);

                if (currentUserId) {
                    profileQuery = profileQuery.neq('id', currentUserId);
                    groupQuery = groupQuery.neq('owner_id', currentUserId);
                }

                const [profileResult, groupResult] = await Promise.all([profileQuery, groupQuery]);
                const profiles = profileResult.error ? [] : (profileResult.data || []);
                const groups = groupResult.error ? [] : (groupResult.data || []);
                const profileIds = profiles
                    .map((profile: any) => profile.id)
                    .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);

                const [skillsResult, genresResult] = profileIds.length > 0
                    ? await Promise.all([
                        supabase.from('profile_skills').select('profile_id, skill').in('profile_id', profileIds),
                        supabase.from('profile_genres').select('profile_id, genre').in('profile_id', profileIds),
                    ])
                    : [{ data: [], error: null }, { data: [], error: null }] as any[];

                const skillsByProfile = new Map<string, string[]>();
                const genresByProfile = new Map<string, string[]>();

                (skillsResult.data || []).forEach((row: any) => {
                    const values = skillsByProfile.get(row.profile_id) || [];
                    if (typeof row.skill === 'string') values.push(row.skill);
                    skillsByProfile.set(row.profile_id, values);
                });

                (genresResult.data || []).forEach((row: any) => {
                    const values = genresByProfile.get(row.profile_id) || [];
                    if (typeof row.genre === 'string') values.push(row.genre);
                    genresByProfile.set(row.profile_id, values);
                });

                const peopleMatches: CommunityMatch[] = profiles.map((profile: any) => {
                    const skills = skillsByProfile.get(profile.id) || [];
                    const genres = genresByProfile.get(profile.id) || [];
                    const haystack = [...skills, ...genres, profile.full_name, profile.location, profile.address]
                        .map(normalizeMatchText)
                        .join(' ');
                    const matchedTerms = targetTerms.filter((term) => haystack.includes(term));
                    const genreHits = selectedGenres.filter((genre) =>
                        genres.some((profileGenre) => normalizeMatchText(profileGenre) === normalizeMatchText(genre)),
                    );
                    const score = 45 + Math.min(35, matchedTerms.length * 10) + Math.min(20, genreHits.length * 10);

                    return {
                        id: `person:${profile.id}`,
                        kind: 'person',
                        name: profile.full_name || 'MusikaLokal musician',
                        subtitle: [skills.slice(0, 2).join(', '), genres.slice(0, 2).join(', '), profile.location || profile.address]
                            .filter(Boolean)
                            .join(' - '),
                        image: profile.avatar_url || null,
                        reason: buildCommunityReason('person', [...matchedTerms, ...genreHits]),
                        score,
                    };
                });

                const groupMatches: CommunityMatch[] = groups.map((group: any) => {
                    const kind: CommunityMatch['kind'] = group.group_type === 'duo' ? 'duo' : 'group';
                    const haystack = [group.name, group.genre, group.location, group.description]
                        .map(normalizeMatchText)
                        .join(' ');
                    const matchedTerms = targetTerms.filter((term) => haystack.includes(term));
                    const genreHit = selectedGenres.some((genre) => normalizeMatchText(group.genre) === normalizeMatchText(genre));
                    const score = 48 + Math.min(32, matchedTerms.length * 8) + (genreHit ? 18 : 0);
                    const images = Array.isArray(group.images) ? group.images : [];

                    return {
                        id: `${kind}:${group.id}`,
                        kind,
                        name: group.name || (kind === 'duo' ? 'MusikaLokal duo' : 'MusikaLokal group'),
                        subtitle: [kind === 'duo' ? 'Duo' : 'Group', group.genre, group.location].filter(Boolean).join(' - '),
                        image: images[0] || null,
                        reason: buildCommunityReason(kind, matchedTerms.length > 0 ? matchedTerms : group.genre ? [group.genre] : []),
                        score,
                    };
                });

                const rankedPeople = peopleMatches.sort((a, b) => b.score - a.score).slice(0, 4);
                const rankedDuos = groupMatches.filter((match) => match.kind === 'duo').sort((a, b) => b.score - a.score).slice(0, 3);
                const rankedGroups = groupMatches.filter((match) => match.kind === 'group').sort((a, b) => b.score - a.score).slice(0, 3);

                setCommunityMatches([...rankedPeople, ...rankedDuos, ...rankedGroups]);
            } catch (err) {
                console.error('Error loading AI journey community matches:', err);
                setCommunityMatches([]);
            } finally {
                setLoadingCommunity(false);
            }
        },
        [selectedGenres],
    );

    const createFollowupMessageId = () =>
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const ensureFollowupWelcome = useCallback(() => {
        setFollowupMessages((prev) => {
            if (prev.length > 0) {
                return prev;
            }

            return [
                {
                    id: createFollowupMessageId(),
                    role: 'assistant',
                    text: 'Ask me about any suggested instrument. I can help with comparison, fit, setup, and practice steps.',
                },
            ];
        });
    }, []);

    useEffect(() => {
        if (step === 'results' && suggestions.length > 0) {
            setIsFollowupChatOpen(true);
            ensureFollowupWelcome();
        }
    }, [ensureFollowupWelcome, step, suggestions.length]);

    const scrollToFollowupChat = useCallback(() => {
        setTimeout(() => {
            resultsScrollRef.current?.scrollTo({
                y: Math.max(0, followupSectionYRef.current - 12),
                animated: true,
            });
        }, 80);
    }, []);

    const sendFollowupQuestion = useCallback(
        async (presetQuestion?: string) => {
            const question = normalizeVisibleInput(presetQuestion ?? followupQuestion);

            if (!question || followupLoading || suggestions.length === 0) {
                return;
            }

            setIsFollowupChatOpen(true);
            ensureFollowupWelcome();
            scrollToFollowupChat();

            setFollowupMessages((prev) => [
                ...prev,
                {
                    id: createFollowupMessageId(),
                    role: 'user',
                    text: question,
                },
            ]);
            setFollowupQuestion('');
            setFollowupLoading(true);

            try {
                const result = await askInstrumentSuggestionFollowupWithGroq({
                    question,
                    suggestions,
                    selectedGenres,
                    userRoles,
                    experienceLevel,
                    purpose,
                    starterBudget,
                    customStarterBudgetPhp: selectedCustomBudgetPhp,
                });

                setFollowupMessages((prev) => [
                    ...prev,
                    {
                        id: createFollowupMessageId(),
                        role: 'assistant',
                        text: cleanAiText(result.answer) || FOLLOWUP_SCOPE_NOTICE,
                        blocked: result.blocked,
                    },
                ]);
            } catch {
                setFollowupMessages((prev) => [
                    ...prev,
                    {
                        id: createFollowupMessageId(),
                        role: 'assistant',
                        text: FOLLOWUP_ERROR_NOTICE,
                        blocked: true,
                    },
                ]);
            } finally {
                setFollowupLoading(false);
            }
        },
        [
            experienceLevel,
            ensureFollowupWelcome,
            followupLoading,
            followupQuestion,
            purpose,
            scrollToFollowupChat,
            selectedGenres,
            selectedCustomBudgetPhp,
            starterBudget,
            suggestions,
            userRoles,
        ],
    );

    // Load user profile on mount
    useEffect(() => {
        loadUserProfile();
    }, [refreshKey]);

    useEffect(() => {
        if (step !== 'results') {
            setIsFollowupChatOpen(false);
            setFollowupQuestion('');
            setFollowupLoading(false);
            setCommunityMatches([]);
            setLoadingCommunity(false);
            return;
        }

        console.log('[AI_SUGGESTIONS] Groq provider', {
            platform: 'web',
            aiPowered: isAIPowered,
            provider: aiProvider || null,
            configured: groqConfigured,
            model: groqModelLabel,
            modelSource: groqModelSource,
            apiKeySource: groqApiKeySource,
            apiKeySignature: groqApiKeySignature,
            transport: groqTransportLabel,
            status: groqStatusMessage,
        });
    }, [
        aiProvider,
        groqApiKeySignature,
        groqApiKeySource,
        groqConfigured,
        groqModelLabel,
        groqModelSource,
        groqStatusMessage,
        groqTransportLabel,
        isAIPowered,
        step,
    ]);

    useEffect(() => {
        if (step !== 'results') {
            return;
        }

        setFollowupMessages([]);
    }, [suggestions, step]);

    const applyProfileSignals = (profile: CachedOfflineProfile) => {
        const safeRoles = Array.isArray(profile.roles)
            ? profile.roles.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const safeGenres = Array.isArray(profile.genres)
            ? profile.genres.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];

        setUserName(profile.full_name || '');
        setUserRoles(safeRoles);
        setCurrentInstruments(safeRoles);
        setUserGenres(safeGenres);
        setSelectedGenres(safeGenres);
    };

    const loadUserProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                const cachedRaw = await AsyncStorage.getItem(OFFLINE_PROFILE_CACHE_KEY);
                if (cachedRaw) {
                    const cached = JSON.parse(cachedRaw) as CachedOfflineProfile;
                    applyProfileSignals(cached);
                }
                return;
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .single();

            const [skillsResult, genresResult] = await Promise.all([
                supabase
                    .from('profile_skills')
                    .select('skill')
                    .eq('profile_id', user.id),
                supabase
                    .from('profile_genres')
                    .select('genre')
                    .eq('profile_id', user.id),
            ]);

            if (profile) {
                setUserName(profile.full_name || '');

                const skills = (skillsResult.data || [])
                    .map((row: any) => row.skill)
                    .filter((value: any) => typeof value === 'string' && value.trim().length > 0);
                setUserRoles(skills);
                setCurrentInstruments(skills);

                const genres = (genresResult.data || [])
                    .map((row: any) => row.genre)
                    .filter((value: any) => typeof value === 'string' && value.trim().length > 0);
                setUserGenres(genres);
                setSelectedGenres(genres);

                const cachePayload: CachedOfflineProfile = {
                    full_name: profile.full_name || '',
                    roles: skills,
                    genres,
                };
                await AsyncStorage.setItem(OFFLINE_PROFILE_CACHE_KEY, JSON.stringify(cachePayload));
            }
        } catch (err) {
            console.error('Error loading profile:', err);

            try {
                const cachedRaw = await AsyncStorage.getItem(OFFLINE_PROFILE_CACHE_KEY);
                if (cachedRaw) {
                    const cached = JSON.parse(cachedRaw) as CachedOfflineProfile;
                    applyProfileSignals(cached);
                }
            } catch {
                // Keep empty profile state if cache is unavailable.
            }
        } finally {
            setLoadingProfile(false);
        }
    };

    // Toggle genre selection
    const toggleGenre = useCallback((genre: string) => {
        setSelectedGenres(prev =>
            prev.includes(genre)
                ? prev.filter(g => g !== genre)
                : [...prev, genre]
        );
    }, []);

    // Fetch Groq-backed suggestions with local ranking fallback.
    const fetchSuggestions = async () => {
        if (isSuggestionSubmitDisabled) {
            return;
        }

        setLoading(true);
        setError(null);
        setSuggestionMessage(null);

        const requestInput = {
            genres: selectedGenres,
            currentInstruments,
            userRoles,
            experienceLevel,
            purpose,
            starterBudget,
            customStarterBudgetPhp: selectedCustomBudgetPhp,
            limit: 10,
        };

        try {
            const generated = await generateInstrumentSuggestionsWithGroq(requestInput);

            if (!generated.aiPowered && isGroqQuotaExhausted(generated.message || '')) {
                setSuggestions([]);
                setIsAIPowered(false);
                setAIProvider(generated.aiProvider || groqModelLabel);
                setSuggestionMessage(null);
                setStep('preferences');
                setError('AI free-tier limit is exhausted. Suggestions are temporarily unavailable.');
                return;
            }

            if (generated.suggestions.length > 0) {
                setSuggestions(generated.suggestions);
                setIsAIPowered(generated.aiPowered);
                setAIProvider(
                    generated.aiProvider ||
                    (generated.aiPowered ? groqModelLabel : 'Local Ranker')
                );
                setSuggestionMessage(generated.message || null);
                setStep('results');
                void loadCommunityMatches(generated.suggestions);
                return;
            }

            const fallbackSuggestions = getOfflineInstrumentSuggestions(requestInput);
            if (fallbackSuggestions.length > 0) {
                setSuggestions(fallbackSuggestions);
                setIsAIPowered(false);
                setAIProvider('Local Ranker');
                setSuggestionMessage(generated.message || null);
                setStep('results');
                void loadCommunityMatches(fallbackSuggestions);
            } else {
                setSuggestions([]);
                setIsAIPowered(false);
                setAIProvider(generated.aiProvider || groqModelLabel);
                setError('Unable to generate suggestions right now. Please try again.');
            }
        } catch (err: any) {
            console.error('Error fetching suggestions:', err);

            const errorMessage = typeof err?.message === 'string' ? err.message : '';
            if (isGroqQuotaExhausted(errorMessage)) {
                setSuggestions([]);
                setIsAIPowered(false);
                setAIProvider(groqModelLabel);
                setSuggestionMessage(null);
                setStep('preferences');
                setError('AI free-tier limit is exhausted. Suggestions are temporarily unavailable.');
                return;
            }

            const fallbackSuggestions = getOfflineInstrumentSuggestions(requestInput);
            if (fallbackSuggestions.length > 0) {
                setSuggestions(fallbackSuggestions);
                setIsAIPowered(false);
                setAIProvider('Local Ranker');
                setSuggestionMessage('We could not refresh right now. Showing local suggestions.');
                setStep('results');
                void loadCommunityMatches(fallbackSuggestions);
            } else {
                setError('Failed to generate suggestions right now. Please try again.');
                setSuggestionMessage(null);
            }
        } finally {
            setLoading(false);
        }
    };

    // Toggle current instrument/role
    const toggleCurrentInstrument = useCallback((instrument: string) => {
        setCurrentInstruments(prev =>
            prev.includes(instrument)
                ? prev.filter(i => i !== instrument)
                : [...prev, instrument]
        );
    }, []);

    // Render user profile section (roles/instruments)
    const renderProfileSection = () => {
        if (loadingProfile) {
            return (
                <View style={[
                    styles.profileCard,
                    isWebDesktop && styles.webSectionCard,
                    { backgroundColor: pageCardBackground, borderColor: borderSoft }
                ]}>
                    <ActivityIndicator color={accentColor} />
                    <Text style={[styles.profileLoadingText, { color: textSecondary }]}>Loading your profile...</Text>
                </View>
            );
        }

        return (
            <View style={[
                styles.profileCard,
                isWebDesktop && styles.webSectionCard,
                { backgroundColor: pageCardBackground, borderColor: borderSoft }
            ]}>
                <View style={styles.profileHeader}>
                    <Ionicons name="person-circle" size={24} color={accentColor} />
                    <Text style={[styles.profileTitle, { color: textPrimary }]}>
                        {userName ? `Welcome, ${userName.split(' ')[0]}` : 'Your Musical Identity'}
                    </Text>
                </View>

                {userRoles.length > 0 ? (
                    <>
                        <Text style={[styles.profileSubtitle, { color: textSecondary }]}>
                            You&apos;re a <Text style={{ color: accentColor, fontFamily: 'Poppins_600SemiBold' }}>{userRoles.join(', ')}</Text>
                        </Text>
                        <Text style={[styles.profileHint, { color: textSecondary }]}>
                            These suggestions complement your role
                        </Text>
                    </>
                ) : (
                    <Text style={[styles.profileSubtitle, { color: textSecondary }]}>
                        Add roles in your profile to get personalized suggestions!
                    </Text>
                )}

                {/* Current Instruments/Skills selector */}
                {userRoles.length > 0 && (
                    <View style={[styles.currentInstrumentsSection, { borderTopColor: accentColor + '35' }]}>
                        <Text style={[styles.currentInstrumentsLabel, { color: textPrimary }]}>
                            Your current skills:
                        </Text>
                        <View style={styles.chipGrid}>
                            {userRoles.map(role => {
                                const isSelected = currentInstruments.includes(role);
                                return (
                                    <TouchableOpacity activeOpacity={1}
                                        key={role}
                                        onPress={() => toggleCurrentInstrument(role)}
                                        style={[
                                            styles.chip,
                                            {
                                                backgroundColor: isSelected ? accentColor : surfaceBackground,
                                                borderColor: isSelected ? accentColor : borderSoft,
                                            }
                                        ]}
                                    >
                                        <View style={styles.chipIconSlot}>
                                            <Ionicons
                                                name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                                                size={14}
                                                color={isSelected ? '#FFFFFF' : textSecondary}
                                            />
                                        </View>
                                        <Text style={[
                                            styles.chipText,
                                            { color: isSelected ? '#FFFFFF' : textPrimary }
                                        ]}>
                                            {role}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}
            </View>
        );
    };

    // Filter genres based on search
    const filteredGenres = genreSearch.trim()
        ? MUSIC_GENRES.filter(genre =>
            genre.toLowerCase().includes(genreSearch.toLowerCase())
        )
        : MUSIC_GENRES;

    // Render genre chips
    const renderGenreChips = () => (
        <View style={[
            styles.genreContainer,
            styles.sectionCard,
            isWebDesktop && styles.webSectionCard,
            { backgroundColor: pageCardBackground, borderColor: borderSoft }
        ]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                What genres do you play?
            </Text>
            <Text style={[styles.sectionSubtitle, { color: textSecondary }]}>
                {userGenres.length > 0 ? 'Pre-selected from your profile. Tap to adjust.' : 'Select one or more genres'}
            </Text>
            
            {/* Genre Search Input */}
            <View style={[
                styles.genreSearchContainer,
                {
                    backgroundColor: surfaceBackground,
                    borderColor: borderSoft,
                }
            ]}>
                <Ionicons name="search" size={18} color={textSecondary} />
                <TextInput
                    style={[styles.genreSearchInput, { color: textPrimary }]}
                    placeholder="Search genres..."
                    placeholderTextColor={textSecondary}
                    value={genreSearch}
                    onChangeText={setGenreSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                {genreSearch.length > 0 && (
                    <TouchableOpacity activeOpacity={1} onPress={() => setGenreSearch('')}>
                        <Ionicons name="close-circle" size={18} color={textSecondary} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Selected genres count */}
            {selectedGenres.length > 0 && (
                <Text style={[styles.selectedCount, { color: accentColor }]}>
                    {selectedGenres.length} genre{selectedGenres.length !== 1 ? 's' : ''} selected
                </Text>
            )}

            <View style={styles.chipGrid}>
                {filteredGenres.length === 0 ? (
                    <Text style={[styles.noResultsText, { color: textSecondary }]}>
                        {`No genres found for "${genreSearch}"`}
                    </Text>
                ) : filteredGenres.map(genre => {
                    const isSelected = selectedGenres.includes(genre);
                    const isFromProfile = userGenres.includes(genre);
                    return (
                        <TouchableOpacity activeOpacity={1}
                            key={genre}
                            onPress={() => toggleGenre(genre)}
                            style={[
                                styles.chip,
                                {
                                    backgroundColor: isSelected ? accentColor : surfaceBackground,
                                    borderColor: isSelected ? accentColor : borderSoft,
                                }
                            ]}
                        >
                            {isFromProfile && isSelected && (
                                <View style={styles.chipIconSlot}>
                                    <Ionicons name="star" size={11} color="#FFFFFF" />
                                </View>
                            )}
                            <Text style={[
                                styles.chipText,
                                { color: isSelected ? '#FFFFFF' : textPrimary }
                            ]}>
                                {genre}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );

    // Render experience level selector
    const renderExperienceSelector = () => (
        <View style={[
            styles.selectorContainer,
            styles.sectionCard,
            isWebDesktop && styles.webSectionCard,
            { backgroundColor: pageCardBackground, borderColor: borderSoft }
        ]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                Experience Level
            </Text>
            <View style={[styles.optionsRow, isWebDesktop && styles.optionsRowWeb]}>
                {EXPERIENCE_OPTIONS.map(option => {
                    const isSelected = experienceLevel === option.value;
                    return (
                        <TouchableOpacity activeOpacity={1}
                            key={option.value}
                            onPress={() => setExperienceLevel(option.value)}
                            style={[
                                styles.optionCard,
                                {
                                    backgroundColor: isSelected ? accentColor + '22' : surfaceBackground,
                                    borderColor: isSelected ? accentColor : borderSoft,
                                }
                            ]}
                        >
                            <Text style={[
                                styles.optionLabel,
                                { color: isSelected ? accentColor : textPrimary }
                            ]}>
                                {option.label}
                            </Text>
                            <Text style={[styles.optionDescription, { color: textSecondary }]}>
                                {option.description}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );

    // Render purpose selector
    const renderPurposeSelector = () => (
        <View style={[
            styles.selectorContainer,
            styles.sectionCard,
            isWebDesktop && styles.webSectionCard,
            { backgroundColor: pageCardBackground, borderColor: borderSoft }
        ]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                Primary Purpose
            </Text>
            <View style={styles.purposeGrid}>
                {PURPOSE_OPTIONS.map(option => {
                    const isSelected = purpose === option.value;
                    return (
                        <TouchableOpacity activeOpacity={1}
                            key={option.value}
                            onPress={() => setPurpose(option.value)}
                            style={[
                                styles.purposeCard,
                                isWebDesktop && styles.purposeCardWeb,
                                {
                                    backgroundColor: isSelected ? accentColor + '22' : surfaceBackground,
                                    borderColor: isSelected ? accentColor : borderSoft,
                                }
                            ]}
                        >
                            <Ionicons
                                name={option.icon as any}
                                size={24}
                                color={isSelected ? accentColor : textSecondary}
                            />
                            <Text style={[
                                styles.purposeLabel,
                                { color: isSelected ? accentColor : textPrimary }
                            ]}>
                                {option.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );

    const renderBudgetSelector = () => {
        const isSelected = starterBudget === 'custom';

        return (
            <View style={[
                styles.selectorContainer,
                styles.sectionCard,
                isWebDesktop && styles.webSectionCard,
                { backgroundColor: pageCardBackground, borderColor: borderSoft }
            ]}>
                <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                    What is your starting budget?
                </Text>
                <Text style={[styles.sectionSubtitle, { color: textSecondary }]}>
                    This helps rank realistic instruments and starter gear.
                </Text>
                <View style={[styles.budgetGrid, isWebDesktop && styles.budgetGridWeb]}>
                    {STARTER_BUDGET_OPTIONS.map((option) => {
                        const isOptionSelected = starterBudget === option.value;
                        return (
                            <TouchableOpacity
                                activeOpacity={1}
                                key={option.value}
                                onPress={() => setStarterBudget(option.value)}
                                style={[
                                    styles.budgetCard,
                                    isWebDesktop && styles.budgetCardWeb,
                                    {
                                        backgroundColor: isOptionSelected ? accentColor + '22' : surfaceBackground,
                                        borderColor: isOptionSelected ? accentColor : borderSoft,
                                    },
                                ]}
                            >
                                <View style={styles.budgetCardHeader}>
                                    <Ionicons
                                        name={isOptionSelected ? 'checkmark-circle' : 'wallet-outline'}
                                        size={18}
                                        color={isOptionSelected ? accentColor : textSecondary}
                                    />
                                    <Text style={[styles.budgetLabel, { color: isOptionSelected ? accentColor : textPrimary }]}>
                                        {option.label}
                                    </Text>
                                </View>
                                <Text style={[styles.budgetDescription, { color: textSecondary }]}>
                                    {option.description}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setStarterBudget('custom')}
                    style={[
                        styles.budgetCard,
                        styles.customBudgetCard,
                        {
                            backgroundColor: isSelected ? accentColor + '22' : surfaceBackground,
                            borderColor: isSelected ? accentColor : borderSoft,
                        },
                    ]}
                >
                    <View style={styles.budgetCardHeader}>
                        <Ionicons
                            name={isSelected ? 'checkmark-circle' : 'create-outline'}
                            size={18}
                            color={isSelected ? accentColor : textSecondary}
                        />
                        <Text style={[styles.budgetLabel, { color: isSelected ? accentColor : textPrimary }]}>
                            Specific amount
                        </Text>
                    </View>
                    <Text style={[styles.budgetDescription, { color: textSecondary }]}>
                        Match gear to your exact peso budget
                    </Text>
                    <View
                        style={[
                            styles.customBudgetInputShell,
                            {
                                backgroundColor: isDark ? '#111827' : '#F9FAFB',
                                borderColor: isSelected ? accentColor : borderSoft,
                            },
                        ]}
                    >
                        <Text style={[styles.customBudgetCurrency, { color: isSelected ? accentColor : textSecondary }]}>
                            {PHP_SYMBOL}
                        </Text>
                        <TextInput
                            value={customBudgetAmount}
                            onChangeText={(value) => {
                                setStarterBudget('custom');
                                setCustomBudgetAmount(formatBudgetAmountInput(value));
                            }}
                            onFocus={() => setStarterBudget('custom')}
                            style={[styles.customBudgetInput, { color: textPrimary }]}
                            placeholder="5,000"
                            placeholderTextColor={textSecondary}
                            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                            maxLength={12}
                        />
                    </View>
                    {isSelected && !selectedCustomBudgetPhp && (
                        <Text style={[styles.customBudgetHelper, { color: textSecondary }]}>
                            Enter an amount above {PHP_SYMBOL}0
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    const renderJourneySummary = () => {
        const topSuggestion = suggestions[0];
        if (!topSuggestion) return null;

        const purposeLabel = PURPOSE_OPTIONS.find((option) => option.value === purpose)?.label || purpose;
        const journeyStats = [
            { label: 'Recommended Role', value: topSuggestion.recommendedRole || topSuggestion.perfectFor || 'Musician' },
            { label: 'Best Instrument', value: topSuggestion.name },
            { label: 'Goal', value: purposeLabel },
            { label: 'Match Score', value: `${topSuggestion.score}%` },
            { label: 'Budget Level', value: formatBudgetLevel(topSuggestion.budgetLevel) },
            { label: 'Starter Budget', value: topSuggestion.estimatedStarterBudget || getSelectedBudgetLabel() },
            { label: 'Learning Plan', value: '30 days' },
            { label: 'Next Mission', value: topSuggestion.nextMission || 'Upload your first practice clip' },
        ];

        return (
            <View style={[styles.journeyPanel, isWebDesktop && styles.webSectionCard, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
                <View style={styles.journeyHeader}>
                    <View style={[styles.journeyIcon, { backgroundColor: accentColor + '1F' }]}>
                        <Ionicons name="map-outline" size={20} color={accentColor} />
                    </View>
                    <View style={styles.journeyHeaderCopy}>
                        <Text style={[styles.journeyTitle, { color: textPrimary }]}>Your Music Journey</Text>
                        <Text style={[styles.journeySubtitle, { color: textSecondary }]}>
                            Built from your role, genres, goal, and starter budget
                        </Text>
                    </View>
                </View>

                <View style={styles.journeyGrid}>
                    {journeyStats.map((item) => (
                        <View
                            key={item.label}
                            style={[styles.journeyStat, isWebDesktop && styles.journeyStatWeb, { backgroundColor: surfaceBackground }]}
                        >
                            <Text style={[styles.journeyStatLabel, { color: textSecondary }]}>{item.label}</Text>
                            <Text style={[styles.journeyStatValue, { color: textPrimary }]}>{item.value}</Text>
                        </View>
                    ))}
                </View>

                {topSuggestion.starterGear && topSuggestion.starterGear.length > 0 && (
                    <View style={styles.journeyBlock}>
                        <Text style={[styles.journeyBlockTitle, { color: textPrimary }]}>Suggested Gear</Text>
                        <View style={styles.gearChipRow}>
                            {topSuggestion.starterGear.slice(0, 5).map((gear) => (
                                <View key={gear} style={[styles.gearChip, { backgroundColor: accentColor + '16' }]}>
                                    <Text style={[styles.gearChipText, { color: accentColor }]}>{gear}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {topSuggestion.learningPlan && topSuggestion.learningPlan.length > 0 && (
                    <View style={styles.journeyBlock}>
                        <Text style={[styles.journeyBlockTitle, { color: textPrimary }]}>30-Day Learning Plan</Text>
                        {topSuggestion.learningPlan.map((stepItem) => (
                            <View key={stepItem.title} style={styles.learningPlanRow}>
                                <Text style={[styles.learningPlanTitle, { color: accentColor }]}>{stepItem.title}</Text>
                                <Text style={[styles.learningPlanDetail, { color: textSecondary }]}>{stepItem.detail}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        );
    };

    const renderCommunitySection = () => {
        if (step !== 'results' || suggestions.length === 0) {
            return null;
        }

        const renderMatchGroup = (title: string, matches: CommunityMatch[]) => {
            if (matches.length === 0) return null;
            return (
                <View style={styles.communityGroup}>
                    <Text style={[styles.communityGroupTitle, { color: textPrimary }]}>{title}</Text>
                    {matches.map((match) => (
                        <View
                            key={match.id}
                            style={[styles.communityCard, { backgroundColor: surfaceBackground, borderColor: borderSoft }]}
                        >
                            {match.image ? (
                                <Image source={{ uri: match.image }} style={styles.communityImage} resizeMode="cover" />
                            ) : (
                                <View style={[styles.communityImageFallback, { backgroundColor: accentColor + '20' }]}>
                                    <Ionicons
                                        name={match.kind === 'person' ? 'person-outline' : 'people-outline'}
                                        size={18}
                                        color={accentColor}
                                    />
                                </View>
                            )}
                            <View style={styles.communityInfo}>
                                <Text style={[styles.communityName, { color: textPrimary }]}>{match.name}</Text>
                                <Text style={[styles.communitySubtitle, { color: textSecondary }]} numberOfLines={1}>
                                    {match.subtitle || (match.kind === 'person' ? 'MusikaLokal musician' : 'MusikaLokal profile')}
                                </Text>
                                <Text style={[styles.communityReason, { color: accentColor }]}>{match.reason}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            );
        };

        const people = communityMatches.filter((match) => match.kind === 'person');
        const duos = communityMatches.filter((match) => match.kind === 'duo');
        const groups = communityMatches.filter((match) => match.kind === 'group');

        return (
            <View style={[styles.journeyPanel, isWebDesktop && styles.webSectionCard, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
                <View style={styles.journeyHeader}>
                    <View style={[styles.journeyIcon, { backgroundColor: '#0EA5E9' + '20' }]}>
                        <Ionicons name="people-outline" size={20} color="#0EA5E9" />
                    </View>
                    <View style={styles.journeyHeaderCopy}>
                        <Text style={[styles.journeyTitle, { color: textPrimary }]}>Connect Next</Text>
                        <Text style={[styles.journeySubtitle, { color: textSecondary }]}>
                            Suggested people, duos, and groups already inside MusikaLokal
                        </Text>
                    </View>
                </View>

                {loadingCommunity ? (
                    <View style={styles.communityLoading}>
                        <ActivityIndicator color={accentColor} />
                        <Text style={[styles.communitySubtitle, { color: textSecondary }]}>Finding MusikaLokal matches...</Text>
                    </View>
                ) : communityMatches.length > 0 ? (
                    <>
                        {renderMatchGroup('Suggested People', people)}
                        {renderMatchGroup('Suggested Duos', duos)}
                        {renderMatchGroup('Suggested Groups', groups)}
                    </>
                ) : (
                    <Text style={[styles.emptyCommunityText, { color: textSecondary }]}>
                        Real MusikaLokal matches will appear here when matching profiles are available.
                    </Text>
                )}
            </View>
        );
    };

    // Render suggestion card - Enhanced AI-powered design
    const renderSuggestionCard = (suggestion: InstrumentSuggestion, index: number) => {
        const matchPercentage = suggestion.score;
        const learningCurveColors = {
            easy: '#22C55E',
            moderate: '#F59E0B',
            challenging: '#EF4444'
        };
        const learningCurveIcons = {
            easy: 'leaf',
            moderate: 'trending-up',
            challenging: 'flame'
        };

        return (
            <View
                key={suggestion.name}
                style={[styles.suggestionCard, {
                    backgroundColor: pageCardBackground,
                    borderColor: borderSoft,
                }]}
            >
                {/* Rank Badge */}
                <View style={[styles.rankBadge, { backgroundColor: accentColor }]}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                </View>

                {/* Header Section */}
                <View style={styles.cardHeader}>
                    <Image
                        source={{ uri: suggestion.image }}
                        style={styles.instrumentImage}
                        resizeMode="cover"
                    />
                    <View style={styles.headerInfo}>
                        <View style={styles.nameRow}>
                            <Text style={[styles.instrumentName, { color: textPrimary }]}>
                                {suggestion.name}
                            </Text>
                            <Ionicons name="sparkles" size={14} color={accentColor} />
                        </View>

                        {/* AI Headline */}
                        {suggestion.headline && (
                            <Text style={[styles.headline, { color: accentColor }]}>
                                {`"${suggestion.headline}"`}
                            </Text>
                        )}

                        {/* Match Score */}
                        <View style={styles.matchContainer}>
                            <View style={[styles.matchBar, { backgroundColor: colors.border }]}>
                                <View
                                    style={[
                                        styles.matchProgress,
                                        {
                                            width: `${matchPercentage}%`,
                                            backgroundColor: matchPercentage >= 90 ? '#22C55E' : matchPercentage >= 75 ? accentColor : '#F59E0B'
                                        }
                                    ]}
                                />
                            </View>
                            <Text style={[styles.matchText, { color: matchPercentage >= 90 ? '#22C55E' : accentColor }]}>
                                {matchPercentage}%
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Perfect For Tag */}
                {suggestion.perfectFor && (
                    <View style={[styles.perfectForBadge, { backgroundColor: accentColor + '1F' }]}>
                        <Ionicons name="star" size={12} color={accentColor} />
                        <Text style={[styles.perfectForText, { color: accentColor }]}>
                            {suggestion.perfectFor}
                        </Text>
                    </View>
                )}

                {suggestion.recommendedRole && (
                    <View style={[styles.roleFitBox, { backgroundColor: surfaceBackground, borderColor: borderSoft }]}>
                        <Text style={[styles.roleFitLabel, { color: textSecondary }]}>Recommended Role</Text>
                        <Text style={[styles.roleFitValue, { color: textPrimary }]}>{suggestion.recommendedRole}</Text>
                        {suggestion.roleFitReason && (
                            <Text style={[styles.roleFitReason, { color: textSecondary }]}>{suggestion.roleFitReason}</Text>
                        )}
                    </View>
                )}

                {/* AI Explanation */}
                <Text style={[styles.matchReason, { color: textPrimary }]}>
                    {suggestion.matchReason}
                </Text>

                {/* Learning Info Row */}
                <View style={[styles.learningRow, { backgroundColor: surfaceBackground }]}>
                    <View style={styles.learningItem}>
                        <Ionicons
                            name={learningCurveIcons[suggestion.learningCurve as keyof typeof learningCurveIcons] as any || 'trending-up'}
                            size={16}
                            color={learningCurveColors[suggestion.learningCurve as keyof typeof learningCurveColors] || '#F59E0B'}
                        />
                        <Text style={[styles.learningLabel, { color: textSecondary }]}>Learning</Text>
                        <Text style={[styles.learningValue, { color: learningCurveColors[suggestion.learningCurve as keyof typeof learningCurveColors] || '#F59E0B' }]}>
                            {suggestion.learningCurve || 'moderate'}
                        </Text>
                    </View>
                    <View style={styles.learningDivider} />
                    <View style={styles.learningItem}>
                        <Ionicons name="time-outline" size={16} color={accentColor} />
                        <Text style={[styles.learningLabel, { color: textSecondary }]}>To basics</Text>
                        <Text style={[styles.learningValue, { color: accentColor }]}>
                            {suggestion.timeToBasics || '1-2 months'}
                        </Text>
                    </View>
                </View>

                {suggestion.estimatedStarterBudget && (
                    <View style={[styles.budgetEstimateBox, { backgroundColor: isDark ? '#132016' : '#F0FDF4', borderColor: '#22C55E' + '55' }]}>
                        <View style={styles.budgetEstimateHeader}>
                            <Ionicons name="wallet-outline" size={16} color="#16A34A" />
                            <Text style={styles.budgetEstimateLabel}>Estimated Starter Budget</Text>
                            <Text style={styles.budgetEstimateValue}>{suggestion.estimatedStarterBudget}</Text>
                        </View>
                        {suggestion.starterGear && suggestion.starterGear.length > 0 && (
                            <Text style={[styles.budgetGearText, { color: isDark ? '#BBF7D0' : '#166534' }]}>
                                Includes: {suggestion.starterGear.slice(0, 5).join(', ')}
                            </Text>
                        )}
                        {suggestion.budgetNote && (
                            <Text style={[styles.budgetNoteText, { color: isDark ? '#DCFCE7' : '#166534' }]}>
                                {suggestion.budgetNote}
                            </Text>
                        )}
                    </View>
                )}

                {/* Pro Tip */}
                {suggestion.proTip && (
                    <View style={[styles.proTipContainer, { backgroundColor: isDark ? '#1D2A44' : '#ECF4FF' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ionicons name="bulb" size={16} color={isDark ? '#38BDF8' : '#0369A1'} />
                            <Text style={styles.proTipLabel}>Pro Tip</Text>
                        </View>
                        <Text style={[styles.proTipText, { color: textPrimary }]}>{suggestion.proTip}</Text>
                    </View>
                )}

                {/* Famous Players */}
                {suggestion.famousPlayers && suggestion.famousPlayers.length > 0 && (
                    <View style={styles.famousPlayersContainer}>
                        <Text style={[styles.famousPlayersLabel, { color: textSecondary }]}>
                            Inspired by:
                        </Text>
                        <Text style={[styles.famousPlayersText, { color: textPrimary }]}>
                            {suggestion.famousPlayers.join(', ')}
                        </Text>
                    </View>
                )}

                {suggestion.nextMission && (
                    <View style={[styles.nextMissionBox, { backgroundColor: accentColor + '12', borderColor: accentColor + '44' }]}>
                        <Ionicons name="flag-outline" size={16} color={accentColor} />
                        <View style={styles.nextMissionCopy}>
                            <Text style={[styles.nextMissionLabel, { color: accentColor }]}>Next Mission</Text>
                            <Text style={[styles.nextMissionText, { color: textPrimary }]}>{suggestion.nextMission}</Text>
                        </View>
                    </View>
                )}

                {/* Tags */}
                <View style={styles.tagsRow}>
                    <View style={[styles.tag, { backgroundColor: accentColor + '20' }]}>
                        <Text style={[styles.tagText, { color: accentColor }]}>
                            {suggestion.category}
                        </Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: surfaceBackground }]}>
                        <Text style={[styles.tagText, { color: textSecondary }]}>
                            {suggestion.difficulty}
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    // Render preferences step
    const renderPreferencesStep = () => (
        <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: 160 + insets.bottom },
                isWebDesktop && styles.scrollContentWeb,
            ]}
            showsVerticalScrollIndicator={false}
        >
            {/* Profile Section - Shows user's current role */}
            {renderProfileSection()}

            {renderGenreChips()}
            {renderExperienceSelector()}
            {renderPurposeSelector()}
            {renderBudgetSelector()}

            {/* Get Suggestions Button */}
            <TouchableOpacity activeOpacity={1}
                onPress={fetchSuggestions}
                disabled={isSuggestionSubmitDisabled}
                style={[
                    styles.primaryButton,
                    {
                        backgroundColor: isSuggestionFormReady ? accentColor : borderSoft,
                        opacity: isSuggestionSubmitDisabled ? 0.6 : 1,
                    }
                ]}
            >
                {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                ) : (
                    <>
                        <Ionicons name="sparkles" size={20} color={isSuggestionFormReady ? "#FFFFFF" : textSecondary} />
                        <Text style={[styles.primaryButtonText, { color: isSuggestionFormReady ? "#FFFFFF" : textSecondary }]}>
                            Get AI Suggestions
                        </Text>
                    </>
                )}
            </TouchableOpacity>

            {!isSuggestionFormReady && (
                <Text style={[styles.helperText, { color: textSecondary, textAlign: 'center' }]}>
                    Select at least one genre to get suggestions
                </Text>
            )}
        </ScrollView>
    );

    // Render results step
    const renderResultsStep = () => {
        const badgeColor = accentColor;
        const visibleSuggestionMessage = cleanProviderCopy(suggestionMessage);

        return (
            <ScrollView
                ref={resultsScrollRef}
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: contentBottomPadding + 96 },
                    isWebDesktop && styles.scrollContentWeb,
                ]}
                showsVerticalScrollIndicator={false}
            >
                {/* Back Button */}
                <TouchableOpacity activeOpacity={1}
                    onPress={() => setStep('preferences')}
                    style={styles.backButton}
                >
                    <Ionicons name="arrow-back" size={20} color={accentColor} />
                    <Text style={[styles.backButtonText, { color: accentColor }]}>
                        Change Preferences
                    </Text>
                </TouchableOpacity>

                {/* AI Header Card */}
                <View style={[styles.aiHeaderCard, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}> 
                    <View style={[styles.aiHeaderIcon, { backgroundColor: accentColor + '1F' }]}>
                        <Ionicons name="sparkles" size={32} color={accentColor} />
                    </View>
                    <Text style={[styles.aiHeaderTitle, { color: textPrimary }]}>
                        {userRoles.length > 0
                            ? `Perfect for a ${userRoles[0]}`
                            : 'Your Personalized Picks'}
                    </Text>
                    <Text style={[styles.aiHeaderSubtitle, { color: textSecondary }]}>
                        Personalized from your profile and preferences
                    </Text>

                    {/* User Role Badge */}
                    {userRoles.length > 0 && (
                        <View style={[styles.roleBadge, { backgroundColor: accentColor }]}>
                            <Ionicons name="person" size={12} color="#FFFFFF" />
                            <Text style={styles.roleBadgeText}>{userRoles.join(' • ')}</Text>
                        </View>
                    )}

                    {/* Preferences Tags */}
                    <View style={styles.preferenceTags}>
                        {selectedGenres.slice(0, 3).map(genre => (
                            <View key={genre} style={[styles.preferenceTag, { backgroundColor: accentColor + '20' }]}>
                                <Text style={[styles.preferenceTagText, { color: accentColor }]}>{genre}</Text>
                            </View>
                        ))}
                        {selectedGenres.length > 3 && (
                            <View style={[styles.preferenceTag, { backgroundColor: accentColor + '20' }]}>
                                <Text style={[styles.preferenceTagText, { color: accentColor }]}>+{selectedGenres.length - 3} more</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.preferenceTags}>
                        <View style={[styles.preferenceTag, { backgroundColor: accentColor + '20' }]}>
                            <Text style={[styles.preferenceTagText, { color: accentColor }]}>{experienceLevel}</Text>
                        </View>
                        <View style={[styles.preferenceTag, { backgroundColor: accentColor + '20' }]}>
                            <Text style={[styles.preferenceTagText, { color: accentColor }]}>{purpose}</Text>
                        </View>
                        <View style={[styles.preferenceTag, { backgroundColor: accentColor + '20' }]}>
                            <Text style={[styles.preferenceTagText, { color: accentColor }]}>{getSelectedBudgetLabel()}</Text>
                        </View>
                    </View>
                </View>

                {/* Results Count */}
                <View style={styles.resultsCountRow}>
                    <Text style={[styles.resultsHeader, { color: textPrimary }]}>
                        {suggestions.length} Perfect Matches
                    </Text>
                    <View style={[styles.aiBadgeMini, { backgroundColor: badgeColor }]}>
                        <Ionicons name={isAIPowered ? 'sparkles' : 'compass'} size={10} color="#FFFFFF" />
                        <Text style={styles.aiBadgeMiniText}>{isAIPowered ? 'AI' : 'SMART'}</Text>
                    </View>
                </View>
                <Text style={[styles.resultsSubtitle, { color: textSecondary }]}>
                    {userRoles.length > 0
                        ? `Instruments that complement your role as a ${userRoles[0]}`
                        : 'Curated just for you based on your musical profile'}
                </Text>

                {visibleSuggestionMessage && (
                    <View style={[styles.fallbackInfoContainer, { backgroundColor: colors.primaryLight, borderColor: accentColor }]}>
                        <Ionicons name="information-circle" size={16} color={accentColor} />
                        <Text style={[styles.fallbackInfoText, { color: textPrimary }]}>{visibleSuggestionMessage}</Text>
                    </View>
                )}

                {renderJourneySummary()}
                {renderCommunitySection()}
                {renderFollowupChatSection()}

                {/* Suggestion Cards */}
                {suggestions.map((suggestion, index) => renderSuggestionCard(suggestion, index))}

                {/* Refresh Button */}
                <TouchableOpacity activeOpacity={1}
                    onPress={isAIPowered ? () => setStep('preferences') : fetchSuggestions}
                    disabled={loading}
                    style={[styles.secondaryButton, { borderColor: badgeColor, backgroundColor: badgeColor + '10', opacity: loading ? 0.6 : 1 }]}
                >
                    {loading ? (
                        <ActivityIndicator color={badgeColor} />
                    ) : (
                        <>
                            <Ionicons name={isAIPowered ? 'sparkles' : 'refresh'} size={18} color={badgeColor} />
                            <Text style={[styles.secondaryButtonText, { color: badgeColor }]}>
                                {isAIPowered ? 'Get New AI Suggestions' : 'Retry AI Suggestions'}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        );
    };

    const renderFollowupChatSection = () => {
        if (step !== 'results' || suggestions.length === 0) {
            return null;
        }

        const badgeColor = isAIPowered ? accentColor : '#0EA5E9';
        const normalizedQuestion = normalizeVisibleInput(followupQuestion);
        const viewportHeight = Dimensions.get('window').height;
        const panelMaxHeight = Math.round(viewportHeight * MAX_CHAT_PANEL_HEIGHT_RATIO);
        const messagesMaxHeight = Math.max(160, Math.round(viewportHeight * MAX_CHAT_MESSAGE_HEIGHT_RATIO));

        return (
            <View
                onLayout={(event) => {
                    followupSectionYRef.current = event.nativeEvent.layout.y;
                }}
                style={[
                    styles.followupPanel,
                    styles.followupPanelInline,
                    {
                        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                        borderColor: badgeColor,
                        maxHeight: panelMaxHeight,
                    },
                ]}
            >
                <View style={styles.followupHeader}>
                    <View style={[styles.followupHeaderIcon, { backgroundColor: badgeColor + '22' }]}>
                        <Ionicons name="chatbubble-ellipses" size={16} color={badgeColor} />
                    </View>
                    <View style={styles.followupHeaderCopy}>
                        <Text style={[styles.followupTitle, { color: textPrimary }]}>Instrument AI Chat</Text>
                        <Text style={[styles.followupSubtitle, { color: textSecondary }]}>Only your suggested instruments</Text>
                    </View>
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => {
                            setIsFollowupChatOpen((prev) => {
                                const next = !prev;
                                if (next) {
                                    ensureFollowupWelcome();
                                    scrollToFollowupChat();
                                }
                                return next;
                            });
                        }}
                    >
                        <Ionicons name={isFollowupChatOpen ? 'chevron-up' : 'chevron-down'} size={18} color={textSecondary} />
                    </TouchableOpacity>
                </View>

                {isFollowupChatOpen ? (
                    <>
                        <ScrollView
                            ref={followupMessagesScrollRef}
                            style={[styles.followupMessages, { maxHeight: messagesMaxHeight }]}
                            contentContainerStyle={styles.followupMessagesContent}
                            showsVerticalScrollIndicator={false}
                            onContentSizeChange={() => {
                                followupMessagesScrollRef.current?.scrollToEnd({ animated: true });
                            }}
                        >
                            {followupMessages.map((message) => {
                                const isUser = message.role === 'user';
                                const bubbleBackground = isUser
                                    ? badgeColor
                                    : message.blocked
                                        ? (isDark ? '#3F1D1D' : '#FEE2E2')
                                        : (isDark ? '#1E293B' : '#F1F5F9');
                                const bubbleTextColor = isUser
                                    ? '#FFFFFF'
                                    : message.blocked
                                        ? '#B91C1C'
                                        : textPrimary;

                                return (
                                    <View
                                        key={message.id}
                                        style={[
                                            styles.followupBubble,
                                            { alignSelf: isUser ? 'flex-end' : 'flex-start', backgroundColor: bubbleBackground },
                                        ]}
                                    >
                                        <Text style={[styles.followupBubbleText, { color: bubbleTextColor }]}>
                                            {isUser ? message.text : cleanAiText(message.text)}
                                        </Text>
                                    </View>
                                );
                            })}

                            {followupLoading && (
                                <View style={[styles.followupBubble, styles.followupTypingBubble, { alignSelf: 'flex-start', backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                                    <ActivityIndicator size="small" color={badgeColor} />
                                    <Text style={[styles.followupTypingText, { color: textSecondary }]}>Typing...</Text>
                                </View>
                            )}
                        </ScrollView>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.followupQuickRow}
                            style={styles.followupQuickScroll}
                        >
                            {suggestions.slice(0, 3).map((suggestion) => (
                                <TouchableOpacity
                                    activeOpacity={1}
                                    key={`quick-${suggestion.name}`}
                                    onPress={() => sendFollowupQuestion(`How does ${suggestion.name} fit my profile?`)}
                                    disabled={followupLoading}
                                    style={[
                                        styles.followupQuickChip,
                                        {
                                            borderColor: badgeColor + '66',
                                            backgroundColor: badgeColor + '12',
                                            opacity: followupLoading ? 0.6 : 1,
                                        },
                                    ]}
                                >
                                    <Text style={[styles.followupQuickChipText, { color: badgeColor }]}>
                                        Ask about {suggestion.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <View
                            style={[
                                styles.followupComposer,
                                {
                                    borderColor: isDark ? '#334155' : '#D9E2EF',
                                    backgroundColor: isDark ? '#111827' : '#F8FAFC',
                                },
                            ]}
                        >
                            <TextInput
                                value={followupQuestion}
                                onChangeText={setFollowupQuestion}
                                style={[styles.followupInput, { color: textPrimary }]}
                                placeholder="Ask about these suggested instruments"
                                placeholderTextColor={textSecondary}
                                multiline
                                maxLength={220}
                                editable={!followupLoading}
                            />
                            <TouchableOpacity
                                activeOpacity={1}
                                onPress={() => sendFollowupQuestion()}
                                disabled={followupLoading || !normalizedQuestion}
                                style={[
                                    styles.followupSendButton,
                                    {
                                        backgroundColor:
                                            followupLoading || !normalizedQuestion
                                                ? borderSoft
                                                : badgeColor,
                                        opacity: followupLoading || !normalizedQuestion ? 0.6 : 1,
                                    },
                                ]}
                            >
                                <Ionicons name="send" size={16} color={normalizedQuestion ? "#FFFFFF" : textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => {
                            setIsFollowupChatOpen(true);
                            ensureFollowupWelcome();
                            scrollToFollowupChat();
                        }}
                        style={[styles.followupFab, styles.followupInlineButton, { backgroundColor: badgeColor }]}
                    >
                        <Ionicons name="chatbubble-ellipses" size={16} color="#FFFFFF" />
                        <Text style={styles.followupFabText}>Ask AI Chat</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: pageBackground }]}>
            <KeyboardAvoidingView
                style={styles.keyboardFrame}
                behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
            >
            <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
                <Header title="AI Suggestions" />

                {isGuest ? (
                    <GuestSignInGate message="Sign in to use AI instrument suggestions." />
                ) : (
                    <>

                        {/* Error Message */}
                        {error && (
                            <View style={[styles.errorContainer, { backgroundColor: isDark ? '#3F1E2A' : '#FEE2E2' }]}>
                                <Ionicons name="warning" size={20} color="#DC2626" />
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        {/* Content */}
                        {step === 'preferences' ? renderPreferencesStep() : renderResultsStep()}
                    </>
                )}

            </View>
            </KeyboardAvoidingView>

            <Navbar />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    keyboardFrame: {
        flex: 1,
    },
    pageFrame: {
        flex: 1,
    },
    pageFrameWeb: {
        maxWidth: 1240,
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    scrollContentWeb: {
        width: '100%',
        maxWidth: 1120,
        alignSelf: 'center',
        paddingHorizontal: 12,
        paddingTop: 12,
    },
    sectionCard: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    webSectionCard: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 3,
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 12,
    },
    genreContainer: {
        marginBottom: 24,
    },
    genreSearchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
        gap: 8,
    },
    genreSearchInput: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        padding: 0,
        margin: 0,
    },
    selectedCount: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 8,
    },
    noResultsText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        fontStyle: 'italic',
        paddingVertical: 12,
    },
    chipGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    chipIconSlot: {
        width: 14,
        height: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipText: {
        fontSize: 13,
        lineHeight: 17,
        fontFamily: 'Poppins_500Medium',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    selectorContainer: {
        marginBottom: 24,
    },
    optionsRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    optionsRowWeb: {
        gap: 12,
    },
    optionCard: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        alignItems: 'center',
    },
    optionLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    optionDescription: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
    purposeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    purposeCard: {
        width: "48%",
        padding: 16,
        borderRadius: 12,
        borderWidth: 1.5,
        alignItems: 'center',
        gap: 8,
    },
    purposeCardWeb: {
        width: '24%',
        minWidth: 200,
    },
    purposeLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
    budgetGrid: {
        gap: 8,
    },
    budgetGridWeb: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    budgetCard: {
        padding: 12,
        borderRadius: 12,
        borderWidth: 1.5,
    },
    customBudgetCard: {
        marginTop: 8,
        gap: 8,
    },
    budgetCardWeb: {
        width: '32%',
        minWidth: 220,
    },
    budgetCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    budgetLabel: {
        flexShrink: 1,
        fontSize: 13,
        lineHeight: 17,
        fontFamily: 'Poppins_600SemiBold',
        includeFontPadding: false,
    },
    budgetDescription: {
        fontSize: 11,
        lineHeight: 16,
        fontFamily: 'Poppins_400Regular',
    },
    customBudgetInputShell: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
    },
    customBudgetCurrency: {
        fontSize: 14,
        lineHeight: 18,
        fontFamily: 'Poppins_600SemiBold',
        marginRight: 6,
    },
    customBudgetInput: {
        flex: 1,
        height: 36,
        fontSize: 15,
        lineHeight: 20,
        fontFamily: 'Poppins_600SemiBold',
        includeFontPadding: false,
        padding: 0,
        margin: 0,
    },
    customBudgetHelper: {
        fontSize: 10,
        lineHeight: 14,
        fontFamily: 'Poppins_400Regular',
    },
    helperText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        marginTop: 8,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 54,
        paddingHorizontal: 16,
        paddingVertical: 0,
        borderRadius: 12,
        marginTop: 8,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        lineHeight: 20,
        fontFamily: 'Poppins_600SemiBold',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    secondaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 50,
        paddingHorizontal: 14,
        paddingVertical: 0,
        borderRadius: 12,
        borderWidth: 2,
        marginTop: 16,
    },
    secondaryButtonText: {
        fontSize: 14,
        lineHeight: 18,
        fontFamily: 'Poppins_600SemiBold',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 16,
    },
    backButtonText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    // Profile card styles
    profileCard: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 2,
        marginBottom: 20,
    },
    profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    profileTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },
    profileSubtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 4,
    },
    profileHint: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        fontStyle: 'italic',
    },
    profileLoadingText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: 8,
    },
    currentInstrumentsSection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(139, 92, 246, 0.2)',
    },
    currentInstrumentsLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 8,
    },
    summaryContainer: {
        padding: 12,
        borderRadius: 12,
        marginBottom: 20,
    },
    summaryText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    aiBadgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 10,
        borderRadius: 10,
        marginBottom: 16,
    },
    aiBadgeText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    aiHeaderCard: {
        padding: 20,
        borderRadius: 16,
        borderWidth: 2,
        marginBottom: 20,
        alignItems: 'center',
    },
    aiHeaderIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#0EA5E920',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    aiHeaderTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
    },
    aiHeaderSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 12,
    },
    llmConfigRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 10,
    },
    llmConfigText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    llmLimitText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 16,
        marginBottom: 12,
        textAlign: 'center',
    },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 12,
    },
    roleBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    preferenceTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        marginTop: 4,
    },
    preferenceTag: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    preferenceTagText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    resultsCountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    aiBadgeMini: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    aiBadgeMiniText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
    },
    resultsHeader: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
    },
    resultsSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 16,
    },
    fallbackInfoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 12,
    },
    fallbackInfoText: {
        flex: 1,
        color: '#1D4ED8',
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    journeyPanel: {
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 16,
    },
    journeyHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    journeyIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    journeyHeaderCopy: {
        flex: 1,
        minWidth: 0,
    },
    journeyTitle: {
        fontSize: 16,
        lineHeight: 20,
        fontFamily: 'Poppins_700Bold',
    },
    journeySubtitle: {
        fontSize: 11,
        lineHeight: 16,
        fontFamily: 'Poppins_400Regular',
    },
    journeyGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    journeyStat: {
        width: '48%',
        minHeight: 70,
        padding: 10,
        borderRadius: 12,
        justifyContent: 'center',
    },
    journeyStatWeb: {
        width: '24%',
        minWidth: 210,
    },
    journeyStatLabel: {
        fontSize: 10,
        lineHeight: 14,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 2,
    },
    journeyStatValue: {
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Poppins_700Bold',
    },
    journeyBlock: {
        marginTop: 12,
    },
    journeyBlockTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
    },
    gearChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    gearChip: {
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 10,
    },
    gearChipText: {
        fontSize: 10,
        lineHeight: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    learningPlanRow: {
        marginBottom: 8,
    },
    learningPlanTitle: {
        fontSize: 11,
        lineHeight: 15,
        fontFamily: 'Poppins_700Bold',
    },
    learningPlanDetail: {
        fontSize: 11,
        lineHeight: 16,
        fontFamily: 'Poppins_400Regular',
    },
    communityGroup: {
        marginTop: 10,
    },
    communityGroupTitle: {
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
    },
    communityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        marginBottom: 8,
    },
    communityImage: {
        width: 42,
        height: 42,
        borderRadius: 21,
    },
    communityImageFallback: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
    },
    communityInfo: {
        flex: 1,
        minWidth: 0,
    },
    communityName: {
        fontSize: 13,
        lineHeight: 17,
        fontFamily: 'Poppins_700Bold',
    },
    communitySubtitle: {
        fontSize: 11,
        lineHeight: 15,
        fontFamily: 'Poppins_400Regular',
    },
    communityReason: {
        fontSize: 11,
        lineHeight: 15,
        fontFamily: 'Poppins_600SemiBold',
        marginTop: 2,
    },
    communityLoading: {
        alignItems: 'center',
        gap: 8,
        paddingVertical: 12,
    },
    emptyCommunityText: {
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Poppins_400Regular',
    },
    suggestionCard: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 16,
        position: 'relative',
    },
    cardHeader: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    headerInfo: {
        flex: 1,
    },
    rankBadge: {
        position: 'absolute',
        top: -8,
        left: -8,
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
        shadowColor: '#0EA5E9',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
    rankText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
    },
    instrumentImage: {
        width: 70,
        height: 70,
        borderRadius: 12,
        marginRight: 14,
    },
    suggestionInfo: {
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 2,
    },
    instrumentName: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },
    headline: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        fontStyle: 'italic',
        marginBottom: 6,
    },
    matchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    matchBar: {
        flex: 1,
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    matchProgress: {
        height: '100%',
        borderRadius: 3,
    },
    matchText: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
        minWidth: 35,
    },
    perfectForBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: 10,
    },
    perfectForText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
    },
    roleFitBox: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        marginBottom: 10,
    },
    roleFitLabel: {
        fontSize: 10,
        lineHeight: 13,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 2,
    },
    roleFitValue: {
        fontSize: 13,
        lineHeight: 17,
        fontFamily: 'Poppins_700Bold',
    },
    roleFitReason: {
        fontSize: 11,
        lineHeight: 16,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    matchReason: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
        marginBottom: 12,
    },
    learningRow: {
        flexDirection: 'row',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
    },
    learningItem: {
        flex: 1,
        alignItems: 'center',
        gap: 2,
    },
    learningDivider: {
        width: 1,
        backgroundColor: '#9CA3AF',
        marginHorizontal: 12,
    },
    learningLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
    },
    learningValue: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'capitalize',
    },
    budgetEstimateBox: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
    },
    budgetEstimateHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 6,
    },
    budgetEstimateLabel: {
        fontSize: 11,
        lineHeight: 15,
        fontFamily: 'Poppins_700Bold',
        color: '#166534',
    },
    budgetEstimateValue: {
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#16A34A',
    },
    budgetGearText: {
        fontSize: 11,
        lineHeight: 16,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 4,
    },
    budgetNoteText: {
        fontSize: 10,
        lineHeight: 15,
        fontFamily: 'Poppins_400Regular',
    },
    proTipContainer: {
        padding: 12,
        borderRadius: 10,
        marginBottom: 12,
    },
    proTipLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#0C4A6E',
        marginBottom: 4,
    },
    proTipText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#0F172A',
        lineHeight: 18,
    },
    famousPlayersContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
    },
    famousPlayersLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
    },
    famousPlayersText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    nextMissionBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        marginBottom: 12,
    },
    nextMissionCopy: {
        flex: 1,
        minWidth: 0,
    },
    nextMissionLabel: {
        fontSize: 10,
        lineHeight: 13,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 2,
    },
    nextMissionText: {
        fontSize: 12,
        lineHeight: 17,
        fontFamily: 'Poppins_500Medium',
    },
    tagsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    tag: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    tagText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        textTransform: 'capitalize',
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#FCA5A5',
    },
    errorText: {
        flex: 1,
        color: '#DC2626',
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    followupLayer: {
        position: 'absolute',
        right: 14,
        left: 14,
        alignItems: 'flex-end',
        zIndex: 50,
    },
    followupLayerDesktop: {
        right: 26,
        left: undefined,
        bottom: 24,
    },
    followupPanel: {
        width: '100%',
        maxWidth: 430,
        borderWidth: 1.5,
        borderRadius: 16,
        padding: 12,
        marginBottom: 10,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 18,
        elevation: 8,
    },
    followupPanelInline: {
        alignSelf: 'stretch',
        maxWidth: '100%',
        marginTop: 2,
        marginBottom: 16,
        shadowOpacity: 0.08,
        elevation: 2,
    },
    followupPanelDesktop: {
        width: 460,
    },
    followupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    followupHeaderIcon: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    followupHeaderCopy: {
        flex: 1,
    },
    followupTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
    },
    followupSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    followupMessages: {
        maxHeight: 220,
    },
    followupMessagesContent: {
        gap: 8,
        paddingBottom: 8,
    },
    followupBubble: {
        maxWidth: '90%',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    followupBubbleText: {
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Poppins_400Regular',
    },
    followupTypingBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    followupTypingText: {
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Poppins_500Medium',
    },
    followupQuickScroll: {
        marginHorizontal: -12,
    },
    followupQuickRow: {
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    followupQuickChip: {
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    followupQuickChipText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
    },
    followupComposer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    followupInput: {
        flex: 1,
        maxHeight: 84,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Poppins_400Regular',
        paddingVertical: 0,
    },
    followupSendButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    followupFab: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 20,
        minHeight: 40,
        paddingHorizontal: 14,
        paddingVertical: 0,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
        elevation: 6,
    },
    followupFabText: {
        color: '#FFFFFF',
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Poppins_600SemiBold',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    followupInlineButton: {
        alignSelf: 'flex-start',
        shadowOpacity: 0,
        elevation: 0,
    },
});


