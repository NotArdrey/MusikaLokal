import { verifySessionNonce } from './identityDuplicate.ts';

export function isInvalidatedDiditAttempt(status: unknown) {
  return String(status || '').trim().toUpperCase().startsWith('SUPERSEDED');
}

export async function readDiditAttempt(client: any, sessionRef: string, nonce: unknown, requireNonce = false) {
  const { data, error } = await client.from('verification_sessions')
    .select('status, verification_data').eq('session_ref', sessionRef).maybeSingle();
  if (error) throw new Error('Could not read the verification attempt.');
  const hash = data?.verification_data?.session_nonce_hash;
  if (!data || (requireNonce && !hash) || (hash && !await verifySessionNonce(sessionRef, nonce, hash))) {
    throw new Error('Verification session could not be validated. Please start verification again.');
  }
  return data;
}

export async function cancelDiditAttempt(client: any, sessionRef: string, nonce: unknown) {
  await readDiditAttempt(client, sessionRef, nonce, true);
  const { error } = await client.from('verification_sessions')
    .update({ status: 'SUPERSEDED' }).eq('session_ref', sessionRef);
  if (error) throw new Error('Could not cancel the verification attempt.');
  return { success: true, status: 'SUPERSEDED' };
}

export function summarizeDiditWorkflow(workflow: any, configuredId: string) {
  const features = Array.isArray(workflow.features) ? workflow.features : [];
  const ocr = features.find((feature: any) => ['OCR', 'ID_VERIFICATION'].includes(feature.feature));
  const config = ocr?.config || workflow;
  return {
    configuredId,
    workflowId: workflow.workflow_id || workflow.uuid,
    status: workflow.status,
    archived: workflow.is_archived === true,
    features: typeof workflow.features === 'string' ? workflow.features : features.map((f: any) => f.feature),
    livenessEnabled: workflow.is_liveness_enabled,
    faceMatchEnabled: workflow.is_face_match_enabled,
    documentsAllowed: config.documents_allowed,
    image_capture_methods_allowed: config.image_capture_methods_allowed,
  };
}
