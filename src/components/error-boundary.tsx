import { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: ReactNode;
  /** Nombre de la zona, para poder distinguir el origen en Sentry. */
  area?: string;
}

interface State {
  error: Error | null;
}

/**
 * Captura los errores de render para que un fallo en una tarjeta no deje la
 * aplicación en blanco sin traza, que era lo que ocurría antes.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no controlado:', error, info.componentStack);
    Sentry.withScope((scope) => {
      scope.setTag('area', this.props.area ?? 'app');
      scope.setContext('react', { componentStack: info.componentStack });
      Sentry.captureException(error);
    });
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
        <h1 className="text-2xl font-bold">Algo ha ido mal</h1>
        <p className="text-muted-foreground max-w-sm">
          Ha ocurrido un error inesperado. Puedes reintentar o volver al inicio.
        </p>

        {import.meta.env.DEV && (
          <pre className="text-xs text-left bg-muted p-3 rounded-md max-w-full overflow-auto">
            {error.message}
          </pre>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="press px-4 py-2 rounded-lg border border-border"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/';
            }}
            className="px-4 py-2 rounded-lg bg-party-primary text-party-dark"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
