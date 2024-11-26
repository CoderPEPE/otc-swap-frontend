"use client";
import { createContext, useContext, useEffect, useState } from "react";
import OTCClient from "@/services/otcClient";
import OTCSwapABI from "@/services/abi/OTCSwap.json";
import { ethers } from "ethers";

interface OTCContextType {
  client: OTCClient | null;
  loading: boolean;
  error: string | null;
}

const OTCContext = createContext<OTCContextType>({
  client: null,
  loading: true,
  error: null,
});

export function OTCProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<OTCClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  useEffect(() => {
    const handleProviderChange = async () => {
      if (typeof window.ethereum !== "undefined") {
        const newProvider = new ethers.BrowserProvider(window.ethereum);
        setProvider(newProvider);
      }
    };

    handleProviderChange();

    window.ethereum.on("chainChanged", handleProviderChange);

    return () => {
      window.ethereum.removeListener("chainChanged", handleProviderChange);
    };
  }, []);

  useEffect(() => {
    const initClient = async () => {
      if (!provider) return;

      try {
        const newClient = new OTCClient(
          process.env.NEXT_PUBLIC_OTCSWAP_ADDRESS!,
          OTCSwapABI.abi,
          provider
        );
        newClient.connect(await provider.getSigner());
        setClient(newClient);
      } catch (err) {
        setError("Failed to initialize OTC client");
      } finally {
        setLoading(false);
      }
    };

    initClient();
  }, [provider]);

  return (
    <OTCContext.Provider value={{ client, loading, error }}>
      {children}
    </OTCContext.Provider>
  );
}

export const useOTC = () => useContext(OTCContext);
