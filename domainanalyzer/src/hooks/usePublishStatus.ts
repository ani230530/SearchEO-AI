import { useEffect, useRef, useCallback } from 'react';

interface PublishUpdateData {
    draftId: number;
    pageId?: number;
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
    pageId?: number;
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

    // Use refs to avoid reconnecting when handles change
    const onUpdateRef = useRef(onUpdate);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onUpdateRef.current = onUpdate;
        onErrorRef.current = onError;
    }, [onUpdate, onError]);

    const connect = useCallback(() => {
        // Clean up any existing connection
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const token = localStorage.getItem('authToken');
        if (!token) {
            console.error('[SSE] No auth token found');
            return;
        }

        try {
            console.log('[SSE] Connecting...');
            const url = `${API_BASE_URL}/api/sse?token=${encodeURIComponent(token)}`;
            const eventSource = new EventSource(url);

            eventSource.onopen = () => {
                console.log('[SSE] Connection established');
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'publish_update') {
                        const updateData: PublishUpdateData = {
                            draftId: data.draftId,
                            pageId: data.pageId,
                            status: data.status,
                            publishedUrl: data.publishedUrl,
                            error: data.error
                        };
                        onUpdateRef.current(updateData);
                    }
                } catch (err) {
                    console.error('[SSE] Error parsing message:', err);
                }
            };

            eventSource.onerror = (err) => {
                console.error('[SSE] Error/Connection lost:', err);
                eventSource.close();
                eventSourceRef.current = null;

                // Auto-reconnect
                if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = setTimeout(() => {
                    connect();
                }, 3000);

                if (onErrorRef.current) {
                    onErrorRef.current(new Error('SSE connection lost'));
                }
            };

            eventSourceRef.current = eventSource;
        } catch (err) {
            console.error('[SSE] Failed to connect:', err);
            if (onErrorRef.current) {
                onErrorRef.current(err as Error);
            }
        }
    }, []); // No dependencies for connect now

    useEffect(() => {
        connect();
        return () => {
            if (eventSourceRef.current) eventSourceRef.current.close();
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        };
    }, [connect]);

    const disconnect = useCallback(() => {
        if (eventSourceRef.current) eventSourceRef.current.close();
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    }, []);

    return { disconnect };
}
