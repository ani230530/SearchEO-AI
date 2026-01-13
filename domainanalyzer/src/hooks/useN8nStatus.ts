import { useEffect, useRef, useCallback } from 'react';

interface N8nUpdateData {
    requestId: string;
    status: 'processing' | 'completed' | 'failed';
    googleSheetsUrl?: string;
    googleSlidesUrl?: string;
    error?: string;
}

interface SSEEvent {
    type: string;
    data?: N8nUpdateData;
    userId?: number;
}

interface UseN8nStatusOptions {
    requestId: string | null;
    onUpdate: (data: N8nUpdateData) => void;
    onError?: (error: Error) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

/**
 * Hook to listen for n8n status updates via SSE
 */
export function useN8nStatus({ requestId, onUpdate, onError }: UseN8nStatusOptions) {
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
                console.log('SSE connection opened');
            };

            eventSource.onmessage = (event) => {
                try {
                    const data: SSEEvent = JSON.parse(event.data);

                    // Filter for n8n_update events matching our requestId
                    if (data.type === 'n8n_update' && data.data && data.data.requestId === requestId) {
                        onUpdate(data.data);

                        // Close connection after final status
                        if (data.data.status === 'completed' || data.data.status === 'failed') {
                            eventSource.close();
                            eventSourceRef.current = null;
                        }
                    }
                } catch (err) {
                    console.error('Error parsing SSE message:', err);
                }
            };

            eventSource.onerror = (err) => {
                console.error('SSE error:', err);
                eventSource.close();
                eventSourceRef.current = null;

                // Auto-reconnect after 3 seconds
                reconnectTimerRef.current = setTimeout(() => {
                    console.log('Attempting to reconnect SSE...');
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
    }, [requestId, onUpdate, onError]);

    useEffect(() => {
        if (requestId) {
            connect();
        }

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
    }, [requestId, connect]);

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

/**
 * Manual status check for fallback
 */
export async function checkN8nStatus(requestId: string): Promise<N8nUpdateData | null> {
    const token = localStorage.getItem('authToken');
    if (!token) return null;

    try {
        const response = await fetch(`${API_BASE_URL}/api/audit/n8n/status/${requestId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch status');
        }

        const data = await response.json();
        if (data.success) {
            return {
                requestId,
                status: data.status,
                ...data.data,
            };
        }

        return null;
    } catch (error) {
        console.error('Error checking n8n status:', error);
        return null;
    }
}
