import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
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
import Navbar from '../src/components/navbar';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { generateOfflineSuggestionsWithLocalLLM } from '../src/services/offlineLlmEnhancer';
import {
    EXPERIENCE_OPTIONS,
    ExperienceLevel,
    InstrumentSuggestion,
    MUSIC_GENRES,
    PURPOSE_OPTIONS,
    SuggestionPurpose,
} from '../src/types/instruments';

const { width } = Dimensions.get('window');
const SCREEN_WIDTH = Platform.OS === 'web' ? Math.min(width, 1024) : width;
const OFFLINE_PROFILE_CACHE_KEY = 'offline_instrument_profile_v1';

interface CachedOfflineProfile {
    full_name: string;
    roles: string[];
    genres: string[];
}

export default function AiSuggestionsScreen() {
    const { colors, isDark } = useTheme();
    const { isGuest } = useAuth();
    const insets = useSafeAreaInsets();
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
    const [suggestions, setSuggestions] = useState<InstrumentSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'preferences' | 'results'>('preferences');
    const [currentInstruments, setCurrentInstruments] = useState<string[]>([]);
    const [isAIPowered, setIsAIPowered] = useState(false);
    const [aiProvider, setAIProvider] = useState<string>('');
    const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);

    // User profile data
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [userGenres, setUserGenres] = useState<string[]>([]);
    const [userName, setUserName] = useState<string>('');

    // Load user profile on mount
    useEffect(() => {
        loadUserProfile();
    }, [refreshKey]);

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

    // Fetch AI suggestions
    const fetchSuggestions = async () => {
        setLoading(true);
        setError(null);
        setSuggestionMessage(null);

        try {
            const generated = await generateOfflineSuggestionsWithLocalLLM({
                genres: selectedGenres,
                currentInstruments,
                userRoles,
                experienceLevel,
                purpose,
                limit: 10,
            });

            if (generated.suggestions.length > 0) {
                setSuggestions(generated.suggestions);
                setIsAIPowered(Boolean(generated.aiPowered));
                setAIProvider(generated.aiProvider || 'On-Device LLM');
                // Do not treat local fallback as an error. Only show an informational message
                // when the suggestions were produced by an AI model.
                setSuggestionMessage(generated.aiPowered ? generated.message : null);
                setStep('results');
            } else {
                setSuggestions([]);
                setIsAIPowered(false);
                setAIProvider(generated.aiProvider || 'On-Device LLM');
                setError(generated.message || 'Unable to generate LLM suggestions right now.');
            }
        } catch (err: any) {
            console.error('Error fetching suggestions:', err);
            setError('Failed to generate on-device LLM suggestions. Please try again.');
            setSuggestionMessage(null);
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
                            You're a <Text style={{ color: accentColor, fontFamily: 'Poppins_600SemiBold' }}>{userRoles.join(', ')}</Text>
                        </Text>
                        <Text style={[styles.profileHint, { color: textSecondary }]}>
                            On-device LLM generates instruments that complement your role
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
                                        <Ionicons
                                            name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                                            size={14}
                                            color={isSelected ? '#FFFFFF' : textSecondary}
                                        />
                                        <Text style={[
                                            styles.chipText,
                                            { color: isSelected ? '#FFFFFF' : textPrimary, marginLeft: 4 }
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
                        No genres found for "{genreSearch}"
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
                                <Ionicons name="star" size={10} color="#FFFFFF" style={{ marginRight: 4 }} />
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
                                "{suggestion.headline}"
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

                {/* Pro Tip */}
                {suggestion.proTip && (
                    <View style={[styles.proTipContainer, { backgroundColor: colors.primaryLight }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ionicons name="bulb" size={16} color={accentColor} />
                            <Text style={[styles.proTipLabel, { color: accentColor }]}>Pro Tip</Text>
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

            {/* Get Suggestions Button */}
            <TouchableOpacity activeOpacity={1}
                onPress={fetchSuggestions}
                disabled={loading || loadingProfile || selectedGenres.length === 0}
                style={[
                    styles.primaryButton,
                    {
                        backgroundColor: selectedGenres.length > 0 ? accentColor : borderSoft,
                        opacity: loading ? 0.7 : 1,
                    }
                ]}
            >
                {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                ) : (
                    <>
                        <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                        <Text style={styles.primaryButtonText}>
                            Get AI Suggestions
                        </Text>
                    </>
                )}
            </TouchableOpacity>

            {selectedGenres.length === 0 && (
                <Text style={[styles.helperText, { color: textSecondary, textAlign: 'center' }]}>
                    Select at least one genre to get suggestions
                </Text>
            )}
        </ScrollView>
    );

    // Render results step
    const renderResultsStep = () => {
        const badgeColor = accentColor;

        return (
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: 160 + insets.bottom },
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
                        {isAIPowered
                            ? `Powered by ${aiProvider || 'AI'} • Analyzed your profile`
                            : `Using ${aiProvider || 'On-Device LLM'} • Personalized from your profile`}
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

                {suggestionMessage && (
                    <View style={[styles.fallbackInfoContainer, { backgroundColor: colors.primaryLight, borderColor: accentColor }]}>
                        <Ionicons name="information-circle" size={16} color={accentColor} />
                        <Text style={[styles.fallbackInfoText, { color: textPrimary }]}>{suggestionMessage}</Text>
                    </View>
                )}

                {/* Suggestion Cards */}
                {suggestions.map((suggestion, index) => renderSuggestionCard(suggestion, index))}

                {/* Refresh Button */}
                <TouchableOpacity activeOpacity={1}
                    onPress={fetchSuggestions}
                    disabled={loading}
                    style={[styles.secondaryButton, { borderColor: badgeColor, backgroundColor: badgeColor + '10' }]}
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

    return (
        <View style={[styles.container, { backgroundColor: pageBackground }]}>
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

            <Navbar />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
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
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    chipText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
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
        width: (SCREEN_WIDTH - 48) / 2 - 4,
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
        padding: 16,
        borderRadius: 12,
        marginTop: 8,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    secondaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 14,
        borderRadius: 12,
        borderWidth: 2,
        marginTop: 16,
    },
    secondaryButtonText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
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
        alignItems: 'center',
        gap: 8,
        padding: 12,
        marginHorizontal: 16,
        marginTop: 8,
        borderRadius: 8,
    },
    errorText: {
        flex: 1,
        color: '#DC2626',
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
});
