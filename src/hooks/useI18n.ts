'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getTranslations, t as tFn, type Lang } from '@/lib/i18n';

export function useI18n() {
  const { user } = useAuth();
  const lang: Lang = user?.language || 'zh';

  const translations = useMemo(() => getTranslations(lang), [lang]);

  const t = (key: string): string => {
    return tFn(key, lang);
  };

  return { t, lang, translations };
}
