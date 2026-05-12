/**
 * Vendor portal — /notifications
 *
 * Thin route shim around the shared NotificationsPage. The shared
 * component contains the actual rendering + data hooks so the admin
 * and vendor pages stay byte-for-byte identical in behaviour.
 */

import { NotificationsPage } from "@/components/portal/notifications-page";

export default function Page(): JSX.Element {
  return <NotificationsPage eyebrow="Vendor portal" />;
}
