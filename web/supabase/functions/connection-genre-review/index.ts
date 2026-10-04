import { handleInternalGigWorker } from '../_shared/internalGigWorker.ts'
import { runConnectionGenreReview } from '../_shared/connectionGenreReview.ts'

Deno.serve((request: Request) => handleInternalGigWorker(request, runConnectionGenreReview))
