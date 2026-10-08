import { handleInternalGigWorker } from '../_shared/internalGigWorker.ts'
import { runGigCvReview } from '../_shared/gigPortfolioReview.ts'

Deno.serve((request: Request) => handleInternalGigWorker(request, runGigCvReview))

