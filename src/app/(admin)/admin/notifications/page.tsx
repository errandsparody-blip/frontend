/**
 * Admin portal — /admin/notifications
 *
 * Same shared NotificationsPage component as the vendor route. Different
 * eyebrow text + the layout-injected admin sidebar make this feel like
 * an admin page; the underlying notification API is the same endpoint
 * scoped to the calling user (admin = userId, vendor = vendorId).
 */

import { NotificationsPage } from "@/components/portal/notifications-page";

export default function Page(): JSX.Element {
  return <NotificationsPage eyebrow="Admin console" />;
}
