/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { getLogoState, loadLogoOnce, subscribeToLogo } from '@/lib/logoCache';

export function DefaultLogo() {
  const { t } = useTranslation();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 172 40"
      role="img"
      aria-label={t('logo.stalwartAlt', 'Relay logo')}
      className="h-7 w-auto max-w-[320px]"
    >
      <rect x="1.5" y="4.5" width="31" height="31" rx="7.5" fill="#0d9488" />
      <g fill="none" stroke="#ffffff" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.5 13.5 L16.5 19.5 L10.5 25.5" />
        <path d="M17.5 13.5 L23.5 19.5 L17.5 25.5" />
      </g>
      <text
        x="42"
        y="28"
        className="fill-current"
        style={{ fontSize: '25px', fontWeight: 700, letterSpacing: '-0.4px' }}
      >
        Relay
      </text>
    </svg>
  );
}

export default function Logo() {
  const { t } = useTranslation();
  const logo = useSyncExternalStore(subscribeToLogo, getLogoState, getLogoState);

  useEffect(() => {
    loadLogoOnce();
  }, []);

  if (logo.status === 'custom') {
    return <img src={logo.url} alt={t('logo.alt', 'Logo')} className="h-7 w-auto max-w-[220px] object-contain" />;
  }

  if (logo.status === 'loading') {
    return <span className="block h-7 w-[140px]" aria-hidden="true" />;
  }

  return <DefaultLogo />;
}
