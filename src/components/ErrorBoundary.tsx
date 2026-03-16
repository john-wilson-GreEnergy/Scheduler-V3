import React, { useState, useEffect } from 'react';

interface Props {
  children: React.ReactNode;
}

export const ErrorBoundary: React.FC<Props> = ({ children }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorHandler = (error: ErrorEvent) => {
      console.error("ErrorBoundary caught an error:", error);
      setHasError(true);
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', errorHandler as any);

    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', errorHandler as any);
    };
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050A08] text-red-500 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Something went wrong.</h1>
          <p className="text-gray-400">Please refresh the page or contact support.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
