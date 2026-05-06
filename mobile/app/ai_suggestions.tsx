import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    InteractionManager,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import GuestSignInGate from '../src/components/GuestSignInGate';
import Header from '../src/components/header';
import { normalizeVisibleInput } from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useBottomBarClearance } from '../src/hooks/useBottomBarClearance';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
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
    SuggestionPurpose,
} from '../src/types/instruments';

const OFFLINE_PROFILE_CACHE_KEY = 'offline_instrument_profile_v1';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAX_CHAT_PANEL_HEIGHT_RATIO = 0.78;
const MAX_CHAT_MESSAGE_HEIGHT_RATIO = 0.42;

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
    const { contentBottomPadding } = useBottomBarClearance(24);
    const params = useLocalSearchParams<{ refresh?: string }>();
    const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;

    // State
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    const [genreSearch, setGenreSearch] = useState('');
    const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('beginner');
    const [purpose, setPurpose] = useState<SuggestionPurpose>('band');
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
    const suggestionRequestIdRef = React.useRef(0);
    const resultsScrollRef = React.useRef<ScrollView | null>(null);
    const followupSectionYRef = React.useRef(0);
    const followupMessagesScrollRef = React.useRef<ScrollView | null>(null);
    const groqInfo = getGroqModelInfo();
    const groqModelLabel = groqInfo.modelLabel;
    const groqConfigured = groqInfo.configured;
    const isSuggestionFormReady = selectedGenres.length > 0 && Boolean(experienceLevel) && Boolean(purpose);
    const isSuggestionSubmitDisabled = loading || !isSuggestionFormReady;

    // User profile data
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [userGenres, setUserGenres] = useState<string[]>([]);
    const [userName, setUserName] = useState<string>('');

    const isGroqQuotaExhausted = (message: string | null | undefined) => {
        if (!message) return false;
        return /out of api calls|rate limit|too many requests|insufficient[_ -]?quota|quota|credits|\b429\b/i.test(message);
    };

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

    const scrollToFollowupChat = useCallback(() => {
        setTimeout(() => {
            resultsScrollRef.current?.scrollTo({
                y: Math.max(0, followupSectionYRef.current - 12),
                animated: true,
            });
        }, 100);
    }, []);

    useEffect(() => {
        if (step === 'results' && suggestions.length > 0) {
            setIsFollowupChatOpen(true);
            ensureFollowupWelcome();
        }
    }, [ensureFollowupWelcome, step, suggestions.length]);

    const sendFollowupQuestion = useCallback(
        async (presetQuestion?: string) => {
            const question = normalizeVisibleInput(presetQuestion ?? followupQuestion);

            if (!question || followupLoading || suggestions.length === 0) {
                return;
            }

            setIsFollowupChatOpen(true);
            ensureFollowupWelcome();
            scrollToFollowupChat();

            const conversation = [
                ...followupMessages
                    .map((message) => ({
                        role: message.role,
                        text: message.text,
                    }))
                    .slice(-8),
                {
                    role: 'user' as const,
                    text: question,
                },
            ];

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
                    conversation,
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
            followupMessages,
            followupQuestion,
            purpose,
            scrollToFollowupChat,
            selectedGenres,
            suggestions,
            userRoles,
        ],
    );

    // Load user profile on mount
    useEffect(() => {
        let cancelled = false;

        const loadCachedProfile = async () => {
            try {
                const cachedRaw = await AsyncStorage.getItem(OFFLINE_PROFILE_CACHE_KEY);
                if (cancelled || !cachedRaw) {
                    return false;
                }

                const cached = JSON.parse(cachedRaw) as CachedOfflineProfile;
                applyProfileSignals(cached);
                setLoadingProfile(false);
                return true;
            } catch {
                return false;
            }
        };

        void loadCachedProfile();

        const task = InteractionManager.runAfterInteractions(() => {
            if (!cancelled) {
                void loadUserProfile();
            }
        });

        return () => {
            cancelled = true;
            task.cancel();
        };
        // loadUserProfile is intentionally scheduled after interactions; refreshKey is the trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    useEffect(() => {
        if (step !== 'results') {
            setIsFollowupChatOpen(false);
            setFollowupQuestion('');
            setFollowupLoading(false);
            return;
        }

    }, [
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

                // Skills = roles/instruments (e.g., "Guitarist", "Drummer")
                const skills = (skillsResult.data || [])
                    .map((row: any) => row.skill)
                    .filter((value: any) => typeof value === 'string' && value.trim().length > 0);
                setUserRoles(skills);
                setCurrentInstruments(skills); // Pre-fill current instruments from profile

                // Genres from profile
                const genres = (genresResult.data || [])
                    .map((row: any) => row.genre)
                    .filter((value: any) => typeof value === 'string' && value.trim().length > 0);
                setUserGenres(genres);
                setSelectedGenres(genres); // Pre-select user's preferred genres

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

        const requestId = `ai-suggest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const activeRequestId = suggestionRequestIdRef.current + 1;
        suggestionRequestIdRef.current = activeRequestId;
        const startedAt = Date.now();


        setLoading(true);
        setError(null);
        setSuggestionMessage(null);

        const requestInput = {
            genres: selectedGenres,
            currentInstruments,
            userRoles,
            experienceLevel,
            purpose,
            limit: 10,
        };

        const localSuggestions = getOfflineInstrumentSuggestions(requestInput);
        if (localSuggestions.length > 0) {
            setSuggestions(localSuggestions);
            setIsAIPowered(false);
            setAIProvider('Local Ranker');
            setSuggestionMessage(groqConfigured ? 'Showing smart local suggestions while AI refreshes.' : null);
            setStep('results');
        }

        try {
            const generated = await generateInstrumentSuggestionsWithGroq(requestInput);
            if (suggestionRequestIdRef.current !== activeRequestId) {
                return;
            }

            if (!generated.aiPowered && isGroqQuotaExhausted(generated.message || '')) {
                setIsAIPowered(false);
                setAIProvider(generated.aiProvider || groqModelLabel);
                setSuggestionMessage(
                    localSuggestions.length > 0
                        ? 'AI free-tier limit is exhausted. Showing smart local suggestions.'
                        : null,
                );
                if (localSuggestions.length === 0) {
                    setSuggestions([]);
                    setStep('preferences');
                    setError('AI free-tier limit is exhausted. Suggestions are temporarily unavailable.');
                }
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
                return;
            }

            if (localSuggestions.length > 0) {
                setSuggestions(localSuggestions);
                setIsAIPowered(false);
                setAIProvider('Local Ranker');
                setSuggestionMessage(generated.message || null);
                setStep('results');
            } else {
                setSuggestions([]);
                setIsAIPowered(false);
                setAIProvider(generated.aiProvider || groqModelLabel);
                setError('Unable to generate suggestions right now. Please try again.');
            }
        } catch (err: any) {
            console.error('[AI_SUGGESTIONS_FLOW] Request failed', {
                requestId,
                elapsedMs: Date.now() - startedAt,
                error: {
                    name: err?.name,
                    message: err?.message,
                },
            });

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

            if (suggestionRequestIdRef.current !== activeRequestId) {
                return;
            }

            if (localSuggestions.length > 0) {
                setSuggestions(localSuggestions);
                setIsAIPowered(false);
                setAIProvider('Local Ranker');
                setSuggestionMessage('We could not refresh right now. Showing local suggestions.');
                setStep('results');
            } else {
                setError('Failed to generate suggestions right now. Please try again.');
                setSuggestionMessage(null);
            }
        } finally {
            if (suggestionRequestIdRef.current === activeRequestId) {
                setLoading(false);
            }
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
                <View style={[styles.profileCard, { backgroundColor: isDark ? '#1F2937' : '#F0F9FF', borderColor: '#8B5CF6' }]}>
                    <ActivityIndicator color="#8B5CF6" />
                    <Text style={[styles.profileLoadingText, { color: colors.textSecondary }]}>Loading your profile...</Text>
                </View>
            );
        }

        return (
            <View style={[styles.profileCard, { backgroundColor: isDark ? '#1F2937' : '#F0F9FF', borderColor: '#8B5CF6' }]}>
                <View style={styles.profileHeader}>
                    <Ionicons name="person-circle" size={24} color="#8B5CF6" />
                    <Text style={[styles.profileTitle, { color: colors.text }]}>
                        {userName ? `Welcome, ${userName.split(' ')[0]}` : 'Your Musical Identity'}
                    </Text>
                </View>

                {userRoles.length > 0 ? (
                    <>
                        <Text style={[styles.profileSubtitle, { color: colors.textSecondary }]}>
                            You&apos;re a <Text style={{ color: '#8B5CF6', fontFamily: 'Poppins_600SemiBold' }}>{userRoles.join(', ')}</Text>
                        </Text>
                        <Text style={[styles.profileHint, { color: colors.textSecondary }]}>
                            These suggestions complement your role
                        </Text>
                    </>
                ) : (
                    <Text style={[styles.profileSubtitle, { color: colors.textSecondary }]}>
                        Add roles in your profile to get personalized suggestions!
                    </Text>
                )}

                {/* Current Instruments/Skills selector */}
                {userRoles.length > 0 && (
                    <View style={styles.currentInstrumentsSection}>
                        <Text style={[styles.currentInstrumentsLabel, { color: colors.text }]}>
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
                                                backgroundColor: isSelected ? '#8B5CF6' : (isDark ? '#374151' : '#E5E7EB'),
                                                borderColor: isSelected ? '#8B5CF6' : colors.border,
                                            }
                                        ]}
                                    >
                                        <View style={styles.chipIconSlot}>
                                            <Ionicons
                                                name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                                                size={14}
                                                color={isSelected ? '#FFFFFF' : colors.textSecondary}
                                            />
                                        </View>
                                        <Text style={[
                                            styles.chipText,
                                            { color: isSelected ? '#FFFFFF' : colors.text }
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
        <View style={styles.genreContainer}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                What genres do you play?
            </Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                {userGenres.length > 0 ? 'Pre-selected from your profile. Tap to adjust.' : 'Select one or more genres'}
            </Text>
            
            {/* Genre Search Input */}
            <View style={[
                styles.genreSearchContainer,
                {
                    backgroundColor: isDark ? '#374151' : '#F3F4F6',
                }
            ]}>
                <Ionicons name="search" size={20} color={colors.textSecondary} />
                <TextInput
                    style={[styles.genreSearchInput, { color: colors.text }]}
                    placeholder="Search genres..."
                    placeholderTextColor={colors.textSecondary}
                    value={genreSearch}
                    onChangeText={setGenreSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                {genreSearch.length > 0 && (
                    <TouchableOpacity activeOpacity={1} onPress={() => setGenreSearch('')}>
                        <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Selected genres count */}
            {selectedGenres.length > 0 && (
                <Text style={[styles.selectedCount, { color: colors.primary }]}>
                    {selectedGenres.length} genre{selectedGenres.length !== 1 ? 's' : ''} selected
                </Text>
            )}

            <View style={styles.chipGrid}>
                {filteredGenres.length === 0 ? (
                    <Text style={[styles.noResultsText, { color: colors.textSecondary }]}>
                        No genres found for &quot;{genreSearch}&quot;
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
                                    backgroundColor: isSelected ? colors.primary : (isDark ? '#374151' : '#F3F4F6'),
                                    borderColor: isSelected ? colors.primary : colors.border,
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
                                { color: isSelected ? '#FFFFFF' : colors.text }
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
        <View style={styles.selectorContainer}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Experience Level
            </Text>
            <View style={styles.optionsRow}>
                {EXPERIENCE_OPTIONS.map(option => {
                    const isSelected = experienceLevel === option.value;
                    return (
                        <TouchableOpacity activeOpacity={1}
                            key={option.value}
                            onPress={() => setExperienceLevel(option.value)}
                            style={[
                                styles.optionCard,
                                {
                                    backgroundColor: isSelected ? colors.primary + '20' : (isDark ? '#1F2937' : '#FFFFFF'),
                                    borderColor: isSelected ? colors.primary : colors.border,
                                }
                            ]}
                        >
                            <Text style={[
                                styles.optionLabel,
                                { color: isSelected ? colors.primary : colors.text }
                            ]}>
                                {option.label}
                            </Text>
                            <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
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
        <View style={styles.selectorContainer}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
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
                                {
                                    backgroundColor: isSelected ? colors.primary + '20' : (isDark ? '#1F2937' : '#FFFFFF'),
                                    borderColor: isSelected ? colors.primary : colors.border,
                                }
                            ]}
                        >
                            <Ionicons
                                name={option.icon as any}
                                size={24}
                                color={isSelected ? colors.primary : colors.textSecondary}
                            />
                            <Text style={[
                                styles.purposeLabel,
                                { color: isSelected ? colors.primary : colors.text }
                            ]}>
                                {option.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );

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
                    backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                    borderColor: colors.border,
                }]}
            >
                {/* Rank Badge */}
                <View style={[styles.rankBadge, { backgroundColor: '#8B5CF6' }]}>
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
                            <Text style={[styles.instrumentName, { color: colors.text }]}>
                                {suggestion.name}
                            </Text>
                            <Ionicons name="sparkles" size={14} color="#8B5CF6" />
                        </View>

                        {/* AI Headline */}
                        {suggestion.headline && (
                            <Text style={[styles.headline, { color: '#8B5CF6' }]}>
                                &quot;{suggestion.headline}&quot;
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
                                            backgroundColor: matchPercentage >= 90 ? '#22C55E' : matchPercentage >= 75 ? '#8B5CF6' : '#F59E0B'
                                        }
                                    ]}
                                />
                            </View>
                            <Text style={[styles.matchText, { color: matchPercentage >= 90 ? '#22C55E' : '#8B5CF6' }]}>
                                {matchPercentage}%
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Perfect For Tag */}
                {suggestion.perfectFor && (
                    <View style={[styles.perfectForBadge, { backgroundColor: '#8B5CF6' + '20' }]}>
                        <Ionicons name="star" size={12} color="#8B5CF6" />
                        <Text style={[styles.perfectForText, { color: '#8B5CF6' }]}>
                            {suggestion.perfectFor}
                        </Text>
                    </View>
                )}

                {/* AI Explanation */}
                <Text style={[styles.matchReason, { color: colors.text }]}>
                    {suggestion.matchReason}
                </Text>

                {/* Learning Info Row */}
                <View style={[styles.learningRow, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}>
                    <View style={styles.learningItem}>
                        <Ionicons
                            name={learningCurveIcons[suggestion.learningCurve as keyof typeof learningCurveIcons] as any || 'trending-up'}
                            size={16}
                            color={learningCurveColors[suggestion.learningCurve as keyof typeof learningCurveColors] || '#F59E0B'}
                        />
                        <Text style={[styles.learningLabel, { color: colors.textSecondary }]}>Learning</Text>
                        <Text style={[styles.learningValue, { color: learningCurveColors[suggestion.learningCurve as keyof typeof learningCurveColors] || '#F59E0B' }]}>
                            {suggestion.learningCurve || 'moderate'}
                        </Text>
                    </View>
                    <View style={styles.learningDivider} />
                    <View style={styles.learningItem}>
                        <Ionicons name="time-outline" size={16} color={colors.primary} />
                        <Text style={[styles.learningLabel, { color: colors.textSecondary }]}>To basics</Text>
                        <Text style={[styles.learningValue, { color: colors.primary }]}>
                            {suggestion.timeToBasics || '1-2 months'}
                        </Text>
                    </View>
                </View>

                {/* Pro Tip */}
                {suggestion.proTip && (
                    <View style={[styles.proTipContainer, { backgroundColor: '#FEF3C7' }]}>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ionicons name="bulb" size={16} color="#D97706" />
                            <Text style={styles.proTipLabel}>Pro Tip</Text>
                        </View>
                        <Text style={styles.proTipText}>{suggestion.proTip}</Text>
                    </View>
                )}

                {/* Famous Players */}
                {suggestion.famousPlayers && suggestion.famousPlayers.length > 0 && (
                    <View style={styles.famousPlayersContainer}>
                        <Text style={[styles.famousPlayersLabel, { color: colors.textSecondary }]}>
                            Inspired by:
                        </Text>
                        <Text style={[styles.famousPlayersText, { color: colors.text }]}>
                            {suggestion.famousPlayers.join(', ')}
                        </Text>
                    </View>
                )}

                {/* Tags */}
                <View style={styles.tagsRow}>
                    <View style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
                        <Text style={[styles.tagText, { color: colors.primary }]}>
                            {suggestion.category}
                        </Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}>
                        <Text style={[styles.tagText, { color: colors.textSecondary }]}>
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
            contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
            showsVerticalScrollIndicator={false}
        >
            {/* Profile Section - Shows user's current role */}
            {renderProfileSection()}

            {renderGenreChips()}
            {renderExperienceSelector()}
            {renderPurposeSelector()}

            {/* Get Suggestions Button */}
            <TouchableOpacity activeOpacity={1}
                onPress={fetchSuggestions}
                disabled={isSuggestionSubmitDisabled}
                style={[
                    styles.primaryButton,
                    {
                        backgroundColor: isSuggestionFormReady ? colors.primary : colors.border,
                        opacity: isSuggestionSubmitDisabled ? 0.6 : 1,
                    }
                ]}
            >
                {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                ) : (
                    <>
                        <Ionicons name="sparkles" size={20} color={isSuggestionFormReady ? "#FFFFFF" : colors.textSecondary} />
                        <Text style={[styles.primaryButtonText, { color: isSuggestionFormReady ? "#FFFFFF" : colors.textSecondary }]}>
                            Get AI Suggestions
                        </Text>
                    </>
                )}
            </TouchableOpacity>

            {!isSuggestionFormReady && (
                <Text style={[styles.helperText, { color: colors.textSecondary, textAlign: 'center' }]}>
                    Select at least one genre to get suggestions
                </Text>
            )}
        </ScrollView>
    );

    // Render results step
    const renderResultsStep = () => {
        const badgeColor = isAIPowered ? '#8B5CF6' : '#2563EB';
        const providerLabel = cleanProviderCopy(aiProvider || (isAIPowered ? groqModelLabel : 'Local Ranker')) || 'Groq AI';
        const visibleSuggestionMessage = cleanProviderCopy(suggestionMessage);

        return (
            <ScrollView
                ref={resultsScrollRef}
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: contentBottomPadding + 96 },
                ]}
                showsVerticalScrollIndicator={false}
            >
            {/* Back Button */}
            <TouchableOpacity activeOpacity={1}
                onPress={() => setStep('preferences')}
                style={styles.backButton}
            >
                <Ionicons name="arrow-back" size={20} color={colors.primary} />
                <Text style={[styles.backButtonText, { color: colors.primary }]}>
                    Change Preferences
                </Text>
            </TouchableOpacity>

            {/* AI Header Card */}
            <View style={[styles.aiHeaderCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: '#8B5CF6' }]}>
                <View style={styles.aiHeaderIcon}>
                    <Ionicons name="sparkles" size={32} color="#8B5CF6" />
                </View>
                <Text style={[styles.aiHeaderTitle, { color: colors.text }]}>
                    {userRoles.length > 0
                        ? `Perfect for a ${userRoles[0]}`
                        : 'Your Personalized Picks'}
                </Text>
                <Text style={[styles.aiHeaderSubtitle, { color: colors.textSecondary }]}>
                    Personalized from your profile and preferences
                </Text>

                <View style={[styles.aiStatusPill, { backgroundColor: badgeColor + '14', borderColor: badgeColor + '44' }]}>
                    <Ionicons name={isAIPowered ? 'sparkles' : 'compass-outline'} size={13} color={badgeColor} />
                    <Text style={[styles.aiStatusText, { color: badgeColor }]} numberOfLines={1}>
                        {loading ? 'AI is refreshing' : providerLabel}
                    </Text>
                </View>

                {/* User Role Badge */}
                {userRoles.length > 0 && (
                    <View style={[styles.roleBadge, { backgroundColor: '#8B5CF6' }]}>
                        <Ionicons name="person" size={12} color="#FFFFFF" />
                        <Text style={styles.roleBadgeText}>{userRoles.join(' • ')}</Text>
                    </View>
                )}

                {/* Preferences Tags */}
                <View style={styles.preferenceTags}>
                    {selectedGenres.slice(0, 3).map(genre => (
                        <View key={genre} style={[styles.preferenceTag, { backgroundColor: '#8B5CF6' + '20' }]}>
                            <Text style={[styles.preferenceTagText, { color: '#8B5CF6' }]}>{genre}</Text>
                        </View>
                    ))}
                    {selectedGenres.length > 3 && (
                        <View style={[styles.preferenceTag, { backgroundColor: '#8B5CF6' + '20' }]}>
                            <Text style={[styles.preferenceTagText, { color: '#8B5CF6' }]}>+{selectedGenres.length - 3} more</Text>
                        </View>
                    )}
                </View>
                <View style={styles.preferenceTags}>
                    <View style={[styles.preferenceTag, { backgroundColor: colors.primary + '20' }]}>
                        <Text style={[styles.preferenceTagText, { color: colors.primary }]}>{experienceLevel}</Text>
                    </View>
                    <View style={[styles.preferenceTag, { backgroundColor: colors.primary + '20' }]}>
                        <Text style={[styles.preferenceTagText, { color: colors.primary }]}>{purpose}</Text>
                    </View>
                </View>
            </View>

            {/* Results Count */}
            <View style={styles.resultsCountRow}>
                <Text style={[styles.resultsHeader, { color: colors.text }]}>
                    {suggestions.length} Perfect Matches
                </Text>
                <View style={[styles.aiBadgeMini, { backgroundColor: badgeColor }]}>
                    <Ionicons name={isAIPowered ? 'sparkles' : 'compass'} size={10} color="#FFFFFF" />
                    <Text style={styles.aiBadgeMiniText}>{isAIPowered ? 'AI' : 'SMART'}</Text>
                </View>
            </View>
            <Text style={[styles.resultsSubtitle, { color: colors.textSecondary }]}>
                {userRoles.length > 0
                    ? `Instruments that complement your role as a ${userRoles[0]}`
                    : 'Curated just for you based on your musical profile'}
            </Text>
            <Text style={[styles.resultsSubtitle, { color: colors.textSecondary, marginTop: -10 }]}>
                {loading ? 'AI refresh in progress' : providerLabel}
            </Text>

            {visibleSuggestionMessage && (
                <View
                    style={[
                        styles.fallbackInfoContainer,
                        {
                            backgroundColor: badgeColor + '12',
                            borderColor: badgeColor + '44',
                        },
                    ]}
                >
                    <Ionicons name={loading ? 'time-outline' : 'information-circle-outline'} size={16} color={badgeColor} />
                    <Text style={[styles.fallbackInfoText, { color: badgeColor }]}>{visibleSuggestionMessage}</Text>
                </View>
            )}

            {renderFollowupChatSection()}

            {/* Suggestion Cards */}
            {suggestions.map((suggestion, index) => renderSuggestionCard(suggestion, index))}

            {/* Refresh Button */}
            <TouchableOpacity activeOpacity={1}
                onPress={fetchSuggestions}
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

        const accentColor = isAIPowered ? '#8B5CF6' : colors.primary;
        const normalizedQuestion = normalizeVisibleInput(followupQuestion);
        const panelMaxHeight = Math.round(SCREEN_HEIGHT * MAX_CHAT_PANEL_HEIGHT_RATIO);
        const messagesMaxHeight = Math.max(160, Math.round(SCREEN_HEIGHT * MAX_CHAT_MESSAGE_HEIGHT_RATIO));

        return (
            <View
                onLayout={(event) => {
                    followupSectionYRef.current = event.nativeEvent.layout.y;
                }}
                style={[
                    styles.followupPanel,
                    styles.followupPanelInline,
                    {
                        backgroundColor: isDark ? '#111827' : '#FFFFFF',
                        borderColor: accentColor,
                        maxHeight: panelMaxHeight,
                    },
                ]}
            >
                <View style={styles.followupHeader}>
                    <View style={[styles.followupHeaderIcon, { backgroundColor: accentColor + '22' }]}>
                        <Ionicons name="chatbubble-ellipses" size={16} color={accentColor} />
                    </View>
                    <View style={styles.followupHeaderCopy}>
                        <Text style={[styles.followupTitle, { color: colors.text }]}>Instrument AI Chat</Text>
                        <Text style={[styles.followupSubtitle, { color: colors.textSecondary }]}>Only your suggested instruments</Text>
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
                        <Ionicons name={isFollowupChatOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
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
                                    ? accentColor
                                    : message.blocked
                                        ? (isDark ? '#3F1D1D' : '#FEE2E2')
                                        : (isDark ? '#1F2937' : '#F3F4F6');
                                const bubbleTextColor = isUser
                                    ? '#FFFFFF'
                                    : message.blocked
                                        ? '#B91C1C'
                                        : colors.text;

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
                                <View style={[styles.followupBubble, styles.followupTypingBubble, { alignSelf: 'flex-start', backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                                    <ActivityIndicator size="small" color={accentColor} />
                                    <Text style={[styles.followupTypingText, { color: colors.textSecondary }]}>Typing...</Text>
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
                                            borderColor: accentColor + '66',
                                            backgroundColor: accentColor + '12',
                                            opacity: followupLoading ? 0.6 : 1,
                                        },
                                    ]}
                                >
                                    <Text style={[styles.followupQuickChipText, { color: accentColor }]}>
                                        Ask about {suggestion.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <View
                            style={[
                                styles.followupComposer,
                                {
                                    borderColor: isDark ? '#374151' : '#E5E7EB',
                                    backgroundColor: isDark ? '#0F172A' : '#F9FAFB',
                                },
                            ]}
                        >
                            <TextInput
                                value={followupQuestion}
                                onChangeText={setFollowupQuestion}
                                style={[styles.followupInput, { color: colors.text }]}
                                placeholder="Ask about fit, budget, setup, or practice"
                                placeholderTextColor={colors.textSecondary}
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
                                                ? colors.border
                                                : accentColor,
                                        opacity: followupLoading || !normalizedQuestion ? 0.6 : 1,
                                    },
                                ]}
                            >
                                <Ionicons name="send" size={16} color={normalizedQuestion ? "#FFFFFF" : colors.textSecondary} />
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
                        style={[styles.followupFab, styles.followupInlineButton, { backgroundColor: accentColor }]}
                    >
                        <Ionicons name="chatbubble-ellipses" size={16} color="#FFFFFF" />
                        <Text style={styles.followupFabText}>Ask AI Chat</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <KeyboardAvoidingView
                style={styles.keyboardFrame}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
            >
            <Header title="AI Suggestions" />

            {isGuest ? (
                <GuestSignInGate message="Sign in to use AI instrument suggestions." />
            ) : (
                <>

                    {/* Error Message */}
                    {error && (
                        <View style={[styles.errorContainer, { backgroundColor: '#FEE2E2' }]}>
                            <Ionicons name="warning" size={20} color="#DC2626" />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* Content */}
                    {step === 'preferences' ? renderPreferencesStep() : renderResultsStep()}
                </>
            )}

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
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
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
        paddingHorizontal: 16,
        height: 48,
        borderRadius: 16,
        marginBottom: 12,
        gap: 10,
    },
    genreSearchInput: {
        flex: 1,
        height: 24,
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 20,
        includeFontPadding: false,
        padding: 0,
        margin: 0,
        textAlignVertical: 'center',
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
    purposeLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
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
        backgroundColor: '#8B5CF6' + '20',
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
    aiStatusPill: {
        minHeight: 30,
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 12,
        borderRadius: 15,
        borderWidth: 1,
        marginBottom: 12,
    },
    aiStatusText: {
        flexShrink: 1,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Poppins_600SemiBold',
        includeFontPadding: false,
        textAlignVertical: 'center',
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
        flexWrap: 'wrap',
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
        flexShrink: 1,
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
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 14,
    },
    fallbackInfoText: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#1D4ED8',
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
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    headerInfo: {
        flex: 1,
        minWidth: 0,
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
        shadowColor: '#8B5CF6',
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
        flexShrink: 1,
        fontSize: 16,
        lineHeight: 20,
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
        flexShrink: 1,
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
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
    proTipContainer: {
        padding: 12,
        borderRadius: 10,
        marginBottom: 12,
    },
    proTipLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#92400E',
        marginBottom: 4,
    },
    proTipText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#78350F',
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
    tagsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    tag: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tagText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 13,
        includeFontPadding: false,
        textAlignVertical: 'center',
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
        pointerEvents: 'box-none',
    },
    followupPanel: {
        width: '100%',
        maxWidth: 420,
        borderWidth: 1.5,
        borderRadius: 20,
        padding: 14,
        marginBottom: 10,
        shadowColor: '#111827',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
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
        maxHeight: 240,
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
        marginHorizontal: -14,
    },
    followupQuickRow: {
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
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
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 16,
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
        width: 36,
        height: 36,
        borderRadius: 18,
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
        shadowColor: '#111827',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
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


