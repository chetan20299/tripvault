import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './auth/session';
import { UiProvider } from './components/ui';
import { LOGO_DATA_URL } from './lib/logo';
import Layout from './components/Layout';
import AuthPage from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Cities from './pages/Cities';
import CityDetail from './pages/CityDetail';
import EntryForm from './pages/EntryForm';
import EntryDetail from './pages/EntryDetail';
import Categories from './pages/Categories';
import ExportPage from './pages/Export';
import Settings from './pages/Settings';
import { useTheme } from './lib/theme';

function Splash() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-brand-600 to-brand-900 text-white">
      <img src={LOGO_DATA_URL} alt="TripVault" className="h-24 w-24 rounded-[1.6rem] shadow-2xl [animation:splash-pulse_1.6s_ease-in-out_infinite]" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Trip<span className="text-accent-400">Vault</span></h1>
      <p className="mt-1 text-sm text-white/70">Your Business Travel Knowledge</p>
      <div className="mt-10 h-1 w-28 overflow-hidden rounded-full bg-white/15"><div className="h-full w-1/3 animate-[splash-bar_1.1s_ease-in-out_infinite] rounded-full bg-accent-400" /></div>
      <style>{'@keyframes splash-bar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
    </div>
  );
}

function Gate() {
  const { status } = useSession();
  useTheme(); // keeps the theme in sync with system changes
  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') return <AuthPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="cities" element={<Cities />} />
        <Route path="cities/:id" element={<CityDetail />} />
        <Route path="entry/new" element={<EntryForm />} />
        <Route path="entry/:id" element={<EntryDetail />} />
        <Route path="entry/:id/edit" element={<EntryForm />} />
        <Route path="categories" element={<Categories />} />
        <Route path="export" element={<ExportPage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <UiProvider>
        <SessionProvider>
          <Gate />
        </SessionProvider>
      </UiProvider>
    </HashRouter>
  );
}
