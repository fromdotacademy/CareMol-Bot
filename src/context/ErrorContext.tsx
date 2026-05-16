import { createContext, useContext, useState, type ReactNode } from 'react';

interface ErrorContextValue {
  dbError: Error | null;
  setDbError: (err: Error | null) => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function ErrorBoundaryProvider({ children }: { children: ReactNode }) {
  const [dbError, setDbError] = useState<Error | null>(null);
  return (
    <ErrorContext.Provider value={{ dbError, setDbError }}>{children}</ErrorContext.Provider>
  );
}

export function useErrorBoundary(): ErrorContextValue {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error('useErrorBoundary must be used inside <ErrorBoundaryProvider>');
  return ctx;
}
