import React, { useState, useEffect, useRef } from 'react';
import { useMentraAuth } from '@mentra/react';

/**
 * Interface for transcript messages received via SSE
 */
interface TranscriptMessage {
  type: 'connected' | 'transcript';
  text?: string;
  timestamp?: number;
  isFinal?: boolean;
  userId?: string;
}

/**
 * Component that displays live transcripts from the MentraOS session
 * Uses Server-Sent Events to receive real-time updates
 */
const TranscriptDisplay: React.FC = () => {
  const { frontendToken } = useMentraAuth();
  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!frontendToken) {
      return;
    }

    // Create SSE connection with authentication (token appended as query param)
    const connectToSSE = () => {
      try {
        // Prefer an explicit backend URL via VITE_BACKEND_URL, otherwise same origin
        const backend = (import.meta as any).env?.VITE_BACKEND_URL || '';
        const tokenQuery = frontendToken ? `?token=${encodeURIComponent(frontendToken)}` : '';
        const url = backend ? `${backend.replace(/\/$/, '')}/api/transcripts${tokenQuery}` : `/api/transcripts${tokenQuery}`;

        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          console.log('SSE connection opened');
          setIsConnected(true);
          setConnectionError('');
        };

        eventSource.onmessage = (event) => {
          try {
            const message: TranscriptMessage = JSON.parse(event.data);

            if (message.type === 'connected') {
              console.log('Connected to transcript stream for user:', message.userId);
            } else if (message.type === 'transcript') {
              // Update the current transcript
              setCurrentTranscript(message.text || '');
            }
          } catch (error) {
            console.error('Error parsing SSE message:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('SSE error:', error);
          setIsConnected(false);
          setConnectionError('Connection to transcript stream lost. Retrying...');

          // Reconnect after a delay
          setTimeout(() => {
            if (eventSourceRef.current === eventSource) {
              connectToSSE();
            }
          }, 3000);
        };
      } catch (error) {
        console.error('Error creating EventSource:', error);
        setConnectionError('Failed to connect to transcript stream');
      }
    };

    connectToSSE();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [frontendToken]);

  return (
    <div className="bg-white rounded-lg shadow-sm p-8">
      <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200">
        <div
          className={`w-3 h-3 rounded-full transition-colors ${
            isConnected
              ? 'bg-green-500 shadow-lg shadow-green-500/20'
              : 'bg-red-500 shadow-lg shadow-red-500/20'
          }`}
        ></div>
        <span className="text-sm font-medium text-gray-700">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {connectionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6 text-sm">
          {connectionError}
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Live Transcript</h2>
        <div className={`
          border rounded-md p-6 min-h-[120px] text-lg leading-relaxed transition-all
          ${currentTranscript
            ? 'bg-blue-50 border-blue-200 text-gray-900'
            : 'bg-gray-50 border-gray-200'
          }
        `}>
          {currentTranscript || (
            <span className="text-gray-400 italic">
              Speak into your MentraOS device to see transcripts appear here...
            </span>
          )}
        </div>
      </div>

      <div className="bg-gray-50 rounded-md p-6">
        <h3 className="text-base font-semibold mb-3 text-gray-800">Instructions:</h3>
        <ul className="space-y-2">
          <li className="flex items-start text-sm text-gray-600">
            <span className="text-blue-500 font-bold mr-3">•</span>
            Make sure your MentraOS app has microphone permission enabled
          </li>
          <li className="flex items-start text-sm text-gray-600">
            <span className="text-blue-500 font-bold mr-3">•</span>
            Speak clearly into your connected device
          </li>
          <li className="flex items-start text-sm text-gray-600">
            <span className="text-blue-500 font-bold mr-3">•</span>
            Transcripts will appear here in real-time
          </li>
        </ul>
      </div>
    </div>
  );
};

export default TranscriptDisplay;