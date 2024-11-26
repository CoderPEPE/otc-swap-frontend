import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  arbitrum,
  base,
  Chain,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from "wagmi/chains";

const hardhat = {
  id: 1337,
  name: "Hardhat",
  nativeCurrency: { name: "Hardhat", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
} as const satisfies Chain;

export const config = getDefaultConfig({
  appName: "otc-swap",
  projectId: "04e7cc6f74497e69736ef1bf0d481f5b",
  chains: [mainnet, polygon, sepolia, hardhat],
  ssr: true,
});
