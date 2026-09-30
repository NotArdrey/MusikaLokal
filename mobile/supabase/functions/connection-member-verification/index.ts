import { handleInternalGigWorker } from '../_shared/internalGigWorker.ts'
import { runConnectionMemberVerification } from '../_shared/gigMemberVerificationService.ts'

Deno.serve((request: Request) => handleInternalGigWorker(
    request,
    (client, applicationId) => runConnectionMemberVerification(client, applicationId),
))
