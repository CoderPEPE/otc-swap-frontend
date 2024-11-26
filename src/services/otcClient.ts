import { ethers } from "ethers";
import {
  FillOrderParams,
  GetActiveOrdersParams,
  Order,
  OrderParams,
  TokenDetails,
} from "@/types";

type EventLog = ethers.Log & {
  args: Record<string, any>;
  fragment: { name: string };
};

class OTCClient {
  private provider: ethers.Provider;
  private contract: ethers.Contract;
  public signer: ethers.Signer | null = null;

  constructor(
    contractAddress: string,
    contractABI: any[],
    provider: ethers.Provider
  ) {
    this.provider = provider;
    this.contract = new ethers.Contract(contractAddress, contractABI, provider);
  }

  async connect(signer: ethers.Signer): Promise<void> {
    this.signer = signer;
    this.contract = this.contract.connect(signer) as ethers.Contract;
  }

  async setProvider(provider: ethers.Provider) {
    this.provider = provider;
    this.contract = this.contract.connect(this.provider) as ethers.Contract;
  }

  async createOrder(params: OrderParams) {
    if (!this.signer) throw new Error("No signer connected");
    const {
      taker = ethers.ZeroAddress,
      sellToken,
      sellAmount,
      buyToken,
      buyAmount,
    } = params;

    try {
      // Get current order creation fee
      const fee = await this.contract.orderCreationFee();
      const minFee = (fee * BigInt(90)) / BigInt(100); // MIN_FEE_PERCENTAGE = 90
      const maxFee = (fee * BigInt(150)) / BigInt(100); // MAX_FEE_PERCENTAGE = 150

      // Validate tokens
      if (sellToken === ethers.ZeroAddress)
        throw new Error("Invalid sell token");
      if (buyToken === ethers.ZeroAddress) throw new Error("Invalid buy token");
      if (sellToken === buyToken) throw new Error("Cannot swap same token");
      if (sellAmount <= 0) throw new Error("Invalid sell amount");
      if (buyAmount <= 0) throw new Error("Invalid buy amount");

      // Approve sell token
      const sellTokenContract = new ethers.Contract(
        sellToken,
        [
          "function approve(address spender, uint256 amount) public returns (bool)",
        ],
        this.signer
      );

      const approveTx = await sellTokenContract.approve(
        this.contract.target,
        sellAmount
      );
      await approveTx.wait();

      // Create order with fee
      const tx = await this.contract.createOrder(
        taker,
        sellToken,
        sellAmount,
        buyToken,
        buyAmount,
        { value: fee } // Send the creation fee
      );
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log: any) => (log as EventLog).fragment?.name === "OrderCreated"
      ) as EventLog | undefined;

      if (!event) throw new Error("OrderCreated event not found");

      return {
        orderId: event.args.orderId,
        txHash: receipt.hash,
        maker: event.args.maker,
        creation: {
          timestamp: Number(event.args.timestamp),
          blockNumber: receipt.blockNumber,
          fee: event.args.orderCreationFee,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create order: ${error.message}`);
      }
      throw error;
    }
  }

  async fillOrder(params: FillOrderParams) {
    if (!this.signer) throw new Error("No signer connected");
    const { orderId, buyToken, buyAmount } = params;

    try {
      // Get order details to validate
      const order = await this.contract.orders(orderId);
      if (!order) throw new Error("Order does not exist");
      if (!order.isActive) throw new Error("Order is not active");

      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime > order.timestamp + 7 * 24 * 60 * 60) {
        throw new Error("Order has expired");
      }

      if (order.taker !== ethers.ZeroAddress) {
        const signerAddress = await this.signer.getAddress();
        if (order.taker !== signerAddress) {
          throw new Error("Not authorized to fill this order");
        }
      }

      const buyTokenContract = new ethers.Contract(
        buyToken,
        [
          "function approve(address spender, uint256 amount) public returns (bool)",
          "function balanceOf(address) view returns (uint256)",
        ],
        this.signer
      );

      // Check balance
      const signerAddress = await this.signer.getAddress();
      const balance = await buyTokenContract.balanceOf(signerAddress);
      if (balance < buyAmount) {
        throw new Error("Insufficient balance for buy token");
      }

      const approveTx = await buyTokenContract.approve(
        this.contract.target,
        buyAmount
      );
      await approveTx.wait();

      const tx = await this.contract.fillOrder(orderId);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log: any) => (log as EventLog).fragment?.name === "OrderFilled"
      ) as EventLog | undefined;

      if (!event) throw new Error("OrderFilled event not found");

      return {
        orderId,
        txHash: receipt.hash,
        taker: event.args.taker,
        fill: {
          timestamp: Number(event.args.timestamp),
          blockNumber: receipt.blockNumber,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fill order: ${error.message}`);
      }
      throw error;
    }
  }

  async cancelOrder(orderId: number) {
    if (!this.signer) throw new Error("No signer connected");

    try {
      // Get order details to validate
      const order = await this.contract.orders(orderId);
      if (!order) throw new Error("Order does not exist");

      const signerAddress = await this.signer.getAddress();
      if (order.maker !== signerAddress) {
        throw new Error("Only maker can cancel order");
      }

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const gracePeriodEnd = order.timestamp + BigInt(14 * 24 * 60 * 60);
      if (currentTime > gracePeriodEnd) {
        throw new Error("Grace period has expired");
      }

      const tx = await this.contract.cancelOrder(orderId);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log: any) => (log as EventLog).fragment?.name === "OrderCanceled"
      ) as EventLog | undefined;

      if (!event) throw new Error("OrderCanceled event not found");

      return {
        orderId,
        txHash: receipt.hash,
        cancellation: {
          timestamp: Number(event.args.timestamp),
          blockNumber: receipt.blockNumber,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to cancel order: ${error.message}`);
      }
      throw error;
    }
  }

  async getActiveOrders(params: GetActiveOrdersParams = {}) {
    const {
      fromBlock = 0,
      toBlock = "latest",
      makerAddress = null,
      sellToken = null,
      buyToken = null,
    } = params;

    try {
      const createdFilter = this.contract.filters.OrderCreated();
      const filledFilter = this.contract.filters.OrderFilled();
      const canceledFilter = this.contract.filters.OrderCanceled();
      const cleanedFilter = this.contract.filters.OrderCleanedUp();
      const retryFilter = this.contract.filters.RetryOrder();

      const [
        createdEvents,
        filledEvents,
        canceledEvents,
        cleanedEvents,
        retryEvents,
      ] = await Promise.all([
        this.contract.queryFilter(createdFilter, fromBlock, toBlock),
        this.contract.queryFilter(filledFilter, fromBlock, toBlock),
        this.contract.queryFilter(canceledFilter, fromBlock, toBlock),
        this.contract.queryFilter(cleanedFilter, fromBlock, toBlock),
        this.contract.queryFilter(retryFilter, fromBlock, toBlock),
      ]);

      console.log(
        "createdEvents",
        createdEvents,
        "filledEvents",
        filledEvents,
        "canceledEvents",
        canceledEvents,
        "cleanedEvents",
        cleanedEvents,
        "retryEvents",
        retryEvents
      );
      const filledOrderIds = new Set(
        filledEvents.map((e) => (e as EventLog).args.orderId.toString())
      );
      const canceledOrderIds = new Set(
        canceledEvents.map((e) => (e as EventLog).args.orderId.toString())
      );
      const cleanedOrderIds = new Set(
        cleanedEvents.map((e) => (e as EventLog).args.orderId.toString())
      );
      const retriedOrderIds = new Set(
        retryEvents.map((e) => (e as EventLog).args.oldOrderId.toString())
      );

      // Current timestamp for expiry check
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const ORDER_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

      // Filter and map active orders
      let activeOrders = createdEvents
        .filter((event) => {
          const orderId = (event as EventLog).args.orderId.toString();
          const isExpired =
            currentTimestamp >
            Number((event as EventLog).args.timestamp) + ORDER_EXPIRY;

          return (
            !filledOrderIds.has(orderId) &&
            !canceledOrderIds.has(orderId) &&
            !cleanedOrderIds.has(orderId) &&
            !retriedOrderIds.has(orderId) &&
            !isExpired
          );
        })
        .map((event) => ({
          orderId: Number((event as EventLog).args.orderId),
          maker: (event as EventLog).args.maker,
          taker: (event as EventLog).args.taker,
          sell: {
            token: (event as EventLog).args.sellToken,
            amount: (event as EventLog).args.sellAmount.toString(),
          },
          buy: {
            token: (event as EventLog).args.buyToken,
            amount: (event as EventLog).args.buyAmount.toString(),
          },
          createdAt: Number((event as EventLog).args.timestamp),
          orderCreationFee: (
            event as EventLog
          ).args.orderCreationFee.toString(),
          isActive: true,
        }));

      if (makerAddress) {
        activeOrders = activeOrders.filter(
          (order) => order.maker.toLowerCase() === makerAddress.toLowerCase()
        );
      }
      if (sellToken) {
        activeOrders = activeOrders.filter(
          (order) => order.sell.token.toLowerCase() === sellToken.toLowerCase()
        );
      }
      if (buyToken) {
        activeOrders = activeOrders.filter(
          (order) => order.buy.token.toLowerCase() === buyToken.toLowerCase()
        );
      }

      return {
        orders: activeOrders,
        pagination: {
          hasMore: false,
          nextOffset: 0,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch active orders: ${error.message}`);
      }
      throw error;
    }
  }

  async getTokenDetails(tokenAddress: string): Promise<TokenDetails> {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function balanceOf(address) view returns (uint256)",
      ],
      this.provider
    );

    try {
      const [name, symbol, decimals] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
      ]);

      let balance = BigInt(0);
      if (this.signer) {
        const signerAddress = await this.signer.getAddress();
        balance = await tokenContract.balanceOf(signerAddress);
      }

      return { name, symbol, decimals, balance };
    } catch (error) {
      throw new Error(`Failed to get token details: ${error}`);
    }
  }

  async getOrderCreationFee(): Promise<bigint> {
    try {
      const fee = await this.contract.orderCreationFee();
      return fee;
    } catch (error) {
      console.warn("Failed to get order creation fee:", error);
      return BigInt(0);
    }
  }

  async getOrderExpiryInfo() {
    try {
      const [orderExpiry, gracePeriod] = await Promise.all([
        this.contract.ORDER_EXPIRY(),
        this.contract.GRACE_PERIOD(),
      ]);
      return {
        orderExpiry: Number(orderExpiry),
        gracePeriod: Number(gracePeriod),
      };
    } catch (error) {
      console.warn("Failed to get order expiry info:", error);
      return {
        orderExpiry: 7 * 24 * 60 * 60, // 7 days in seconds
        gracePeriod: 7 * 24 * 60 * 60, // 7 days in seconds
      };
    }
  }

  async isOrderExpired(timestamp: number): Promise<boolean> {
    const { orderExpiry } = await this.getOrderExpiryInfo();
    return Date.now() / 1000 > timestamp + orderExpiry;
  }

  async isInGracePeriod(timestamp: number): Promise<boolean> {
    const { orderExpiry, gracePeriod } = await this.getOrderExpiryInfo();
    const now = Date.now() / 1000;
    return (
      now > timestamp + orderExpiry &&
      now <= timestamp + orderExpiry + gracePeriod
    );
  }

  async cleanupExpiredOrders() {
    if (!this.signer) throw new Error("No signer connected");

    try {
      const tx = await this.contract.cleanupExpiredOrders();
      const receipt = await tx.wait();

      const cleanedEvents = receipt.logs.filter(
        (log: any) => (log as EventLog).fragment?.name === "OrderCleanedUp"
      ) as EventLog[];

      const cleanupErrorEvents = receipt.logs.filter(
        (log: any) => (log as EventLog).fragment?.name === "CleanupError"
      ) as EventLog[];

      const retryEvents = receipt.logs.filter(
        (log: any) => (log as EventLog).fragment?.name === "RetryOrder"
      ) as EventLog[];

      const feesDistributedEvents = receipt.logs.filter(
        (log: any) =>
          (log as EventLog).fragment?.name === "CleanupFeesDistributed"
      ) as EventLog[];

      return {
        txHash: receipt.hash,
        cleanedOrders: cleanedEvents.map((e) => ({
          orderId: e.args.orderId,
          maker: e.args.maker,
          timestamp: Number(e.args.timestamp),
        })),
        errors: cleanupErrorEvents.map((e) => ({
          orderId: e.args.orderId,
          reason: e.args.reason,
          timestamp: Number(e.args.timestamp),
        })),
        retries: retryEvents.map((e) => ({
          oldOrderId: e.args.oldOrderId,
          newOrderId: e.args.newOrderId,
          maker: e.args.maker,
          tries: Number(e.args.tries),
          timestamp: Number(e.args.timestamp),
        })),
        feesDistributed: feesDistributedEvents.map((e) => ({
          recipient: e.args.recipient,
          amount: e.args.amount,
          timestamp: Number(e.args.timestamp),
        })),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to cleanup expired orders: ${error.message}`);
      }
      throw error;
    }
  }
}

export default OTCClient;
