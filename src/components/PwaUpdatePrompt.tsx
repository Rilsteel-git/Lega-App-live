import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="pwa-update-prompt" role="status">
      <span>A new version of Lega is available.</span>
      <div className="pwa-update-actions">
        <button type="button" onClick={() => setNeedRefresh(false)}>Later</button>
        <button type="button" onClick={() => void updateServiceWorker(true)}>Update</button>
      </div>
    </div>
  );
}
