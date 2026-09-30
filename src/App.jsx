import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { privacyPath } from './data/site';
import SiteLayout from './layouts/SiteLayout';
import HomePage from './pages/HomePage';

// Secondary pages load on demand so the home page ships as little JS as possible.
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const GasesPage = lazy(() => import('./pages/GasesPage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const ArticlePage = lazy(() => import('./pages/ArticlePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="clientes"
          element={
            <Suspense fallback={<div className="page-loading" />}>
              <ClientsPage />
            </Suspense>
          }
        />
        <Route
          path="gases"
          element={
            <Suspense fallback={<div className="page-loading" />}>
              <GasesPage />
            </Suspense>
          }
        />
        <Route
          path="blog"
          element={
            <Suspense fallback={<div className="page-loading" />}>
              <BlogPage />
            </Suspense>
          }
        />
        <Route
          path="blog/:slug"
          element={
            <Suspense fallback={<div className="page-loading" />}>
              <ArticlePage />
            </Suspense>
          }
        />
        <Route
          path={privacyPath.slice(1)}
          element={
            <Suspense fallback={<div className="page-loading" />}>
              <PrivacyPage />
            </Suspense>
          }
        />
        <Route path="privacy-policy" element={<Navigate to={privacyPath} replace />} />
        <Route
          path="*"
          element={
            <Suspense fallback={<div className="page-loading" />}>
              <NotFoundPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
