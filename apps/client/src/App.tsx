import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { isLoggedIn } from './auth/auth';
import { AnalysisPage } from './pages/AnalysisPage';
import { HarmanHomePage } from './pages/HarmanHomePage';
import { DatasetsPage } from './pages/DatasetsPage';
import { HaritaPage } from './harita/HaritaPage';
import { AsistanPage } from './asistan/AsistanPage';
import { AsistanDrawer } from './asistan/AsistanDrawer';
import { AlarmlarPage } from './alarmlar/AlarmlarPage';
import { AsistanProvider } from './asistan/AsistanContext';
import { NesneDetayProvider } from './nesne/NesneDetay';
import { GrafPage } from './graf/GrafPage';
import { OntolojiPage } from './ontoloji/OntolojiPage';
import { YonetimPage } from './ontoloji/YonetimPage';
import { PanoPage } from './pano/PanoPage';
import { KararDestekPage } from './karar/KararDestekPage';
import { SyncMatrixPage } from './senkron/SyncMatrixPage';
import { LoginPage } from './pages/LoginPage';
import { MercekAnalysisPage } from './mercek/MercekAnalysisPage';
import { MercekHomePage } from './mercek/MercekHomePage';

function RequireAuth({ children }: { children: ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AsistanProvider>
    <NesneDetayProvider>
    <AsistanDrawer />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><PanoPage /></RequireAuth>} />
      <Route path="/harman" element={<RequireAuth><HarmanHomePage /></RequireAuth>} />
      <Route path="/datasets" element={<RequireAuth><DatasetsPage /></RequireAuth>} />
      <Route path="/harita" element={<RequireAuth><HaritaPage /></RequireAuth>} />
      <Route path="/graf" element={<RequireAuth><GrafPage /></RequireAuth>} />
      <Route path="/ontoloji" element={<RequireAuth><OntolojiPage /></RequireAuth>} />
      <Route path="/ontoloji/yonetim" element={<RequireAuth><YonetimPage /></RequireAuth>} />
      <Route path="/asistan" element={<RequireAuth><AsistanPage /></RequireAuth>} />
      <Route path="/alarmlar" element={<RequireAuth><AlarmlarPage /></RequireAuth>} />
      <Route path="/karar" element={<RequireAuth><KararDestekPage /></RequireAuth>} />
      <Route path="/senkron" element={<RequireAuth><SyncMatrixPage /></RequireAuth>} />
      <Route path="/harman/:id" element={<RequireAuth><AnalysisPage /></RequireAuth>} />
      {/* Eski ayrı dashboard rotaları birleşik panoya (/) yönlendirilir */}
      <Route path="/harman/:id/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/mercek" element={<RequireAuth><MercekHomePage /></RequireAuth>} />
      <Route path="/mercek/:id" element={<RequireAuth><MercekAnalysisPage /></RequireAuth>} />
      <Route path="/mercek/:id/dashboard" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </NesneDetayProvider>
    </AsistanProvider>
  );
}
