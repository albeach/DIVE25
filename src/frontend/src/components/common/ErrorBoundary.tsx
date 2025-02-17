import { Component, ErrorInfo, ReactNode } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Props {
  children?: ReactNode;
  error?: Error;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError || this.props.error) {
      const error = this.props.error || this.state.error;
      return (
        <div className="min-h-screen pt-16 pb-12 flex flex-col bg-white">
          <main className="flex-grow flex flex-col justify-center max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex-shrink-0 flex justify-center">
              <ExclamationTriangleIcon
                className="h-12 w-12 text-yellow-400"
                aria-hidden="true"
              />
            </div>
            <div className="py-8">
              <div className="text-center">
                <h1 className="mt-2 text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
                  Something went wrong.
                </h1>
                <p className="mt-2 text-base text-gray-500">
                  {error?.message || 'An unexpected error occurred'}
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => window.location.reload()}
                    className="text-base font-medium text-nato-blue hover:text-nato-blue/90"
                  >
                    Refresh page<span aria-hidden="true"> &rarr;</span>
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
      );
    }

    return this.props.children;
  }
} 