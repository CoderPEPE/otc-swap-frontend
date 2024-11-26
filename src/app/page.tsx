"use client";
import { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
  Button,
  TextField,
  Grid,
  CircularProgress,
  Alert,
} from "@mui/material";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useOTC } from "@/contexts/OTCContext";
import { Order, OrderParams, TokenDetails } from "@/types";
import { ethers } from "ethers";
import { useAccount } from "wagmi";

export default function Home() {
  const { client, loading: clientLoading } = useOTC();
  const { address } = useAccount();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [orderCreationFee, setOrderCreationFee] = useState<bigint>(BigInt(0));
  const [buyAmountInput, setBuyAmountInput] = useState<string>("");
  const [sellAmountInput, setSellAmountInput] = useState<string>("");
  const [newOrder, setNewOrder] = useState<OrderParams>({
    sellToken: "",
    sellAmount: BigInt(0),
    buyToken: "",
    buyAmount: BigInt(0),
  });

  const [sellTokenDetails, setSellTokenDetails] = useState<TokenDetails | null>(
    null
  );
  const [buyTokenDetails, setBuyTokenDetails] = useState<TokenDetails | null>(
    null
  );
  const [tokenError, setTokenError] = useState({ sell: "", buy: "" });
  const [expiryInfo, setExpiryInfo] = useState<{
    orderExpiry: number;
    gracePeriod: number;
  }>({
    orderExpiry: 7 * 24 * 60 * 60,
    gracePeriod: 7 * 24 * 60 * 60,
  });

  useEffect(() => {
    loadOrders();
    loadOrderCreationFee();
    if (client) {
      client.getOrderExpiryInfo().then(setExpiryInfo);
    }
  }, [client, address]);

  const loadOrderCreationFee = async () => {
    if (!client) return;
    try {
      const fee = await client.getOrderCreationFee().catch(() => BigInt(0));
      setOrderCreationFee(fee);
    } catch (err) {
      console.error("Failed to load order creation fee:", err);
      setOrderCreationFee(BigInt(0));
    }
  };

  const loadOrders = async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.getActiveOrders();
      setOrders(result.orders);
    } catch (err) {
      console.error("Failed to load orders:", err);
      setError("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const validateAndGetTokenDetails = async (
    address: string,
    type: "sell" | "buy"
  ) => {
    setTokenError((prev) => ({ ...prev, [type]: "" }));

    if (!ethers.isAddress(address)) {
      setTokenError((prev) => ({ ...prev, [type]: "Invalid address" }));
      if (type === "sell") setSellTokenDetails(null);
      else setBuyTokenDetails(null);
      return;
    }

    if (!client) return;

    try {
      const details = await client.getTokenDetails(address);
      if (type === "sell")
        setSellTokenDetails({ ...details, decimals: details.decimals || 18 });
      else setBuyTokenDetails({ ...details, decimals: details.decimals || 18 });
    } catch (err) {
      console.log("Error", err);
      setTokenError((prev) => ({ ...prev, [type]: "Invalid token" }));
      if (type === "sell") setSellTokenDetails(null);
      else setBuyTokenDetails(null);
    }
  };

  const handleCreateOrder = async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      await client.createOrder(newOrder);
      await loadOrders();
      setNewOrder({
        sellToken: "",
        sellAmount: BigInt(0),
        buyToken: "",
        buyAmount: BigInt(0),
      });
      setSellTokenDetails(null);
      setBuyTokenDetails(null);
      setTabValue(0); // Switch to orders tab
    } catch (err) {
      console.error("Failed to create order:", err);
      setError("Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  const handleFillOrder = async (
    orderId: number,
    buyToken: string,
    buyAmount: bigint
  ) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      await client.fillOrder({ orderId, buyToken, buyAmount });
      await loadOrders();
    } catch (err) {
      console.error("Failed to fill order:", err);
      setError("Failed to fill order");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      await client.cancelOrder(orderId);
      await loadOrders();
    } catch (err) {
      console.error("Failed to cancel order:", err);
      setError("Failed to cancel order");
    } finally {
      setLoading(false);
    }
  };

  const formatTokenAmount = (amount: bigint, decimals: number = 18) => {
    return ethers.formatUnits(amount, decimals);
  };

  const parseTokenAmount = (amount: string, decimals: number = 18): bigint => {
    try {
      return ethers.parseUnits(amount || "0", decimals);
    } catch {
      return BigInt(0);
    }
  };

  if (clientLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", height: "100vh", p: 3 }}
    >
      <Box sx={{ position: "absolute", top: 16, right: 16 }}>
        <ConnectButton />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ mt: 8, p: 3 }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
        >
          <Tab label="Active Orders" />
          <Tab label="Create Order" />
        </Tabs>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
            <CircularProgress />
          </Box>
        )}

        {tabValue === 0 && !loading && (
          <Box sx={{ mt: 3 }}>
            {orders.length > 0 ? (
              <Grid container spacing={2}>
                {orders.map((order) => (
                  <Grid item xs={12} key={order.orderId}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Order #{order.orderId}
                      </Typography>
                      <Typography>Maker: {order.maker}</Typography>
                      <Box sx={{ mt: 1 }}>
                        <Typography>
                          Sell: {formatTokenAmount(BigInt(order.sell.amount))}{" "}
                          {order.sell.token}
                        </Typography>
                        <Typography>
                          Buy: {formatTokenAmount(BigInt(order.buy.amount))}{" "}
                          {order.buy.token}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Created:{" "}
                          {new Date(order.createdAt * 1000).toLocaleString()}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Expires:{" "}
                          {new Date(
                            (order.createdAt + expiryInfo.orderExpiry) * 1000
                          ).toLocaleString()}
                        </Typography>
                      </Box>
                      <Box sx={{ mt: 2 }}>
                        {address !== order.maker ? (
                          <Button
                            variant="contained"
                            onClick={() =>
                              handleFillOrder(
                                order.orderId,
                                order.buy.token,
                                BigInt(order.buy.amount)
                              )
                            }
                            disabled={
                              loading ||
                              Date.now() / 1000 >
                                order.createdAt + expiryInfo.orderExpiry
                            }
                          >
                            {Date.now() / 1000 >
                            order.createdAt + expiryInfo.orderExpiry
                              ? "Expired"
                              : "Fill Order"}
                          </Button>
                        ) : (
                          <Button
                            variant="outlined"
                            color="error"
                            onClick={() => handleCancelOrder(order.orderId)}
                            disabled={
                              loading ||
                              Date.now() / 1000 >
                                order.createdAt +
                                  expiryInfo.orderExpiry +
                                  expiryInfo.gracePeriod
                            }
                          >
                            {Date.now() / 1000 >
                            order.createdAt +
                              expiryInfo.orderExpiry +
                              expiryInfo.gracePeriod
                              ? "Grace Period Ended"
                              : "Cancel Order"}
                          </Button>
                        )}
                      </Box>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Typography sx={{ mt: 2 }}>No active orders</Typography>
            )}
          </Box>
        )}

        {tabValue === 1 && !loading && (
          <Box sx={{ mt: 3 }}>
            <Typography sx={{ mb: 2 }}>
              Order Creation Fee:{" "}
              {orderCreationFee > 0
                ? `${formatTokenAmount(orderCreationFee)} ETH`
                : "Not available"}
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Sell Token Address"
                  value={newOrder.sellToken}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewOrder((prev) => ({ ...prev, sellToken: value }));
                    validateAndGetTokenDetails(value, "sell");
                  }}
                  error={!!tokenError.sell}
                  helperText={tokenError.sell}
                />
                {sellTokenDetails && (
                  <Box sx={{ mt: 1, ml: 1 }}>
                    <Typography variant="body2">
                      Token: {sellTokenDetails.name} ({sellTokenDetails.symbol})
                    </Typography>
                    <Typography variant="body2">
                      Balance:{" "}
                      {formatTokenAmount(
                        sellTokenDetails.balance,
                        sellTokenDetails.decimals
                      )}
                    </Typography>
                  </Box>
                )}
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Sell Amount"
                  type="string"
                  value={sellAmountInput}
                  onChange={(e) => {
                    setSellAmountInput(e.target.value);
                    setNewOrder((prev) => ({
                      ...prev,
                      sellAmount: parseTokenAmount(
                        e.target.value,
                        sellTokenDetails?.decimals
                      ),
                    }));
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Buy Token Address"
                  value={newOrder.buyToken}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewOrder((prev) => ({ ...prev, buyToken: value }));
                    validateAndGetTokenDetails(value, "buy");
                  }}
                  error={!!tokenError.buy}
                  helperText={tokenError.buy}
                />
                {buyTokenDetails && (
                  <Box sx={{ mt: 1, ml: 1 }}>
                    <Typography variant="body2">
                      Token: {buyTokenDetails.name} ({buyTokenDetails.symbol})
                    </Typography>
                    <Typography variant="body2">
                      Balance:{" "}
                      {formatTokenAmount(
                        buyTokenDetails.balance,
                        buyTokenDetails.decimals
                      )}
                    </Typography>
                  </Box>
                )}
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Buy Amount"
                  type="string"
                  value={buyAmountInput}
                  onChange={(e) => {
                    setBuyAmountInput(e.target.value);
                    setNewOrder((prev) => ({
                      ...prev,
                      buyAmount: parseTokenAmount(
                        e.target.value,
                        buyTokenDetails?.decimals
                      ),
                    }));
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  onClick={handleCreateOrder}
                  disabled={
                    !client ||
                    !!tokenError.sell ||
                    !!tokenError.buy ||
                    !newOrder.sellToken ||
                    !newOrder.buyToken ||
                    newOrder.sellAmount <= 0 ||
                    newOrder.buyAmount <= 0
                  }
                >
                  Create Order
                </Button>
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
