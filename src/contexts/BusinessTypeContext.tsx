'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export const BUSINESS_TYPES = ['PTB2C', 'PTOEM', 'PTGH'] as const;
export type BusinessType = typeof BUSINESS_TYPES[number] | '';

interface BusinessTypeContextType {
  lockedType: BusinessType;
  setLockedType: (type: BusinessType) => void;
  isLocked: boolean;
  /** Returns the effective business_type for API calls: locked type if set, otherwise null (no filter) */
  effectiveType: string | null;
}

const STORAGE_KEY = 'sula-qc-business-type-lock';

const BusinessTypeContext = createContext<BusinessTypeContextType | undefined>(undefined);

export function BusinessTypeProvider({ children }: { children: ReactNode }) {
  const [lockedType, setLockedTypeState] = useState<BusinessType>('');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setLockedTypeState(saved as BusinessType);
    } catch {
      // ignore
    }
  }, []);

  const setLockedType = useCallback((type: BusinessType) => {
    setLockedTypeState(type);
    try {
      if (type) {
        localStorage.setItem(STORAGE_KEY, type);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  const isLocked = lockedType !== '';
  const effectiveType = isLocked ? lockedType : null;

  return (
    <BusinessTypeContext.Provider value={{ lockedType, setLockedType, isLocked, effectiveType }}>
      {children}
    </BusinessTypeContext.Provider>
  );
}

export function useBusinessTypeLock() {
  const context = useContext(BusinessTypeContext);
  if (!context) {
    throw new Error('useBusinessTypeLock must be used within a BusinessTypeProvider');
  }
  return context;
}

/**
 * Hook for page components. Returns the effective business type for API calls.
 * If a global lock is active, the lock takes priority over the local selection.
 * Returns 'ALL' when no filter should be applied (no lock + local is ALL).
 */
export function useEffectiveBusinessType(localBusinessType: string): {
  /** The value to send as business_type param. 'ALL' = no filter. */
  effective: string;
  /** Whether a global lock is active */
  isLocked: boolean;
  /** The globally locked type, or empty string */
  lockedType: string;
  /** Set the local business type (only effective when no lock) */
  setLocalBusinessType: (v: string) => void;
} {
  const { lockedType, isLocked, effectiveType: lockedEffectiveType } = useBusinessTypeLock();

  if (isLocked && lockedEffectiveType) {
    return {
      effective: lockedEffectiveType,
      isLocked: true,
      lockedType,
      setLocalBusinessType: () => {}, // no-op when locked
    };
  }

  return {
    effective: localBusinessType,
    isLocked: false,
    lockedType: '',
    setLocalBusinessType: () => {}, // caller will use their own setter
  };
}
