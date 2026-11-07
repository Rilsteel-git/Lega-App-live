import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError, reloadForStaleBuild } from '../lib/staleBuildReload';
import { t } from '../i18n';

interface State {
  failed: boolean;
}

/* Without a boundary, any render error (most often a lazy page chunk that
 * failed to load after a deploy) unmounts the whole app and leaves a blank
 * screen. Show a way back instead. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Lega crashed while rendering.', error, info.componentStack);
    if (isChunkLoadError(error)) reloadForStaleBuild();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app-crash" role="alert">
        <img src="/brand/lega-app-icon.svg" alt="" width={64} height={64} />
        <strong>{t('Something went wrong')}</strong>
        <p>{t('Reload Lega to continue.')}</p>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>{t('Reload')}</button>
      </div>
    );
  }
}
