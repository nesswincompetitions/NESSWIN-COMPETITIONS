import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from '../config/firebaseAdmin.js';
import { assertAdmin, toHttpsError } from '../services/functionGuards.js';
import { createOrderMetricsAuditHandler } from '../services/orderMetricsAuditService.js';

const handler = createOrderMetricsAuditHandler({ db, assertAdmin });

export const auditOrderMetricsReadOnly = onCall(async request => {
  try {
    return await handler(request);
  } catch (error) {
    if (!(error instanceof HttpsError)) logger.error('[auditOrderMetricsReadOnly] Error:', error);
    throw toHttpsError(error, 'Failed to audit order metrics.');
  }
});
