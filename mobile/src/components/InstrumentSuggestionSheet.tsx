import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import {
    EXPERIENCE_OPTIONS,
    ExperienceLevel,
    InstrumentSuggestion,
    MUSIC_GENRES,
    PURPOSE_OPTIONS,
    SuggestionPurpose,
} from '../types/instruments';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface InstrumentSuggestionSheetProps {
    visible: boolean;
    onClose: () => void;
    onSelectInstrument?: (instrument: InstrumentSuggestion) => void;
    currentInstruments?: string[];
    initialGenres?: string[];
}

export default function InstrumentSuggestionSheet({
    visible,
    onClose,
    onSelectInstrument,
    currentInstruments = [],
    initialGenres = [],
}: InstrumentSuggestionSheetProps) {
    const { colors, isDark } = useTheme();
    
    // State
    const [selectedGenres, setSelectedGenres] = useState<string[]>(initialGenres);
    const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('beginner');
    const [purpose, setPurpose] = useState<SuggestionPurpose>('band');
    const [suggestions, setSuggestions] = useState<InstrumentSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'preferences' | 'results'>('preferences');
    const [isAIPowered, setIsAIPowered] = useState(false);
    const [aiProvider, setAIProvider] = useState('');

    // Track previous visible state to detect when modal opens
    const prevVisibleRef = useRef(visible);

    // Reset state when modal opens (not on every initialGenres change)
    useEffect(() => {
        const wasJustOpened = visible && !prevVisibleRef.current;
        prevVisibleRef.current = visible;
        
        if (wasJustOpened) {
            setSelectedGenres(initialGenres);
            setStep('preferences');
            setSuggestions([]);
            setError(null);
            setIsAIPowered(false);
            setAIProvider('');
        }
    }, [visible, initialGenres]);

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
        
        try {
            const { data, error: funcError } = await supabase.functions.invoke('instrument-suggestions', {
                body: {
                    action: 'suggest',
                    genres: selectedGenres,
                    currentInstruments,
                    experienceLevel,
                    purpose,
                    limit: 10,
                }
            });

            if (funcError) throw funcError;
            
            if (data?.suggestions) {
                setSuggestions(data.suggestions);
                setIsAIPowered(Boolean(data.aiPowered));
                setAIProvider(data.aiProvider || '');
                setStep('results');
            } else {
                setError(data?.message || 'No suggestions found. Try different preferences.');
            }
        } catch (err: any) {
            console.error('Error fetching suggestions:', err);
            const errorMessage = err.message?.toLowerCase() || '';
            if (errorMessage.includes('non-2xx') || errorMessage.includes('edge function') || errorMessage.includes('fetch')) {
                setError('Unable to get suggestions right now. Please try again later.');
            } else {
                setError(err.message || 'Failed to get suggestions');
            }
        } finally {
            setLoading(false);
        }
    };

    // Handle instrument selection
    const handleSelectInstrument = (instrument: InstrumentSuggestion) => {
        if (onSelectInstrument) {
            onSelectInstrument(instrument);
        }
        onClose();
    };

    // Render genre chips
    const renderGenreChips = () => (
        <View style={styles.genreContainer}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                🎵 What genres do you play?
            </Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                Select one or more genres
            </Text>
            <View style={styles.chipGrid}>
                {MUSIC_GENRES.map(genre => {
                    const isSelected = selectedGenres.includes(genre);
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
                📈 Your experience level?
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
                🎯 What&apos;s your purpose?
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

    // Render suggestion card
    const renderSuggestionCard = (suggestion: InstrumentSuggestion, index: number) => {
        const matchPercentage = Math.max(0, Math.min(100, Math.round(suggestion.score)));
        
        return (
            <TouchableOpacity activeOpacity={1}
                key={suggestion.name}
                onPress={() => handleSelectInstrument(suggestion)}
                style={[styles.suggestionCard, { 
                    backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                    borderColor: colors.border,
                }]}
            >
                {/* Rank Badge */}
                <View style={[styles.rankBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                </View>
                
                {/* Instrument Image */}
                <Image 
                    source={{ uri: suggestion.image }} 
                    style={styles.instrumentImage}
                    resizeMode="cover"
                />
                
                {/* Info */}
                <View style={styles.suggestionInfo}>
                    <Text style={[styles.instrumentName, { color: colors.text }]}>
                        {suggestion.name}
                    </Text>
                    
                    <View style={styles.matchContainer}>
                        <View style={[styles.matchBar, { backgroundColor: colors.border }]}>
                            <View 
                                style={[
                                    styles.matchProgress, 
                                    { 
                                        width: `${matchPercentage}%`,
                                        backgroundColor: colors.primary 
                                    }
                                ]} 
                            />
                        </View>
                        <Text style={[styles.matchText, { color: colors.primary }]}>
                            {matchPercentage}% match
                        </Text>
                    </View>
                    
                    <Text style={[styles.matchReason, { color: colors.textSecondary }]} numberOfLines={2}>
                        💡 {suggestion.matchReason}
                    </Text>
                    
                    {/* Category & Difficulty */}
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
                
                {/* Select Arrow */}
                <Ionicons 
                    name="chevron-forward" 
                    size={20} 
                    color={colors.textSecondary} 
                />
            </TouchableOpacity>
        );
    };

    // Render preferences step
    const renderPreferencesStep = () => (
        <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
        >
            {renderGenreChips()}
            {renderExperienceSelector()}
            {renderPurposeSelector()}
            
            {/* Current Instruments */}
            {currentInstruments.length > 0 && (
                <View style={styles.currentInstrumentsContainer}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        🎸 Your current instruments
                    </Text>
                    <View style={styles.chipGrid}>
                        {currentInstruments.map(inst => (
                            <View 
                                key={inst} 
                                style={[styles.chip, { 
                                    backgroundColor: isDark ? '#374151' : '#E5E7EB',
                                    borderColor: colors.border,
                                }]}
                            >
                                <Text style={[styles.chipText, { color: colors.textSecondary }]}>
                                    {inst}
                                </Text>
                            </View>
                        ))}
                    </View>
                    <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                        We&apos;ll suggest instruments that complement these
                    </Text>
                </View>
            )}
            
            {/* Get Suggestions Button */}
            <TouchableOpacity activeOpacity={1}
                onPress={fetchSuggestions}
                disabled={loading || selectedGenres.length === 0}
                style={[
                    styles.primaryButton,
                    { 
                        backgroundColor: selectedGenres.length > 0 ? colors.primary : colors.border,
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
                <Text style={[styles.helperText, { color: colors.textSecondary, textAlign: 'center' }]}>
                    Select at least one genre to get suggestions
                </Text>
            )}
        </ScrollView>
    );

    // Render results step
    const renderResultsStep = () => (
        <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
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
            
            {/* Selected Preferences Summary */}
            <View style={[styles.summaryContainer, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
                    🎵 {selectedGenres.slice(0, 3).join(', ')}{selectedGenres.length > 3 ? ` +${selectedGenres.length - 3}` : ''}
                    {' • '}📈 {experienceLevel}
                    {' • '}🎯 {purpose}
                </Text>
            </View>
            
            {/* Results Header */}
            <Text style={[styles.resultsHeader, { color: colors.text }]}>
                ✨ Top Instrument Suggestions
            </Text>
            <Text style={[styles.resultsSubtitle, { color: colors.textSecondary }]}>
                {isAIPowered
                    ? `Powered by ${aiProvider || 'AI'} based on your music preferences`
                    : `Using ${aiProvider || 'local matching'} based on your music preferences`}
            </Text>
            
            {/* Suggestion Cards */}
            {suggestions.map((suggestion, index) => renderSuggestionCard(suggestion, index))}
            
            {/* Refresh Button */}
            <TouchableOpacity activeOpacity={1}
                onPress={fetchSuggestions}
                disabled={loading}
                style={[styles.secondaryButton, { borderColor: colors.primary }]}
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} />
                ) : (
                    <>
                        <Ionicons name={isAIPowered ? "sparkles" : "refresh"} size={18} color={colors.primary} />
                        <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                            {isAIPowered ? 'Get New AI Suggestions' : 'Refresh Smart Suggestions'}
                        </Text>
                    </>
                )}
            </TouchableOpacity>
        </ScrollView>
    );

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.container, { backgroundColor: colors.background }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <View style={styles.headerContent}>
                            <Ionicons name="sparkles" size={24} color={colors.primary} />
                            <View>
                                <Text style={[styles.headerTitle, { color: colors.text }]}>
                                    AI Instrument Suggestions
                                </Text>
                                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                                    Find your perfect instrument
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                    </View>
                    
                    {/* Error Message */}
                    {error && (
                        <View style={[styles.errorContainer, { backgroundColor: '#FEE2E2' }]}>
                            <Ionicons name="warning" size={20} color="#DC2626" />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}
                    
                    {/* Content */}
                    {step === 'preferences' ? renderPreferencesStep() : renderResultsStep()}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
        minHeight: '70%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
    },
    headerSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    closeButton: {
        padding: 8,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
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
    chipGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
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
    purposeLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
    currentInstrumentsContainer: {
        marginBottom: 24,
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
    suggestionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 12,
        position: 'relative',
    },
    rankBadge: {
        position: 'absolute',
        top: -6,
        left: -6,
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    rankText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
    },
    instrumentImage: {
        width: 64,
        height: 64,
        borderRadius: 12,
        marginRight: 12,
    },
    suggestionInfo: {
        flex: 1,
    },
    instrumentName: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 4,
    },
    matchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    matchBar: {
        flex: 1,
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
    },
    matchProgress: {
        height: '100%',
        borderRadius: 2,
    },
    matchText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    matchReason: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 6,
    },
    tagsRow: {
        flexDirection: 'row',
        gap: 6,
    },
    tag: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tagText: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 12,
        includeFontPadding: false,
        textAlignVertical: 'center',
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
