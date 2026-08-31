import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LiveModeProvider } from './api/live';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router';
import App from './App';
import { store } from './store/store';
import { TemaProvider } from './theme/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      // Az-kaynaklı sunucuyu koru: sekmeye her dönüşte burst yapma; arka planda
      // (gizli sekme) canlı-poll'u durdur — sadece görünür sayfa tazelenir.
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <LiveModeProvider>
          <TemaProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </TemaProvider>
        </LiveModeProvider>
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
);
