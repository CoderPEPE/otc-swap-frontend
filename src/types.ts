interface OrderParams {
  taker?: string;
  sellToken: string;
  sellAmount: bigint;
  buyToken: string;
  buyAmount: bigint;
}

interface FillOrderParams {
  orderId: number;
  buyToken: string;
  buyAmount: bigint;
}

interface GetActiveOrdersParams {
  fromBlock?: number;
  toBlock?: number | 'latest';
  makerAddress?: string | null;
  sellToken?: string | null;
  buyToken?: string | null;
}

interface TokenDetails {
  name: string;
  symbol: string;
  decimals: number;
  balance: bigint;
}

interface Order {
  orderId: number;
  maker: string;
  taker: string;
  sell: {
    token: string;
    amount: string;
  };
  buy: {
    token: string;
    amount: string;
  };
  createdAt: number;
  orderCreationFee: string;
  isActive: boolean;
}

export type { Order, OrderParams, FillOrderParams, GetActiveOrdersParams, TokenDetails };
