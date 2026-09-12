import { ScrollText } from "lucide-react";

import { EmptyState, Skeleton, Surface } from "@/components/kit/Surface";
import { useAuditLog } from "@/features/admin/queries";
import { clockTime, shortDate } from "@/lib/time";
import { AdminPage } from "./AdminLayout";
import { actionLabel } from "./labels";
import { Table, Td, Th } from "./table";

export function AdminAuditLog() {
  const log = useAuditLog(200);

  return (
    <AdminPage
      title="Audit log"
      subtitle="Every change made from the admin panel, and every ID document opened. The latest 200 entries."
    >
      <Surface>
        {log.isLoading ? (
          <Skeleton className="h-64" />
        ) : !log.data?.length ? (
          <EmptyState icon={ScrollText} title="Nothing logged yet" />
        ) : (
          <Table minWidth={760}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Admin</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {log.data.map((entry) => (
                <tr key={entry.id}>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {shortDate(entry.created_at)} · {clockTime(entry.created_at)}
                  </Td>
                  <Td className="whitespace-nowrap">{entry.admin_name}</Td>
                  <Td>{actionLabel(entry.action)}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {entry.target_type}
                    {entry.target_id && (
                      <span className="ml-1.5 font-mono text-[12px]" title={entry.target_id}>
                        {entry.target_id.slice(0, 8)}
                      </span>
                    )}
                  </Td>
                  <Td className="max-w-[320px] text-ink-muted">
                    <span className="line-clamp-2">{entry.note || "—"}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Surface>
    </AdminPage>
  );
}
