import { handleInternalGigWorker } from '../_shared/internalGigWorker.ts'
import { runGigMemberVerification } from '../_shared/gigMemberVerificationService.ts'

Deno.serve((request: Request) => handleInternalGigWorker(
    request,
    (client, applicationId) => runGigMemberVerification(client, applicationId),
))

