'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface DateFilterContextType {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  /** Set both dates at once */
  setDateRange: (from: string, to: string) => void;
  /** Clear both dates */
  clearDates: () => void;
}

const STORAGE_KEY_FROM = 'sula-qc-date-from';
const STORAGE_KEY_TO = 'sula-qc-date-to';

const DateFilterContext = createContext<DateFilterContextType | undefined>(undefined);

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const [dateFrom, setDateFromState] = useState('');
  const [dateTo, setDateToState] = useState('');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const f = localStorage.getItem(STORAGE_KEY_FROM);
      const t = localStorage.getItem(STORAGE_KEY_TO);
      if (f) setDateFromState(f);
      if (t) setDateToState(t);
    } catch {
      // ignore
    }
  }, []);

  const setDateFrom = useCallback((v: string) => {
    setDateFromState(v);
    try { localStorage.setItem(STORAGE_KEY_FROM, v); } catch { /* ignore */ }
  }, []);

  const setDateTo = useCallback((v: string) => {
    setDateToState(v);
    try { localStorage.setItem(STORAGE_KEY_TO, v); } catch { /* ignore */ }
  }, []);

  const setDateRange = useCallback((from: string, to: string) => {
    setDateFromState(from);
    setDateToState(to);
    try {
      localStorage.setItem(STORAGE_KEY_FROM, from);
      localStorage.setItem(STORAGE_KEY_TO, to);
    } catch { /* ignore */ }
  }, []);

  const clearDates = useCallback(() => {
    setDateFromState('');
    setDateToState('');
    try {
      localStorage.removeItem(STORAGE_KEY_FROM);
      localStorage.removeItem(STORAGE_KEY_TO);
    } catch { /* ignore */ }
  }, []);

  return (
    <DateFilterContext.Provider value={{ dateFrom, dateTo, setDateFrom, setDateTo, setDateRange, clearDates }}>
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter() {
  const context = useContext(DateFilterContext);
  if (!context) {
    throw new Error('useDateFilter must be used within a DateFilterProvider');
  }
  return context;
}
