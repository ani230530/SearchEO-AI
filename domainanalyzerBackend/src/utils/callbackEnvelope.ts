import crypto from 'crypto';

export interface CallbackEnvelope {
  eventId: string;
  workflowId: string;
  entityId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'published';
  error?: string;
  occurredAt: string;
}

export const createCallbackEnvelope = (params: {
  workflowId: string;
  entityId: string | number;
  status: CallbackEnvelope['status'];
  error?: string;
}): CallbackEnvelope => {
  const { workflowId, entityId, status, error } = params;
  return {
    eventId: crypto.randomUUID(),
    workflowId,
    entityId: String(entityId),
    status,
    error,
    occurredAt: new Date().toISOString(),
  };
};

