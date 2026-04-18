export interface Product {
  productName: string;
  productId: string;
  category: string;
  costPrice: number; // harga modal
  priceProduct: number; // harga jual
  profit: number; // auto-calculated: priceProduct - costPrice
  format: string; // e.g. "email|password", "file"
  totalProdukTerjual: number;
  description: string;
  warranty?: string;
  activation?: string;
  email?: string;
  usage?: string;
  // KoalaStore fields
  source?: "koalastore";
  variant_code?: string;
  ks_base_price?: number; // original KoalaStore price before profit markup
  stockCount?: number;
}

export interface Transaction {
  id: string;
  chatId: number;
  username: string;
  productName: string;
  productId: string;
  quantity: number;
  amount: number;
  profit: number;
  method: "saweria" | "qris";
  status: "pending" | "paid" | "delivered" | "expired" | "cancelled" | "failed";
  reference: string;
  createdAt: string;
  paidAt?: string;
  deliveredData?: string;
}

export interface SaweriaConfig {
  // token moved to env: SAWERIA_TOKEN
  user_id: string;
  username: string;
  email: string;
}

export interface GatekeeperConfig {
  enabled: boolean;
  channel: { id: string; link: string };
  group: { id: string; link: string };
}

export interface KoalaStoreConfig {
  // api_key moved to env: KOALASTORE_API_KEY
  is_active: boolean;
}

export interface OrderNotifications {
  new: boolean;
  paid: boolean;
  expired: boolean;
  cancelled: boolean;
}

export interface Config {
  telegram_bot_token: string;
  saweria_token: string;
  saweria_token_exp?: number; // JWT expiry timestamp
  saweria_auto_switched?: boolean; // true if payment was auto-switched to QRIS due to expired token
  koalastore_api_key: string;
  saweria: SaweriaConfig;
  store_name: string;
  admin_contact_telegram: string;
  operating_hours: string;
  gatekeeper: GatekeeperConfig;
  koalastore: KoalaStoreConfig;
  order_notifications: OrderNotifications;
  payment_method: "saweria" | "qris";
}

export interface Master {
  id: string;
  addedAt: string;
}
