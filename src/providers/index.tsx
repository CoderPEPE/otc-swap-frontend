"use client";

import { ThemeProvider } from '@/providers/ThemeProvider'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { config } from '@/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { WagmiProvider } from 'wagmi'
import '@rainbow-me/rainbowkit/styles.css';
import { OTCProvider } from '@/contexts/OTCContext';

const client = new QueryClient();

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={client}>
          <RainbowKitProvider>
            <OTCProvider>
              {children}
            </OTCProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}

export default Providers;
