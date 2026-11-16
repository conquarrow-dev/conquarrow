/**
 * Construct the Pages host once and bind window listeners.
 *
 * @see docs/spec/online-shell/online-shell.md
 */

import { useCallback, useEffect, useState } from 'react';
import type { OnlineHostPort } from '@conquarrow/contracts';
import { createBrowserGis } from './online-gis';
import { createOnlineHost } from './online-host';
import {
  browserFetch,
  browserLocation,
  browserOpenSocket,
  browserSession,
  envFromVite,
} from './online-window';

/** P95 D11: how often a visible page checks the game version. */
export const POLL_MS = 15_000;
/** P95 D11: how often a visible page pings its socket (gateway idle is 10 minutes). */
export const HEARTBEAT_MS = 5 * 60_000;

const timer = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface PagesRuntime {
  readonly host: OnlineHostPort;
  dispose(): void;
}

const listeners = new Set<() => void>();

const notify = (): void => {
  for (const fn of listeners) fn();
};

let shared: PagesRuntime | undefined;

export const createPagesRuntime = (onChange: () => void): PagesRuntime => {
  const env = envFromVite();
  const box: { host: OnlineHostPort | undefined } = { host: undefined };

  const deliver = (idToken: string): void => {
    const current = box.host;
    if (current === undefined) return;
    void current.handleGisCredential(idToken).then(onChange);
  };

  const host = createOnlineHost({
    env,
    session: browserSession(),
    location: browserLocation(),
    fetch: browserFetch,
    openSocket: browserOpenSocket((raw) => {
      const current = box.host;
      if (current === undefined) return;
      void current.handleSocketMessage(raw).then(onChange);
    }),
    gis: createBrowserGis(env.VITE_GOOGLE_CLIENT_ID, deliver),
    newId: () => crypto.randomUUID(),
    wait: timer,
    now: () => Date.now(),
  });
  box.host = host;

  const onHash = (): void => {
    void host.handleHashChange().then(onChange);
  };
  const visible = (): boolean => document.visibilityState === 'visible';
  const onVisibility = (): void => {
    void host.handleVisibility(visible()).then(onChange);
  };
  // P95 D12: focus, network back and a page restored from the bfcache are all a resume.
  const onResume = (): void => {
    void host.handleVisibility(true).then(onChange);
  };
  const onPoll = (): void => {
    if (visible()) void host.handlePoll().then(onChange);
  };
  const onHeartbeat = (): void => {
    if (visible()) host.handleHeartbeat();
  };
  window.addEventListener('hashchange', onHash);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onResume);
  window.addEventListener('online', onResume);
  window.addEventListener('pageshow', onResume);
  const pollTimer = setInterval(onPoll, POLL_MS);
  const heartbeatTimer = setInterval(onHeartbeat, HEARTBEAT_MS);

  return {
    host,
    dispose: () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      window.removeEventListener('pageshow', onResume);
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
    },
  };
};

export const usePagesHost = (): {
  readonly host: OnlineHostPort | undefined;
  readonly gen: number;
  readonly refresh: () => void;
} => {
  const [gen, setGen] = useState(0);
  const [host, setHost] = useState<OnlineHostPort | undefined>(undefined);
  const refresh = useCallback(() => {
    setGen((n) => n + 1);
  }, []);
  useEffect(() => {
    listeners.add(refresh);
    if (shared === undefined) {
      shared = createPagesRuntime(notify);
      void shared.host.boot().then(notify);
    }
    setHost(shared.host);
    return () => {
      listeners.delete(refresh);
    };
  }, [refresh]);
  return { host, gen, refresh };
};
