// Componentes reais; todos os dados, RPCs e preços desta entrada são fictícios.
// A configuração dedicada substitui Supabase, RevenueCat e push por módulos locais.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { AppLayout } from '@/components/AppLayout';
import { TooltipProvider } from '@/components/ui/tooltip';
import Home from '@/pages/Home';
import TeamSettings from '@/pages/TeamSettings';
import '@/index.css';
Capacitor.isNativePlatform = () => true;
Capacitor.getPlatform = () => 'ios';
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const start = new URLSearchParams(location.search).get('screen') === 'billing' ? '/app/settings?aba=assinatura' : '/app/home';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><TooltipProvider>
  <MemoryRouter initialEntries={[start]}><Routes><Route path="/app" element={<AppLayout />}>
    <Route path="home" element={<Home />} /><Route path="settings" element={<TeamSettings />} />
  </Route></Routes></MemoryRouter>
</TooltipProvider></QueryClientProvider>);
