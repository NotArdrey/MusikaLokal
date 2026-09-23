import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
    compareApplicantFacesWithDeepFace,
    getFaceServiceMetadata,
    type FaceMatchResult,
    type FaceServiceMetadata,
} from '../mobile/supabase/functions/_shared/faceRecognitionClient.ts'

type BenchmarkCase = {
    id: string
    label: 'same_person' | 'different_person'
    clear_case?: boolean
    profile_image_url: string
    frame_urls: string[]
}

type Dataset = {
    name?: string
    production?: FaceServiceMetadata
    cases: BenchmarkCase[]
}

type CaseResult = BenchmarkCase & {
    result: FaceMatchResult
}

const safeDivide = (value: number, total: number) => total > 0 ? value / total : null
const percent = (value: number | null) => value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`
const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

function calculateMetrics(cases: CaseResult[]) {
    const clear = cases.filter(({ result }) => ['likely_same_person', 'likely_different_person'].includes(result.status))
    const same = cases.filter((item) => item.label === 'same_person')
    const different = cases.filter((item) => item.label === 'different_person')
    const falseMatches = different.filter(({ result }) => result.status === 'likely_same_person').length
    const falseNonMatches = same.filter(({ result }) => result.status === 'likely_different_person').length
    const correct = clear.filter(({ label, result }) => (
        label === 'same_person'
            ? result.status === 'likely_same_person'
            : result.status === 'likely_different_person'
    )).length
    const unclear = cases.filter(({ result }) => result.status === 'unclear' || result.status === 'not_run')
    const labeledClearCases = cases.filter((item) => item.clear_case !== false)
    const labeledClearUnclear = labeledClearCases.filter(({ result }) => (
        result.status === 'unclear' || result.status === 'not_run'
    ))
    return {
        total_cases: cases.length,
        false_match_rate: safeDivide(falseMatches, different.length),
        false_non_match_rate: safeDivide(falseNonMatches, same.length),
        coverage: safeDivide(clear.length, cases.length),
        conditional_accuracy: safeDivide(correct, clear.length),
        unclear_rate: safeDivide(unclear.length, cases.length),
        clear_case_unclear_rate: safeDivide(labeledClearUnclear.length, labeledClearCases.length),
        no_face_rate: safeDivide(cases.filter(({ result }) => result.no_face_frames > 0).length, cases.length),
        multiple_face_rate: safeDivide(cases.filter(({ result }) => result.multiple_people_frames > 0).length, cases.length),
        processing_failure_rate: safeDivide(cases.filter(({ result }) => result.processing_failure_frames > 0).length, cases.length),
        service_failure_rate: safeDivide(cases.filter(({ result }) => result.status === 'not_run' && Boolean(result.error)).length, cases.length),
        usable_frames_per_case: cases.map(({ id, result }) => ({ id, usable_frames: result.usable_frames })),
        same_person_distances: same.flatMap(({ result }) => result.frames.map((frame) => frame.distance).filter((value): value is number => value !== null)),
        different_person_distances: different.flatMap(({ result }) => result.frames.map((frame) => frame.distance).filter((value): value is number => value !== null)),
    }
}

function classifyAtThreshold(result: FaceMatchResult, threshold: number) {
    const distances = result.frames.map((frame) => frame.distance).filter((value): value is number => value !== null)
    if (distances.length < 2) return 'unclear'
    return distances.filter((distance) => distance <= threshold).length >= 2
        ? 'likely_same_person'
        : 'likely_different_person'
}

// BENCHMARK ONLY:
// ArcFace threshold analysis is diagnostic. Benchmark results must not automatically
// rewrite the production DeepFace/ArcFace threshold.
function thresholdAnalysis(cases: CaseResult[], productionThreshold: number | null) {
    const observed = cases.flatMap(({ result }) => result.frames)
        .map((frame) => frame.distance)
        .filter((value): value is number => value !== null)
    const candidates = Array.from(new Set([
        ...(productionThreshold === null ? [] : [productionThreshold]),
        ...observed.map((distance) => Number(distance.toFixed(3))),
    ])).sort((left, right) => left - right)

    return candidates.map((threshold) => {
        const classified = cases.map((item) => ({ ...item, status: classifyAtThreshold(item.result, threshold) }))
        const clear = classified.filter((item) => item.status !== 'unclear')
        const different = classified.filter((item) => item.label === 'different_person')
        const same = classified.filter((item) => item.label === 'same_person')
        const falseMatches = different.filter((item) => item.status === 'likely_same_person').length
        const falseNonMatches = same.filter((item) => item.status === 'likely_different_person').length
        const correct = clear.filter((item) => (
            item.label === 'same_person'
                ? item.status === 'likely_same_person'
                : item.status === 'likely_different_person'
        )).length
        return {
            threshold,
            false_match_rate: safeDivide(falseMatches, different.length),
            false_non_match_rate: safeDivide(falseNonMatches, same.length),
            coverage: safeDivide(clear.length, cases.length),
            conditional_accuracy: safeDivide(correct, clear.length),
        }
    })
}

function parity(production: FaceServiceMetadata, benchmark: FaceServiceMetadata) {
    const mappings: Array<[string, keyof FaceServiceMetadata]> = [
        ['face provider', 'provider'],
        ['face service', 'service_version'],
        ['DeepFace version', 'deepface_version'],
        ['model', 'model'],
        ['detector', 'detector_backend'],
        ['distance metric', 'distance_metric'],
        ['threshold', 'threshold'],
        ['alignment', 'alignment'],
        ['aggregation', 'aggregation_strategy'],
        ['frame configuration', 'frame_configuration'],
    ]
    const rows = mappings.map(([label, key]) => ({
        label,
        production: production[key] ?? null,
        benchmark: benchmark[key] ?? null,
        matches: JSON.stringify(production[key] ?? null) === JSON.stringify(benchmark[key] ?? null),
    }))
    return { matches: rows.every((row) => row.matches), rows }
}

function renderDashboard(report: any) {
    const metricRows = Object.entries(report.metrics)
        .filter(([, value]) => typeof value === 'number' || value === null)
        .map(([name, value]) => `<tr><th>${escapeHtml(name.replaceAll('_', ' '))}</th><td>${name === 'total_cases' ? value : percent(value as number | null)}</td></tr>`)
        .join('')
    const parityRows = report.production_parity.rows.map((row: any) => (
        `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.production)}</td><td>${escapeHtml(row.benchmark)}</td><td class="${row.matches ? 'ok' : 'bad'}">${row.matches ? 'MATCH' : 'DIFFERS'}</td></tr>`
    )).join('')
    const thresholdRows = report.threshold_analysis.map((row: any) => (
        `<tr><td>${row.threshold}</td><td>${percent(row.false_match_rate)}</td><td>${percent(row.false_non_match_rate)}</td><td>${percent(row.coverage)}</td><td>${percent(row.conditional_accuracy)}</td></tr>`
    )).join('')
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MusikaLokal Face Benchmark</title><style>
body{font:15px system-ui,sans-serif;margin:0;background:#0b1020;color:#e8ecf6}main{max-width:1100px;margin:auto;padding:32px}h1,h2{margin-top:0}.card{background:#151d33;border:1px solid #2a3554;border-radius:14px;padding:20px;margin:18px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #2a3554;padding:9px}.ok{color:#55d68b}.bad,.warning{color:#ff7575}.muted{color:#9ca9c8}code{color:#c7d5ff}</style></head><body><main>
<h1>MusikaLokal DeepFace / ArcFace Benchmark</h1><p class="muted">Run: ${escapeHtml(report.run_date)} · Dataset: ${escapeHtml(report.dataset)}</p>
${report.production_parity.matches ? '' : '<div class="card warning"><strong>WARNING — FACE BENCHMARK DOES NOT MATCH PRODUCTION</strong></div>'}
<section class="card"><h2>Provider configuration</h2><p>Production face provider: <code>${escapeHtml(report.production_face_provider)}</code><br>Benchmark face provider: <code>${escapeHtml(report.benchmark_face_provider)}</code><br>Production face service: <code>${escapeHtml(report.production_face_service)}</code><br>Benchmark face service: <code>${escapeHtml(report.benchmark_face_service)}</code><br>Production model: <code>${escapeHtml(report.production_model)}</code><br>Benchmark model: <code>${escapeHtml(report.benchmark_model)}</code><br>Production threshold: <code>${escapeHtml(report.production_threshold)}</code><br>Benchmark threshold: <code>${escapeHtml(report.benchmark_threshold)}</code><br>Production frame configuration: <code>${escapeHtml(report.production_frame_configuration)}</code><br>Benchmark frame configuration: <code>${escapeHtml(report.benchmark_frame_configuration)}</code></p></section>
<section class="card"><h2>Production parity</h2><table><thead><tr><th>Configuration</th><th>Production</th><th>Benchmark</th><th>Status</th></tr></thead><tbody>${parityRows}</tbody></table></section>
<section class="card"><h2>Face metrics</h2><table><tbody>${metricRows}</tbody></table><p class="muted">Face accuracy is reported separately from genre and recording-recognition accuracy.</p></section>
<section class="card"><h2>ArcFace threshold analysis</h2><p class="muted">Diagnostic only. This report never changes the production threshold.</p><table><thead><tr><th>Threshold</th><th>False match</th><th>False non-match</th><th>Coverage</th><th>Conditional accuracy</th></tr></thead><tbody>${thresholdRows}</tbody></table></section>
</main></body></html>`
}

async function main() {
    const datasetPath = process.argv[2]
    if (!datasetPath) throw new Error('Usage: npm run benchmark:face -- <dataset.json> [output-directory]')
    const outputDirectory = path.resolve(process.argv[3] || 'output/face-benchmark')
    const dataset = JSON.parse(await readFile(path.resolve(datasetPath), 'utf8')) as Dataset
    if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) throw new Error('Benchmark dataset has no cases.')

    const options = {
        serviceUrl: String(process.env.FACE_RECOGNITION_URL || ''),
        apiKey: String(process.env.FACE_RECOGNITION_API_KEY || ''),
        timeoutMs: Number(process.env.FACE_RECOGNITION_TIMEOUT_MS || 60_000),
    }
    if (!options.serviceUrl) throw new Error('FACE_RECOGNITION_URL is required.')
    const service = await getFaceServiceMetadata(options)
    const caseResults: CaseResult[] = []
    for (const benchmarkCase of dataset.cases) {
        const results = await compareApplicantFacesWithDeepFace(
            [{ id: benchmarkCase.id, reference_image_url: benchmarkCase.profile_image_url }],
            benchmarkCase.frame_urls,
            options,
        )
        caseResults.push({ ...benchmarkCase, result: results.get(benchmarkCase.id)! })
    }

    const production = dataset.production || service
    const report = {
        run_date: new Date().toISOString(),
        dataset: dataset.name || path.basename(datasetPath),
        production_face_provider: production.provider === 'deepface_arcface' ? 'DeepFace / ArcFace' : production.provider,
        benchmark_face_provider: service.provider === 'deepface_arcface' ? 'DeepFace / ArcFace' : service.provider,
        production_face_service: production.service_version,
        benchmark_face_service: service.service_version,
        production_model: production.model,
        benchmark_model: service.model,
        production_threshold: production.threshold,
        benchmark_threshold: service.threshold,
        production_frame_configuration: production.frame_configuration,
        benchmark_frame_configuration: service.frame_configuration,
        production_parity: parity(production, service),
        metrics: calculateMetrics(caseResults),
        threshold_analysis: thresholdAnalysis(caseResults, typeof service.threshold === 'number' ? service.threshold : null),
        cases: caseResults,
    }
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2))
    await writeFile(path.join(outputDirectory, 'index.html'), renderDashboard(report))
    console.log(`Face benchmark written to ${outputDirectory}`)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
