import { useEffect, useRef, useCallback } from 'react';

interface PublishUpdateData {
    draftId: number;
    status: 'published' | 'draft' | 'failed';
    publishedUrl?: string;
    error?: string;
}

interface SSEEvent {
    type: string;
    data?: any;
    userId?: number;
    // publish_update specific fields might be at top level or in data
    draftId?: number;
    status?: string;
    publishedUrl?: string;
    error?: string;
}

interface UsePublishStatusOptions {
    onUpdate: (data: PublishUpdateData) => void;
    onError?: (error: Error) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

/**
 * Hook to listen for publish status updates via SSE
 */
export function usePublishStatus({ onUpdate, onError }: UsePublishStatusOptions) {
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

    const connect = useCallback(() => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.error('No auth token found');
            return;
        }

        try {
            // Create SSE connection with auth token in query parameter
            const url = `${API_BASE_URL}/api/sse?token=${encodeURIComponent(token)}`;
            const eventSource = new EventSource(url);

            eventSource.onopen = () => {
                // console.log('Publish SSE connection opened');
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Filter for publish_update events
                    if (data.type === 'publish_update') {
                        // Normalize data (backend sends fields at top level)
                        const updateData: PublishUpdateData = {
                            draftId: data.draftId,
                            status: data.status,
                            publishedUrl: data.publishedUrl,
                            error: data.error
                        };
                        onUpdate(updateData);
                    } else if (data.type === 'n8n_error') {
                        // Handle generic n8n errors that might affect this user
                        // If we had jobId tracking in frontend we could match exact job,
                        // but for now we pass it through if it looks relevant
                        const updateData: PublishUpdateData = {
                            draftId: 0, // Unknown draft ID, handled by generic error toast usually
                            status: 'failed',
                            error: data.error || 'N8n workflow error'
                        };
                        // We might want to pass this to a separate onError handler or generic update
                        // For now, let's just log it or handle if we can match the context
                    }
                } catch (err) {
                    console.error('Error parsing SSE message:', err);
                }
            };

            eventSource.onerror = (err) => {
                // console.error('SSE error:', err);
                eventSource.close();
                eventSourceRef.current = null;

                // Auto-reconnect after 3 seconds
                reconnectTimerRef.current = setTimeout(() => {
                    connect();
                }, 3000);

                if (onError) {
                    onError(new Error('SSE connection lost'));
                }
            };

            eventSourceRef.current = eventSource;
        } catch (err) {
            console.error('Error creating SSE connection:', err);
            if (onError) {
                onError(err as Error);
            }
        }
    }, [onUpdate, onError]);

    useEffect(() => {
        connect();

        return () => {
            // Cleanup on unmount
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
        };
    }, [connect]);

    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    }, []);

    return { disconnect };
}
