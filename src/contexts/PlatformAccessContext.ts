import { createContext, useContext } from "react";

interface PlatformAccess {
  userId: string | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

export const PlatformAccessContext = createContext<PlatformAccess>({
  userId: null, isPlatformAdmin: false, loading: true, error: null, refetch: () => {},
});

export function usePlatformAccess() { return useContext(PlatformAccessContext); }
