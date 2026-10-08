type CvNameCheckStatus = 'match' | 'mismatch' | 'unclear' | 'not_run'

const NAME_IGNORED_TOKENS = new Set([
    'mr', 'mrs', 'ms', 'miss', 'dr', 'engr', 'eng', 'atty',
    'jr', 'sr', 'ii', 'iii', 'iv', 'v', 'vi',
])

export function normalizedNameTokens(value: unknown) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
        .filter((token) => token && !NAME_IGNORED_TOKENS.has(token))
}

function nameTokenMatches(left: string, right: string) {
    return left === right || (left[0] === right[0] && (left.length === 1 || right.length === 1))
}

function normalizedNamesMatch(left: unknown, right: unknown) {
    const a = normalizedNameTokens(left), b = normalizedNameTokens(right)
    if (!a.length || !b.length) return false
    if (a.join(' ') === b.join(' ')) return true
    if (a.length < 2 || b.length < 2) return false
    return (nameTokenMatches(a[0], b[0]) && nameTokenMatches(a[a.length - 1], b[b.length - 1])) ||
        (nameTokenMatches(a[0], b[b.length - 1]) && nameTokenMatches(a[a.length - 1], b[0]))
}

export function compareCvApplicantName(extractedName: unknown, expectedNames: unknown[], extractionConfidence = 1) {
    const candidateName = String(extractedName || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    const candidates = Array.from(new Set(expectedNames.filter((name): name is string => typeof name === 'string')
        .map((name) => name.replace(/\s+/g, ' ').trim().slice(0, 160)).filter(Boolean)))
    const confidence = Math.max(0, Math.min(1, Number(extractionConfidence) || 0))
    const base = { confidence, extracted_name: candidateName || null, matched_name: null as string | null, expected_name: candidates[0] || null }
    if (!candidateName) return { ...base, status: 'unclear' as CvNameCheckStatus, summary: "We couldn't find a clear name on the CV. Verify it manually." }
    if (!candidates.length) return { ...base, status: 'unclear' as CvNameCheckStatus, summary: "We couldn't determine which applicant name to compare with the CV." }
    if (confidence < 0.7) return { ...base, status: 'unclear' as CvNameCheckStatus, summary: "We couldn't confidently read the name on the CV. Verify it manually." }
    const matchedName = candidates.find((name) => normalizedNamesMatch(candidateName, name))
    if (matchedName) return { ...base, status: 'match' as CvNameCheckStatus, matched_name: matchedName, summary: `The name on the CV matches ${matchedName}'s record.` }
    const tokens = new Set(normalizedNameTokens(candidateName))
    const partial = candidates.some((name) => normalizedNameTokens(name).some((token) => token.length > 1 && tokens.has(token)))
    return { ...base, status: (partial ? 'unclear' : 'mismatch') as CvNameCheckStatus, summary: partial
        ? "The CV name only partially matches the applicant's record. Verify it manually."
        : `The CV lists ${candidateName}, while the registered member is ${base.expected_name}. Verify this CV manually.` }
}

type MemberCvCheck = { member_name?: string; name_check?: { status?: string; confidence?: number; extracted_name?: string | null; matched_name?: string | null; expected_name?: string | null } | null }

export function summarizeMemberCvNameChecks(reviews: MemberCvCheck[]) {
    const mismatch = reviews.find((review) => review.name_check?.status === 'mismatch')
    if (mismatch) {
        const check = mismatch.name_check!
        return { ...check, status: 'mismatch', expected_name: mismatch.member_name || check.expected_name || null,
            summary: `The CV lists ${check.extracted_name || 'a different name'}, while the registered member is ${mismatch.member_name || check.expected_name || 'unconfirmed'}. Verify this CV manually.` }
    }
    const confirmed = reviews.filter((review) => review.name_check?.status === 'match').length
    return { status: reviews.length > 0 && confirmed === reviews.length ? 'match' : 'unclear',
        confidence: reviews.length > 0 ? Math.min(...reviews.map((review) => Number(review.name_check?.confidence || 0))) : 0,
        extracted_name: null, matched_name: null, expected_name: null,
        summary: `${confirmed} of ${reviews.length} member CV names match their registered member records.` }
}
