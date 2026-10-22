import { useCallback, useEffect, useRef, useState } from 'react';
import { getHealth } from '../services/api.js';

/**
 * Checks /api/health. If the server has not answered after `wakingAfterMs`,
 * status becomes "waking": free-tier hosts spin down when idle and the first
 * request can take a while (cold start).
 */
export function useApiHealth({ wakingAfterMs = 3000, timeoutMs = 60000 } = {}) {
  const [state, setState] = useState({ status: 'checking', data: null, error: null });
  const runId = useRef(0);

  const check = useCallback(() => {
    const id = ++runId.current;
    const controller = new AbortController();
    setState({ status: 'checking', data: null, error: null });

    const wakingTimer = setTimeout(() => {
      if (runId.current === id) setState((s) => (s.status === 'checking' ? { ...s, status: 'waking' } : s));
    }, wakingAfterMs);
    const abortTimer = setTimeout(() => controller.abort(), timeoutMs);

    getHealth({ signal: controller.signal })
      .then((data) => runId.current === id && setState({ status: 'online', data, error: null }))
      .catch((err) => {
        if (runId.current !== id) return;
        const timedOut = err?.name === 'AbortError';
        setState({
          status: 'offline',
          data: null,
          error: timedOut ? 'The server took too long to respond.' : err.message,
        });
      })
      .finally(() => {
        clearTimeout(wakingTimer);
        clearTimeout(abortTimer);
      });

    return () => {
      runId.current++;
      controller.abort();
      clearTimeout(wakingTimer);
      clearTimeout(abortTimer);
    };
  }, [wakingAfterMs, timeoutMs]);

  useEffect(() => check(), [check]);

  return { ...state, retry: check };
}
