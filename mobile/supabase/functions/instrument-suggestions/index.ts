// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore

// Deno environment (Edge Function runtime)
declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

// Free AI API configurations (in priority order)
// 1. Groq - Completely FREE, very fast (Llama/Mixtral models)
// 2. Google Gemini - FREE tier (15 RPM)
// 3. OpenAI - Paid (fallback if others not available)
const ENV_GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')?.trim() || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')?.trim() || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')?.trim() || '';
const LOCAL_ONLY_MODE = true;

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const GROQ_MODEL_CANDIDATES = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
];
const GROQ_RETRYABLE_STATUS_CODES = new Set([403, 404, 408, 409, 429, 498, 500, 502, 503, 504]);

interface AIProviderStatus {
    groqConfigured: boolean;
    geminiConfigured: boolean;
    openaiConfigured: boolean;
    anyConfigured: boolean;
}

function resolveGroqApiKey(): string {
    return ENV_GROQ_API_KEY;
}

function getAIProviderStatus(groqApiKey: string): AIProviderStatus {
    const groqConfigured = Boolean(groqApiKey && groqApiKey.trim().length > 0);
    const geminiConfigured = Boolean(GEMINI_API_KEY && GEMINI_API_KEY.trim().length > 0);
    const openaiConfigured = Boolean(OPENAI_API_KEY && OPENAI_API_KEY.trim().length > 0);

    return {
        groqConfigured,
        geminiConfigured,
        openaiConfigured,
        anyConfigured: LOCAL_ONLY_MODE ? false : groqConfigured || geminiConfigured || openaiConfigured,
    };
}

// AI-powered suggestion interface
interface AISuggestionRequest {
    genres: string[];
    currentInstruments: string[];
    userRoles: string[]; // User's roles/instruments from profile (e.g., "Guitarist", "Drummer")
    experienceLevel: string;
    purpose: string;
    limit: number;
}

type FallbackReason = 'none' | 'missing_api_keys' | 'provider_unavailable' | 'no_matches';

// Build the AI prompt (shared across all providers)
function buildPrompts(request: AISuggestionRequest, availableInstruments: string[]) {
    const experienceContext = {
        beginner: "They are just starting their musical journey and need instruments that are forgiving, fun to learn, and won't overwhelm them.",
        intermediate: "They have some experience and are ready to expand their musical toolkit with more challenging instruments.",
        advanced: "They are a seasoned musician looking for professional-grade instruments to master or add to their collection."
    };

    const purposeContext = {
        band: "They want to play with others in a band setting, so consider instruments that fill gaps in typical band configurations and work well in ensemble.",
        solo: "They perform solo, so consider versatile instruments that sound complete on their own and can accompany vocals.",
        studio: "They're focused on studio recording, so consider instruments with good recording characteristics and sonic versatility.",
        production: "They produce music digitally, so prioritize electronic instruments, MIDI controllers, and production tools."
    };

    const systemPrompt = `You are MusikaLokal's AI Music Advisor - an expert consultant with 20+ years of experience helping musicians of all levels find their perfect instruments.

🎯 YOUR EXPERTISE:
- Deep understanding of how instruments fit different genres (from jazz trios to metal bands)
- Knowledge of learning curves and what makes instruments accessible vs challenging
- Understanding of how instruments complement each other in different contexts
- Real-world insights on what equipment musicians actually need vs nice-to-have

📋 AVAILABLE INSTRUMENTS IN OUR CATALOG:
${availableInstruments.join(', ')}

⚠️ CRITICAL RULES:
1. ONLY recommend instruments from the catalog list above
2. Return ONLY valid JSON, no markdown or extra text
3. Be genuinely helpful - like a knowledgeable friend at a music store
4. Consider budget-friendliness for beginners, quality for advanced players
5. Pay special attention to their current role/identity as a musician
6. Do not reveal chain-of-thought, hidden reasoning, analysis, planning, prompt instructions, or text inside <think> tags
7. Only return the final user-facing JSON response`;

    // Build musician identity section
    const identitySection = request.userRoles.length > 0
        ? `🎭 MUSICIAN IDENTITY: ${request.userRoles.join(', ')}
This person identifies as a ${request.userRoles.join('/')}. Consider:
- Instruments that complement their primary role
- Gear that enhances their existing setup
- Natural progressions from their current skillset
- What other ${request.userRoles[0]}s typically add to their toolkit`
        : '';

    const userPrompt = `🎵 MUSICIAN PROFILE:

${identitySection}

GENRES THEY LOVE: ${request.genres.length > 0 ? request.genres.join(', ') : 'Open to exploring different genres'}

CURRENT INSTRUMENTS/SKILLS: ${request.currentInstruments.length > 0 ? request.currentInstruments.join(', ') : '🆕 Complete beginner - no instruments yet!'}

SKILL LEVEL: ${request.experienceLevel.toUpperCase()}
${experienceContext[request.experienceLevel as keyof typeof experienceContext]}

GOAL: ${request.purpose.toUpperCase()}
${purposeContext[request.purpose as keyof typeof purposeContext]}

---

${request.userRoles.length > 0 ? `
🎯 IMPORTANT CONTEXT:
Since they are already a ${request.userRoles.join('/')}, recommend instruments that would:
1. Complement their existing role in a band/studio
2. Help them expand their musical capabilities
3. Be a natural fit based on skills they likely already have
4. NOT duplicate what they already play (unless upgrading)

` : ''}
Please provide ${request.limit} personalized instrument recommendations. For each instrument, give me:

1. **name** - Exact instrument name from the catalog
2. **matchScore** - 0-100 based on how well it fits their profile
3. **headline** - A catchy one-liner (e.g., "Your gateway to rock stardom" or "The heartbeat of any band")
4. **whyThisFits** - 2-3 sentences explaining why this is perfect for THEM specifically
5. **learningCurve** - "easy" | "moderate" | "challenging" - PERSONALIZED based on the user's ${request.experienceLevel.toUpperCase()} level. What's "challenging" for a beginner might be "easy" for an advanced player. Consider their existing skills: ${request.currentInstruments.length > 0 ? request.currentInstruments.join(', ') : 'none yet'}.
6. **timeToBasics** - PERSONALIZED time estimate for THIS USER at their ${request.experienceLevel} level to learn basic songs. Be specific and realistic:
   - For beginners: estimate as if they have no prior music experience
   - For intermediate: consider transferable skills, typically 30-50% faster
   - For advanced: they likely pick up new instruments quickly, 50-70% faster
   Format: "X-Y weeks" or "X-Y months" - make each instrument's estimate UNIQUE and SPECIFIC
7. **proTip** - One actionable tip for getting started, personalized to their ${request.experienceLevel} level
8. **famousPlayers** - 1-2 famous musicians known for this instrument in their preferred genres
9. **perfectFor** - Short tag like "rhythm section", "lead melodies", "groove master"

IMPORTANT: The learningCurve and timeToBasics MUST be personalized. Do NOT use generic values. Each instrument should have a DIFFERENT and SPECIFIC estimate based on:
- The instrument's inherent difficulty
- The user's ${request.experienceLevel} experience level
- Their current skills (${request.currentInstruments.length > 0 ? request.currentInstruments.join(', ') : 'none'}) which may have transferable techniques

Return as JSON:
{"recommendations":[{"name":"...","matchScore":92,"headline":"...","whyThisFits":"...","learningCurve":"easy","timeToBasics":"2-4 weeks","proTip":"...","famousPlayers":["Name 1","Name 2"],"perfectFor":"..."}]}`;

    return { systemPrompt, userPrompt };
}

// Helper to calculate dynamic learning estimates
function calculateLearningEstimates(instrumentInfo: any, experienceLevel: string) {
    const baseDifficulty = instrumentInfo.difficulty || 'intermediate';

    // Difficulty matrix
    const difficulties = {
        beginner: 1,
        intermediate: 2,
        advanced: 3
    };

    const userLevel = difficulties[experienceLevel as keyof typeof difficulties] || 1;
    const instrumentLevel = difficulties[baseDifficulty as keyof typeof difficulties] || 2;

    // Calculate relative difficulty
    let relativeDifficulty = 'moderate';
    if (userLevel > instrumentLevel) relativeDifficulty = 'easy';
    else if (userLevel < instrumentLevel) relativeDifficulty = 'challenging';
    else relativeDifficulty = 'moderate';

    // Calculate time estimate based on levels
    let timeEstimate = '2-3 months';

    if (relativeDifficulty === 'easy') {
        timeEstimate = '2-4 weeks';
    } else if (relativeDifficulty === 'challenging') {
        timeEstimate = '4-6 months';
    } else {
        timeEstimate = '2-3 months';
    }

    // Adjust for specific instrument types if needed
    if (baseDifficulty === 'advanced' && experienceLevel === 'beginner') {
        timeEstimate = '6-12 months'; // Specific override for hard instruments for beginners
    }

    return { relativeDifficulty, timeEstimate };
}

function cleanAiText(text: unknown, maxLength = 260) {
    if (typeof text !== 'string') return '';

    const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*/gi, '')
        .replace(/<\/think>/gi, '')
        .split('\n')
        .filter((line) => !/^\s*(system|developer|assistant|user|analysis|planning|plan|prompt|instruction|hidden reasoning|chain[- ]of[- ]thought)\s*[:\-]/i.test(line))
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();

    return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
}

// Parse AI response and map to suggestions
function parseAIResponse(content: string, aiProvider: string, request: AISuggestionRequest): InstrumentSuggestion[] {
    try {
        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        } else if (content.includes('{')) {
            jsonStr = content.substring(content.indexOf('{'));
            const lastBrace = jsonStr.lastIndexOf('}');
            if (lastBrace !== -1) {
                jsonStr = jsonStr.substring(0, lastBrace + 1);
            }
        }

        const parsed = JSON.parse(jsonStr);
        const recommendations = parsed.recommendations || [];

        return recommendations
            .filter((rec: any) => INSTRUMENT_DATABASE[rec.name as keyof typeof INSTRUMENT_DATABASE])
            .map((rec: any) => {
                const instrumentInfo = INSTRUMENT_DATABASE[rec.name as keyof typeof INSTRUMENT_DATABASE];

                // Calculate dynamic fallbacks
                const { relativeDifficulty, timeEstimate } = calculateLearningEstimates(instrumentInfo, request.experienceLevel);

                // Use AI value if present and looks valid (not empty), otherwise use calculated fallback
                const learningCurve = (rec.learningCurve && rec.learningCurve.length > 2) ? rec.learningCurve : relativeDifficulty;
                const timeToBasics = (rec.timeToBasics && rec.timeToBasics.length > 2) ? rec.timeToBasics : timeEstimate;
                const parsedScore = Number(rec.matchScore ?? rec.score ?? 85);
                const safeScore = Number.isFinite(parsedScore)
                    ? Math.max(0, Math.min(100, Math.round(parsedScore)))
                    : 85;

                return {
                    name: rec.name,
                    image: instrumentInfo.image,
                    score: safeScore,
                    headline: cleanAiText(rec.headline, 80),
                    matchReason: cleanAiText(rec.whyThisFits || rec.matchReason, 220),
                    learningCurve,
                    timeToBasics,
                    proTip: cleanAiText(rec.proTip || rec.tips, 140),
                    famousPlayers: Array.isArray(rec.famousPlayers)
                        ? rec.famousPlayers.map((name: unknown) => cleanAiText(name, 60)).filter(Boolean)
                        : [],
                    perfectFor: cleanAiText(rec.perfectFor, 32),
                    genres: instrumentInfo.genres,
                    difficulty: instrumentInfo.difficulty,
                    category: instrumentInfo.category,
                    description: instrumentInfo.description,
                    relatedInstruments: instrumentInfo.relatedInstruments,
                    aiPowered: true,
                    aiProvider
                };
            });
    } catch (error) {
        console.error('Failed to parse AI response:', error);
        return [];
    }
}

// 1. GROQ API - FREE (Uses Llama 3.1 70B)
async function getGroqSuggestions(request: AISuggestionRequest, groqApiKey: string): Promise<InstrumentSuggestion[] | null> {
    if (!groqApiKey) return null;

    const availableInstruments = Object.keys(INSTRUMENT_DATABASE);
    const { systemPrompt, userPrompt } = buildPrompts(request, availableInstruments);
    for (const model of GROQ_MODEL_CANDIDATES) {
        for (const useJsonMode of [true, false]) {
            try {
                const payload: Record<string, unknown> = {
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.7,
                    max_completion_tokens: 1400,
                };

                if (useJsonMode) {
                    payload.response_format = { type: 'json_object' };
                }

                const response = await fetch(GROQ_API_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${groqApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Groq API error (${model}, jsonMode=${useJsonMode}):`, response.status, errorText);
                    if (!GROQ_RETRYABLE_STATUS_CODES.has(response.status)) {
                        return null;
                    }
                    continue;
                }

                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;
                if (!content) {
                    continue;
                }

                const suggestions = parseAIResponse(content, model, request);
                if (suggestions.length > 0) {
                    return suggestions;
                }
            } catch (error) {
                console.error(`Error calling Groq (${model}, jsonMode=${useJsonMode}):`, error);
            }
        }
    }

    return null;
}

// 2. Google Gemini API - FREE tier (15 requests/minute)
async function getGeminiSuggestions(request: AISuggestionRequest): Promise<InstrumentSuggestion[] | null> {
    if (!GEMINI_API_KEY) return null;

    const availableInstruments = Object.keys(INSTRUMENT_DATABASE);
    const { systemPrompt, userPrompt } = buildPrompts(request, availableInstruments);

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${systemPrompt}\n\n${userPrompt}`
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2000,
                    responseMimeType: 'application/json'
                }
            }),
        });

        if (!response.ok) {
            console.error('Gemini API error:', response.status);
            return null;
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) return null;

        const suggestions = parseAIResponse(content, 'Google Gemini', request);
        return suggestions.length > 0 ? suggestions : null;
    } catch (error) {
        console.error('Error calling Gemini:', error);
        return null;
    }
}

// 3. OpenAI API - Paid (fallback)
async function getOpenAISuggestions(request: AISuggestionRequest): Promise<InstrumentSuggestion[] | null> {
    if (!OPENAI_API_KEY) return null;

    const availableInstruments = Object.keys(INSTRUMENT_DATABASE);
    const { systemPrompt, userPrompt } = buildPrompts(request, availableInstruments);

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 2000,
                response_format: { type: 'json_object' }
            }),
        });

        if (!response.ok) {
            console.error('OpenAI API error:', response.status);
            return null;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return null;

        const suggestions = parseAIResponse(content, 'OpenAI GPT-4', request);
        return suggestions.length > 0 ? suggestions : null;
    } catch (error) {
        console.error('Error calling OpenAI:', error);
        return null;
    }
}

// Master AI function - tries free options first
async function getAISuggestions(request: AISuggestionRequest, groqApiKey: string): Promise<{ suggestions: InstrumentSuggestion[] | null; provider: string }> {
    // 1. Try Groq first (FREE, fast)
    let suggestions = await getGroqSuggestions(request, groqApiKey);
    if (suggestions && suggestions.length > 0) {
        return { suggestions, provider: suggestions[0]?.aiProvider || 'Groq' };
    }

    // 2. Try Gemini (FREE tier)
    suggestions = await getGeminiSuggestions(request);
    if (suggestions && suggestions.length > 0) {
        return { suggestions, provider: 'Google Gemini' };
    }

    // 3. Try OpenAI (paid fallback)
    suggestions = await getOpenAISuggestions(request);
    if (suggestions && suggestions.length > 0) {
        return { suggestions, provider: 'OpenAI GPT-4' };
    }

    return { suggestions: null, provider: 'none' };
}

// Comprehensive instrument database with music genre associations
const INSTRUMENT_DATABASE = {
    // String Instruments
    'Acoustic Guitar': {
        image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=200&h=200&fit=crop',
        genres: ['Folk', 'Country', 'Acoustic', 'Indie', 'Pop', 'Singer-Songwriter', 'Bluegrass'],
        difficulty: 'beginner',
        category: 'strings',
        description: 'Perfect for accompanying vocals and creating warm, organic sounds.',
        relatedInstruments: ['Electric Guitar', 'Bass Guitar', 'Ukulele']
    },
    'Electric Guitar': {
        image: 'https://images.unsplash.com/photo-1550985616-10810253b84d?w=200&h=200&fit=crop',
        genres: ['Rock', 'Metal', 'Blues', 'Punk', 'Alternative', 'Indie', 'Jazz', 'Funk'],
        difficulty: 'beginner',
        category: 'strings',
        description: 'Versatile instrument for rock riffs, blues solos, and everything in between.',
        relatedInstruments: ['Bass Guitar', 'Acoustic Guitar', 'Guitar Amp']
    },
    'Bass Guitar': {
        image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=200&h=200&fit=crop',
        genres: ['Rock', 'Jazz', 'Funk', 'R&B', 'Metal', 'Pop', 'Reggae', 'Hip-Hop'],
        difficulty: 'beginner',
        category: 'strings',
        description: 'The backbone of any band, providing rhythm and groove.',
        relatedInstruments: ['Electric Guitar', 'Bass Amp', 'Drum Kit']
    },
    'Violin': {
        image: 'https://images.unsplash.com/photo-1612225330812-01a9c6b355ec?w=200&h=200&fit=crop',
        genres: ['Classical', 'Folk', 'Indie', 'Orchestral', 'World Music', 'Cinematic'],
        difficulty: 'advanced',
        category: 'strings',
        description: 'Expressive string instrument for classical and contemporary music.',
        relatedInstruments: ['Viola', 'Cello', 'Piano']
    },
    'Cello': {
        image: 'https://images.unsplash.com/photo-1594897030264-ab7d87efc473?w=200&h=200&fit=crop',
        genres: ['Classical', 'Orchestral', 'Cinematic', 'Indie', 'Ambient'],
        difficulty: 'advanced',
        category: 'strings',
        description: 'Deep, resonant tones perfect for orchestral and ambient music.',
        relatedInstruments: ['Violin', 'Viola', 'Double Bass']
    },
    'Ukulele': {
        image: 'https://images.unsplash.com/photo-1556449895-a33c9dba33dd?w=200&h=200&fit=crop',
        genres: ['Folk', 'Hawaiian', 'Pop', 'Indie', 'Acoustic'],
        difficulty: 'beginner',
        category: 'strings',
        description: 'Fun, portable instrument perfect for beginners and casual playing.',
        relatedInstruments: ['Acoustic Guitar', 'Mandolin']
    },

    // Keyboard Instruments
    'Piano': {
        image: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=200&h=200&fit=crop',
        genres: ['Classical', 'Jazz', 'Pop', 'R&B', 'Soul', 'Ballad', 'All Genres'],
        difficulty: 'intermediate',
        category: 'keyboards',
        description: 'The foundation of music theory, suitable for all genres.',
        relatedInstruments: ['Keyboard', 'Synthesizer', 'Electric Piano']
    },
    'Keyboard': {
        image: 'https://images.unsplash.com/photo-1552422535-c45813c61732?w=200&h=200&fit=crop',
        genres: ['Pop', 'Rock', 'Electronic', 'Worship', 'Jazz', 'All Genres'],
        difficulty: 'beginner',
        category: 'keyboards',
        description: 'Versatile electronic keyboard for various musical styles.',
        relatedInstruments: ['Piano', 'Synthesizer', 'MIDI Controller']
    },
    'Synthesizer': {
        image: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=200&h=200&fit=crop',
        genres: ['Electronic', 'Synthpop', 'Ambient', 'EDM', 'Industrial', 'Experimental'],
        difficulty: 'intermediate',
        category: 'keyboards',
        description: 'Create unique sounds and textures for electronic music.',
        relatedInstruments: ['Keyboard', 'MIDI Controller', 'DJ Equipment']
    },
    'Organ': {
        image: 'https://images.unsplash.com/photo-1619983081563-430f63602796?w=200&h=200&fit=crop',
        genres: ['Gospel', 'Soul', 'Blues', 'Jazz', 'Rock', 'Worship'],
        difficulty: 'intermediate',
        category: 'keyboards',
        description: 'Rich, warm tones perfect for gospel, soul, and blues.',
        relatedInstruments: ['Piano', 'Keyboard']
    },

    // Percussion Instruments
    'Drum Kit': {
        image: 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=200&h=200&fit=crop',
        genres: ['Rock', 'Pop', 'Jazz', 'Metal', 'Punk', 'Funk', 'All Genres'],
        difficulty: 'intermediate',
        category: 'percussion',
        description: 'Essential rhythm section for bands of all genres.',
        relatedInstruments: ['Electronic Drums', 'Cajon', 'Percussion']
    },
    'Electronic Drums': {
        image: 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=200&h=200&fit=crop',
        genres: ['Electronic', 'EDM', 'Pop', 'Hip-Hop', 'R&B'],
        difficulty: 'intermediate',
        category: 'percussion',
        description: 'Compact electronic drums with versatile sound options.',
        relatedInstruments: ['Drum Kit', 'Drum Machine', 'MIDI Controller']
    },
    'Cajon': {
        image: 'https://images.unsplash.com/photo-1524230659092-07f99a75c013?w=200&h=200&fit=crop',
        genres: ['Acoustic', 'Folk', 'Flamenco', 'World Music', 'Unplugged'],
        difficulty: 'beginner',
        category: 'percussion',
        description: 'Portable box drum great for acoustic performances.',
        relatedInstruments: ['Drum Kit', 'Bongos', 'Congas']
    },
    'Congas': {
        image: 'https://images.unsplash.com/photo-1527261834078-9b37d35a4a32?w=200&h=200&fit=crop',
        genres: ['Latin', 'Salsa', 'Jazz', 'World Music', 'Afrobeat'],
        difficulty: 'intermediate',
        category: 'percussion',
        description: 'Essential Latin percussion for salsa and world music.',
        relatedInstruments: ['Bongos', 'Timbales', 'Cajon']
    },

    // Wind Instruments
    'Saxophone': {
        image: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=200&h=200&fit=crop',
        genres: ['Jazz', 'Blues', 'Soul', 'R&B', 'Funk', 'Ska'],
        difficulty: 'intermediate',
        category: 'wind',
        description: 'Expressive wind instrument central to jazz and soul music.',
        relatedInstruments: ['Clarinet', 'Trumpet', 'Flute']
    },
    'Trumpet': {
        image: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=200&h=200&fit=crop',
        genres: ['Jazz', 'Classical', 'Mariachi', 'Ska', 'Brass Band', 'Latin'],
        difficulty: 'intermediate',
        category: 'wind',
        description: 'Bright, powerful brass instrument for jazz and beyond.',
        relatedInstruments: ['Trombone', 'Saxophone', 'French Horn']
    },
    'Flute': {
        image: 'https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=200&h=200&fit=crop',
        genres: ['Classical', 'Folk', 'World Music', 'New Age', 'Orchestral'],
        difficulty: 'intermediate',
        category: 'wind',
        description: 'Ethereal woodwind instrument for classical and folk music.',
        relatedInstruments: ['Piccolo', 'Clarinet', 'Recorder']
    },
    'Harmonica': {
        image: 'https://images.unsplash.com/photo-1516462919870-2c0e8e0a4c3c?w=200&h=200&fit=crop',
        genres: ['Blues', 'Folk', 'Country', 'Rock', 'Americana'],
        difficulty: 'beginner',
        category: 'wind',
        description: 'Portable blues instrument with soulful expression.',
        relatedInstruments: ['Acoustic Guitar', 'Saxophone']
    },

    // Electronic/DJ Equipment
    'DJ Equipment': {
        image: 'https://images.unsplash.com/photo-1571327073757-71d13c24de30?w=200&h=200&fit=crop',
        genres: ['Electronic', 'EDM', 'Hip-Hop', 'House', 'Techno', 'Trance'],
        difficulty: 'intermediate',
        category: 'electronic',
        description: 'Turntables and controllers for DJing and live mixing.',
        relatedInstruments: ['Synthesizer', 'Drum Machine', 'MIDI Controller']
    },
    'MIDI Controller': {
        image: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=200&h=200&fit=crop',
        genres: ['Electronic', 'EDM', 'Hip-Hop', 'Pop', 'Experimental'],
        difficulty: 'beginner',
        category: 'electronic',
        description: 'Control software instruments and create beats.',
        relatedInstruments: ['Synthesizer', 'DJ Equipment', 'Drum Machine']
    },
    'Drum Machine': {
        image: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=200&h=200&fit=crop',
        genres: ['Electronic', 'Hip-Hop', 'House', 'Techno', 'R&B'],
        difficulty: 'beginner',
        category: 'electronic',
        description: 'Create electronic beats and rhythms.',
        relatedInstruments: ['MIDI Controller', 'Synthesizer', 'DJ Equipment']
    },

    // Vocals & Microphones
    'Microphones': {
        image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=200&h=200&fit=crop',
        genres: ['All Genres', 'Vocals', 'Podcasting', 'Recording'],
        difficulty: 'beginner',
        category: 'vocals',
        description: 'Essential for recording vocals and instruments.',
        relatedInstruments: ['PA System', 'Mixing Console']
    },

    // Amplifiers & PA
    'Guitar Amp': {
        image: 'https://images.unsplash.com/photo-1535587566541-97121a128dc5?w=200&h=200&fit=crop',
        genres: ['Rock', 'Blues', 'Metal', 'Punk', 'Alternative'],
        difficulty: 'beginner',
        category: 'amplification',
        description: 'Amplify electric guitar with various tones.',
        relatedInstruments: ['Electric Guitar', 'Bass Amp', 'Pedals']
    },
    'Bass Amp': {
        image: 'https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=200&h=200&fit=crop',
        genres: ['Rock', 'Jazz', 'Funk', 'Metal', 'Reggae'],
        difficulty: 'beginner',
        category: 'amplification',
        description: 'Amplify bass guitar with deep, punchy tones.',
        relatedInstruments: ['Bass Guitar', 'Guitar Amp']
    },
    'PA System': {
        image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop',
        genres: ['All Genres', 'Live Performance'],
        difficulty: 'intermediate',
        category: 'amplification',
        description: 'Professional audio system for live performances.',
        relatedInstruments: ['Microphones', 'Mixing Console']
    },
    'Mixing Console': {
        image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=200&h=200&fit=crop',
        genres: ['All Genres', 'Recording', 'Live Sound'],
        difficulty: 'advanced',
        category: 'recording',
        description: 'Mix multiple audio sources for recording or live sound.',
        relatedInstruments: ['Microphones', 'PA System']
    }
};



interface SuggestionRequest {
    action: 'suggest' | 'get-genres' | 'get-categories' | 'get-instrument-info' | 'ai-status';
    genres?: string[];
    currentInstruments?: string[];
    userRoles?: string[]; // User's roles/instruments from profile
    experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
    purpose?: 'band' | 'solo' | 'studio' | 'production';
    limit?: number;
}

interface InstrumentSuggestion {
    name: string;
    image: string;
    score: number;
    matchReason: string;
    genres: string[];
    difficulty: string;
    category: string;
    description: string;
    relatedInstruments: string[];
    aiPowered?: boolean; // Flag to indicate AI-generated suggestion
    aiProvider?: string; // Which AI provider was used
}

interface SuggestionResponse {
    suggestions: InstrumentSuggestion[];
    aiPowered: boolean;
    aiProvider: string;
    fallbackReason: FallbackReason;
    providerStatus: AIProviderStatus;
}

// Local fallback - genre-based matching when AI is unavailable
function getLocalFallbackSuggestions(request: SuggestionRequest): InstrumentSuggestion[] {
    const { genres = [], currentInstruments = [], experienceLevel = 'beginner', purpose = 'band', limit = 10 } = request;
    
    const scored: { name: string; score: number; matchedGenres: string[] }[] = [];
    
    // Score each instrument based on genre matches
    Object.entries(INSTRUMENT_DATABASE).forEach(([name, data]) => {
        // Skip instruments user already has
        if (currentInstruments.some(ci => ci.toLowerCase().includes(name.toLowerCase()))) {
            return;
        }
        
        // Calculate genre match score
        const matchedGenres = genres.filter(g => 
            data.genres.some(ig => ig.toLowerCase() === g.toLowerCase())
        );
        
        let score = matchedGenres.length * 20; // Base score from genre matches
        
        // Bonus for matching difficulty level
        if (data.difficulty === experienceLevel) score += 15;
        if (experienceLevel === 'advanced') score += 5; // Advanced players can use anything
        
        // Bonus based on purpose
        if (purpose === 'band') {
            if (['strings', 'percussion', 'wind'].includes(data.category)) score += 10;
        } else if (purpose === 'solo') {
            if (['keyboards', 'strings'].includes(data.category)) score += 10;
        } else if (purpose === 'production') {
            if (['electronic', 'keyboards'].includes(data.category)) score += 15;
        } else if (purpose === 'studio') {
            if (['recording', 'vocals', 'keyboards'].includes(data.category)) score += 10;
        }
        
        // Only include instruments with some match
        if (score > 0 || genres.length === 0) {
            scored.push({ 
                name, 
                score: Math.min(95, Math.max(50, score + 50)), // Normalize to 50-95 range
                matchedGenres 
            });
        }
    });
    
    // Sort by score and take top results
    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, limit);
    
    // Map to suggestion format
    return topResults.map(item => {
        const instrumentInfo = INSTRUMENT_DATABASE[item.name as keyof typeof INSTRUMENT_DATABASE];
        const { relativeDifficulty, timeEstimate } = calculateLearningEstimates(instrumentInfo, experienceLevel);
        
        // Generate a simple match reason
        const reasonParts: string[] = [];
        if (item.matchedGenres.length > 0) {
            reasonParts.push(`Great for ${item.matchedGenres.slice(0, 2).join(' and ')} music`);
        }
        if (instrumentInfo.difficulty === experienceLevel) {
            reasonParts.push(`perfect difficulty for ${experienceLevel} players`);
        }
        reasonParts.push(instrumentInfo.description);
        
        return {
            name: item.name,
            image: instrumentInfo.image,
            score: item.score,
            headline: `Recommended for ${genres.length > 0 ? genres[0] : 'you'}`,
            matchReason: reasonParts.join('. '),
            learningCurve: relativeDifficulty,
            timeToBasics: timeEstimate,
            proTip: `Start with ${instrumentInfo.difficulty === 'beginner' ? 'basic tutorials' : 'structured lessons'} to build a solid foundation.`,
            famousPlayers: [],
            perfectFor: purpose === 'band' ? 'band setup' : purpose,
            genres: instrumentInfo.genres,
            difficulty: instrumentInfo.difficulty,
            category: instrumentInfo.category,
            description: instrumentInfo.description,
            relatedInstruments: instrumentInfo.relatedInstruments,
            aiPowered: false,
            aiProvider: 'Local'
        };
    });
}

// Main suggestion function - AI-powered with local fallback
async function getSuggestionsWithAI(request: SuggestionRequest, groqApiKey: string): Promise<SuggestionResponse> {
    const { genres = [], currentInstruments = [], userRoles = [], experienceLevel = 'beginner', purpose = 'band', limit = 10 } = request;
    const providerStatus = getAIProviderStatus(groqApiKey);

    if (!providerStatus.anyConfigured) {
        const localSuggestions = getLocalFallbackSuggestions(request);
        if (localSuggestions.length > 0) {
            return {
                suggestions: localSuggestions,
                aiPowered: false,
                aiProvider: 'Local (Genre Match)',
                fallbackReason: 'missing_api_keys',
                providerStatus,
            };
        }

        return {
            suggestions: [],
            aiPowered: false,
            aiProvider: 'none',
            fallbackReason: 'missing_api_keys',
            providerStatus,
        };
    }

    // Get AI-powered suggestions (FREE options prioritized)
    const { suggestions: aiSuggestions, provider } = await getAISuggestions({
        genres,
        currentInstruments,
        userRoles,
        experienceLevel,
        purpose,
        limit
    }, groqApiKey);

    if (aiSuggestions && aiSuggestions.length > 0) {
        return {
            suggestions: aiSuggestions,
            aiPowered: true,
            aiProvider: provider,
            fallbackReason: 'none',
            providerStatus,
        };
    }

    // Fallback to local genre-based matching
    const localSuggestions = getLocalFallbackSuggestions(request);
    if (localSuggestions.length > 0) {
        return {
            suggestions: localSuggestions,
            aiPowered: false,
            aiProvider: 'Local (Genre Match)',
            fallbackReason: 'provider_unavailable',
            providerStatus,
        };
    }

    // No suggestions available
    return {
        suggestions: [],
        aiPowered: false,
        aiProvider: 'none',
        fallbackReason: 'no_matches',
        providerStatus,
    };
}

// Get all available genres from the database
function getAvailableGenres(): string[] {
    const genres = new Set<string>();
    Object.values(INSTRUMENT_DATABASE).forEach(instrument => {
        instrument.genres.forEach(genre => genres.add(genre));
    });
    return Array.from(genres).sort();
}

// Get all instruments by category
function getInstrumentsByCategory(): { [category: string]: string[] } {
    const categories: { [category: string]: string[] } = {};
    Object.entries(INSTRUMENT_DATABASE).forEach(([name, data]) => {
        if (!categories[data.category]) {
            categories[data.category] = [];
        }
        categories[data.category].push(name);
    });
    return categories;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json();
        const { action } = body;
        const groqApiKey = resolveGroqApiKey();

        let result: any;

        switch (action) {
            case 'suggest':
                const { suggestions, aiPowered, aiProvider, fallbackReason, providerStatus } = await getSuggestionsWithAI(body, groqApiKey);
                let message = '';

                if (aiPowered) {
                    message = `AI-powered recommendations via ${aiProvider}`;
                } else if (LOCAL_ONLY_MODE) {
                    message = 'Local-only mode is active. Showing smart local recommendations.';
                } else if (fallbackReason === 'missing_api_keys') {
                    message = 'AI providers are not configured yet. Showing smart local recommendations.';
                } else if (fallbackReason === 'provider_unavailable') {
                    message = 'AI provider is temporarily unavailable. Showing smart local recommendations.';
                } else {
                    message = 'No suggestions found. Try adjusting your genres or purpose.';
                }

                result = {
                    suggestions,
                    aiPowered,
                    aiProvider,
                    fallbackReason,
                    providerStatus,
                    message,
                };
                break;

            case 'ai-status':
                const status = getAIProviderStatus(groqApiKey);
                result = {
                    aiProvidersConfigured: status.anyConfigured,
                    providerStatus: status,
                    message: LOCAL_ONLY_MODE
                        ? 'Local-only mode is active. External AI providers are disabled.'
                        : status.anyConfigured
                            ? 'At least one AI provider is configured.'
                            : 'No AI provider keys configured. Set GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY.'
                };
                break;

            case 'get-genres':
                result = {
                    genres: getAvailableGenres(),
                    message: 'Available music genres'
                };
                break;

            case 'get-categories':
                result = {
                    categories: getInstrumentsByCategory(),
                    message: 'Instruments organized by category'
                };
                break;

            case 'get-instrument-info':
                const { instrumentName } = body;
                const info = INSTRUMENT_DATABASE[instrumentName as keyof typeof INSTRUMENT_DATABASE];
                if (info) {
                    result = {
                        instrument: { name: instrumentName, ...info },
                        message: 'Instrument details'
                    };
                } else {
                    result = { error: 'Instrument not found', message: 'Unknown instrument' };
                }
                break;

            default:
                result = { error: 'Invalid action', message: 'Use: suggest, ai-status, get-genres, get-categories, or get-instrument-info' };
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
