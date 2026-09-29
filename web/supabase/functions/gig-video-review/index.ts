import { handleInternalGigWorker } from '../_shared/internalGigWorker.ts'
import { runGigVideoReview } from '../_shared/gigPortfolioReview.ts'

Deno.serve((request: Request) => handleInternalGigWorker(request, runGigVideoReview))

