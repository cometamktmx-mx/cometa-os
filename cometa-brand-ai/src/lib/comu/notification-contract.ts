export type NotificationAudience = "SELLER" | "BUYER";
export type ComuNotification = {
  id: string;
  audience: NotificationAudience;
  seller_id: string | null;
  source_table: "order" | "fulfillment";
  source_event_id: string;
  event_kind: string;
  title: string;
  body: string;
  deep_link: string;
  metadata: { orderNumber: string; scope: "MASTER" | "SUBORDER" };
  created_at: string;
  read_at: string | null;
};
export type NotificationInbox = { notifications: ComuNotification[]; unreadCount: number };
