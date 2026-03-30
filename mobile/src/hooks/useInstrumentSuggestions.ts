import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
    CategoriesResponse,
    ExperienceLevel,
    GenresResponse,
    InstrumentInfo,
    InstrumentSuggestion,
    SuggestionPurpose,
} from '../types/instruments';

interface UseInstrumentSuggestionsOptions {
    onError?: (error: string) => void;
}

interface UseInstrumentSuggestionsReturn {
    // State
    suggestions: InstrumentSuggestion[];
    genres: string[];
    categories: { [category: string]: string[] };
    loading: boolean;
    error: string | null;
    
    // Actions
    getSuggestions: (params: SuggestionParams) => Promise<InstrumentSuggestion[]>;
    fetchGenres: () => Promise<string[]>;
    fetchCategories: () => Promise<{ [category: string]: string[] }>;
    getInstrumentInfo: (instrumentName: string) => Promise<InstrumentInfo | null>;
    clearError: () => void;
}

interface SuggestionParams {
    genres?: string[];
    currentInstruments?: string[];
    experienceLevel?: ExperienceLevel;
    purpose?: SuggestionPurpose;
    limit?: number;
}

/**
 * Hook for AI-powered instrument suggestions
 * Provides functions to get personalized instrument recommendations based on music preferences
 */
export function useInstrumentSuggestions(
    options: UseInstrumentSuggestionsOptions = {}
): UseInstrumentSuggestionsReturn {
    const { onError } = options;
    
    const [suggestions, setSuggestions] = useState<InstrumentSuggestion[]>([]);
    const [genres, setGenres] = useState<string[]>([]);
    const [categories, setCategories] = useState<{ [category: string]: string[] }>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleError = useCallback((errorMessage: string) => {
        setError(errorMessage);
        if (onError) {
            onError(errorMessage);
        }
    }, [onError]);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    /**
     * Get AI-powered instrument suggestions based on user preferences
     */
    const getSuggestions = useCallback(async (params: SuggestionParams): Promise<InstrumentSuggestion[]> => {
        setLoading(true);
        setError(null);
        
        try {
            const { data, error: funcError } = await supabase.functions.invoke('instrument-suggestions', {
                body: {
                    action: 'suggest',
                    genres: params.genres || [],
                    currentInstruments: params.currentInstruments || [],
                    experienceLevel: params.experienceLevel || 'beginner',
                    purpose: params.purpose || 'band',
                    limit: params.limit || 10,
                }
            });

            if (funcError) {
                throw new Error(funcError.message || 'Failed to get suggestions');
            }

            const suggestionList = data?.suggestions || [];
            setSuggestions(suggestionList);
            return suggestionList;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to fetch instrument suggestions';
            handleError(errorMessage);
            return [];
        } finally {
            setLoading(false);
        }
    }, [handleError]);

    /**
     * Fetch all available music genres
     */
    const fetchGenres = useCallback(async (): Promise<string[]> => {
        setLoading(true);
        setError(null);
        
        try {
            const { data, error: funcError } = await supabase.functions.invoke('instrument-suggestions', {
                body: { action: 'get-genres' }
            });

            if (funcError) {
                throw new Error(funcError.message || 'Failed to fetch genres');
            }

            const genreResponse = data as GenresResponse;
            const genreList = genreResponse?.genres || [];
            setGenres(genreList);
            return genreList;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to fetch genres';
            handleError(errorMessage);
            return [];
        } finally {
            setLoading(false);
        }
    }, [handleError]);

    /**
     * Fetch instruments organized by category
     */
    const fetchCategories = useCallback(async (): Promise<{ [category: string]: string[] }> => {
        setLoading(true);
        setError(null);
        
        try {
            const { data, error: funcError } = await supabase.functions.invoke('instrument-suggestions', {
                body: { action: 'get-categories' }
            });

            if (funcError) {
                throw new Error(funcError.message || 'Failed to fetch categories');
            }

            const categoryResponse = data as CategoriesResponse;
            const categoryMap = categoryResponse?.categories || {};
            setCategories(categoryMap);
            return categoryMap;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to fetch categories';
            handleError(errorMessage);
            return {};
        } finally {
            setLoading(false);
        }
    }, [handleError]);

    /**
     * Get detailed information about a specific instrument
     */
    const getInstrumentInfo = useCallback(async (instrumentName: string): Promise<InstrumentInfo | null> => {
        setLoading(true);
        setError(null);
        
        try {
            const { data, error: funcError } = await supabase.functions.invoke('instrument-suggestions', {
                body: { 
                    action: 'get-instrument-info',
                    instrumentName 
                }
            });

            if (funcError) {
                throw new Error(funcError.message || 'Failed to fetch instrument info');
            }

            if (data?.error) {
                throw new Error(data.error);
            }

            return data?.instrument || null;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to fetch instrument information';
            handleError(errorMessage);
            return null;
        } finally {
            setLoading(false);
        }
    }, [handleError]);

    return {
        // State
        suggestions,
        genres,
        categories,
        loading,
        error,
        
        // Actions
        getSuggestions,
        fetchGenres,
        fetchCategories,
        getInstrumentInfo,
        clearError,
    };
}

export default useInstrumentSuggestions;
