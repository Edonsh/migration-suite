import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchIdentity, type Identity } from '@/lib/identity';

interface IdentityContextValue {
  identity: Identity;
  loading: boolean;
}

const IdentityContext = createContext<IdentityContextValue>({
  identity: { email: '', display_name: '' },
  loading: true,
});

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity>({ email: '', display_name: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIdentity()
      .then(setIdentity)
      .finally(() => setLoading(false));
  }, []);

  return (
    <IdentityContext.Provider value={{ identity, loading }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  return useContext(IdentityContext);
}
