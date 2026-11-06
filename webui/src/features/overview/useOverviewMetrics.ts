/*
 * SPDX-FileCopyrightText: 2026 devfazla <frchowdhury480@gmail.com>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/services/api';
import { METRICS_ENDPOINT, RATE_SERIES, parsePrometheusText, seriesRate, type MetricSample } from './metrics';

export type MetricsProblem = 'disabled' | 'protected' | 'unreachable';

export class MetricsUnavailable extends Error {
  readonly problem: MetricsProblem;

  constructor(problem: MetricsProblem) {
    super(problem);
    this.problem = problem;
  }
}

export const REFRESH_EVERY_SECONDS = [15, 30, 60, 300] as const;
const MAX_SAMPLES = 120;

async function scrape(signal: AbortSignal): Promise<MetricSample> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${METRICS_ENDPOINT}`, {
      method: 'GET',
      signal,
      headers: { Accept: 'text/plain' },
      credentials: 'omit',
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new MetricsUnavailable('unreachable');
  }

  if (response.status === 404) throw new MetricsUnavailable('disabled');
  if (response.status === 401 || response.status === 403) throw new MetricsUnavailable('protected');
  if (!response.ok) throw new MetricsUnavailable('unreachable');

  return { at: Date.now(), values: parsePrometheusText(await response.text()) };
}

export interface RatePoint {
  at: number;
  label: string;
  values: Record<string, number>;
}

function buildPoints(samples: MetricSample[]): RatePoint[] {
  const points: RatePoint[] = [];
  for (let i = 1; i < samples.length; i++) {
    const current = samples[i];
    const previous = samples[i - 1];
    const values: Record<string, number> = {};
    for (const series of RATE_SERIES) {
      const rate = seriesRate(current, previous, series.names);
      if (rate !== null) values[series.key] = Math.round(rate * 100) / 100;
    }
    points.push({ at: current.at, label: new Date(current.at).toLocaleTimeString(), values });
  }
  return points;
}

export function useOverviewMetrics(refreshSeconds: number | null) {
  const [samples, setSamples] = useState<MetricSample[]>([]);
  const lastAt = useRef(0);

  const query = useQuery({
    queryKey: ['overview', 'prometheus'],
    queryFn: ({ signal }) => scrape(signal),
    refetchInterval: refreshSeconds ? refreshSeconds * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const data = query.data;
  useEffect(() => {
    if (!data || data.at === lastAt.current) return;
    lastAt.current = data.at;
    setSamples((prev) => [...prev.slice(-(MAX_SAMPLES - 1)), data]);
  }, [data]);

  const reset = useCallback(() => {
    lastAt.current = 0;
    setSamples([]);
  }, []);

  const problem: MetricsProblem | null =
    query.error instanceof MetricsUnavailable ? query.error.problem : query.error ? 'unreachable' : null;

  return {
    values: data?.values ?? null,
    points: useMemo(() => buildPoints(samples), [samples]),
    hasHistory: samples.length > 1,
    isFetching: query.isFetching,
    isLoading: query.isPending && !data,
    problem,
    updatedAt: data?.at ?? null,
    refetch: query.refetch,
    reset,
  };
}
