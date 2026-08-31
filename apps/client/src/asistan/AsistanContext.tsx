import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  assistantChat,
  assistantStatus,
  type AssistantAction,
  type AssistantPanel,
  type AssistantStep,
  type ChatMessage,
} from './api';

/**
 * Asistan sohbeti GLOBAL yaşar: kullanıcı sayfalar arasında gezinirken
 * konuşma kaybolmaz, çekmece her yerden açılır. Her istek, kullanıcının
 * o an baktığı sayfayı (path) bağlam olarak backend'e taşır.
 */

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  steps?: AssistantStep[];
  actions?: AssistantAction[];
  paneller?: AssistantPanel[];
  error?: boolean;
}

interface AsistanState {
  turns: Turn[];
  busy: boolean;
  available: boolean | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  send: (text: string, path: string) => Promise<void>;
  clear: () => void;
}

const Ctx = createContext<AsistanState | null>(null);

export function AsistanProvider({ children }: { children: ReactNode }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    assistantStatus().then((s) => setAvailable(s.available));
  }, []);

  // Cmd/Ctrl+K → asistan çekmecesi (her sayfadan, her an)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const send = useCallback(
    async (text: string, path: string) => {
      const q = text.trim();
      if (!q) return;
      setBusy(true);
      setTurns((prev) => {
        const history: ChatMessage[] = [
          ...prev.filter((t) => !t.error).map((t) => ({ role: t.role, content: t.content })),
          { role: 'user', content: q },
        ];
        void assistantChat(history, { path })
          .then((res) =>
            setTurns((t) => [
              ...t,
              {
                role: 'assistant',
                content: res.answer,
                steps: res.steps,
                actions: res.actions,
                paneller: res.paneller,
              },
            ]),
          )
          .catch((e) =>
            setTurns((t) => [
              ...t,
              { role: 'assistant', content: (e as Error).message, error: true },
            ]),
          )
          .finally(() => setBusy(false));
        return [...prev, { role: 'user', content: q }];
      });
    },
    [],
  );

  const value = useMemo<AsistanState>(
    () => ({
      turns,
      busy,
      available,
      open,
      setOpen,
      send,
      clear: () => setTurns([]),
    }),
    [turns, busy, available, open, send],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAsistan(): AsistanState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAsistan, AsistanProvider içinde kullanılmalı');
  return v;
}
