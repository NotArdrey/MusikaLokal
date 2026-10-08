type Finding = {
    result?: string
    source?: string | null
    short_reason?: string
    evidence?: Array<{ source?: string; observation?: string; timestamp_seconds?: number | null }>
}

export function submittedGenreFit(cv?: Finding | null, video?: Finding | null) {
    const checks = [
        { source: 'cv', finding: cv },
        { source: 'performance_video', finding: video },
    ].map(({ source, finding }) => {
        const entries = (finding?.evidence || []).filter((entry) => source === 'cv'
            ? entry.source === 'cv'
            : ['performance_video', 'video_frame', 'video_transcript', 'recognized_audio'].includes(String(entry.source)))
        const result = entries.length > 0 && ['supported', 'not_supported'].includes(String(finding?.result))
            ? finding!.result : 'unclear'
        return {
            source,
            status: result === 'supported' ? 'met' : result === 'not_supported' ? 'not_met' : 'unclear',
            detail: finding?.short_reason || `Genre fit could not be confirmed from the ${source === 'cv' ? 'CV' : 'performance video'}.`,
            evidence: entries,
        }
    })
    const supported = checks.some((check) => check.status === 'met')
    const contradicted = checks.some((check) => check.status === 'not_met')
    const conflict = supported && contradicted
    const status = conflict ? 'unclear' : supported ? 'met' : contradicted ? 'not_met' : 'unclear'
    return {
        key: 'genres', label: 'Genre fit', status,
        source: 'cv_and_performance_video',
        sources: ['cv', 'performance_video'],
        source_results: checks,
        conflict,
        detail: conflict
            ? 'The CV and performance video provide conflicting genre evidence. Review both before deciding.'
            : checks.map((check) => `${check.source === 'cv' ? 'CV' : 'Performance video'}: ${check.detail}`).join(' '),
    }
}
