import { requestStatusLabels, type RequestStatus } from "@/modules/requisitions/schema";

const statusClass: Record<RequestStatus, string> = {
  PENDING: "bg-amber-50 text-amber-950",
  APPROVED: "bg-emerald-50 text-emerald-950",
  REJECTED: "bg-rose-50 text-rose-950",
};

export function RequestStatusLabel({ status }: { status: RequestStatus }) {
  return <span className={`inline-flex rounded-md px-2.5 py-1 text-sm font-medium ${statusClass[status]}`}>{requestStatusLabels[status]}</span>;
}
