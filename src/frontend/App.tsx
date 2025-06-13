import React from 'react';
import { useAugmentosAuth } from '@augmentos/react';
import TranscriptDisplay from './components/TranscriptDisplay';

/**
 * Main App component that manages authentication state and renders
 * the appropriate content based on authentication status
 */
function App(): React.JSX.Element {
  const { userId, isLoading, error, isAuthenticated } = useAugmentosAuth();

  // Handle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <div className="w-10 h-10 border-3 border-gray-300 border-t-augmentos-blue rounded-full animate-spin"></div>
          <p className="text-gray-600">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
          <h2 className="text-red-600 text-2xl font-semibold mb-4">Authentication Error</h2>
          <p className="text-red-600 font-medium mb-2">{error}</p>
          <p className="text-gray-600 text-sm">
            Please ensure you are opening this page from the AugmentOS app.
          </p>
        </div>
      </div>
    );
  }

  // Handle unauthenticated state
  if (!isAuthenticated || !userId) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
          <h2 className="text-red-600 text-2xl font-semibold mb-4">Not Authenticated</h2>
          <p className="text-gray-700">Please open this page from the AugmentOS manager app to view live transcripts.</p>
        </div>
      </div>
    );
  }

  // Authenticated - show transcript display
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="bg-augmentos-blue text-white px-8 py-6 shadow-md">
        <h1 className="text-3xl font-semibold mb-2">AugmentOS Live Transcripts</h1>
        <div className="text-sm opacity-90">
          <span className="mr-2">User ID:</span>
          <span className="font-mono bg-white bg-opacity-10 px-2 py-0.5 rounded">
            {userId}
          </span>
        </div>
      </header>
      <main className="flex-1 p-8 max-w-6xl mx-auto w-full">
        <TranscriptDisplay />
      </main>
    </div>
  );
}

export default App;