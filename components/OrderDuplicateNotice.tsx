export default function OrderDuplicateNotice({ relatedOrderIds }: { relatedOrderIds?: number[] }) {
  if (!relatedOrderIds?.length) return null;
  return <div role="note" style={{ padding: "10px 12px", marginTop: 12, border: "1px solid #fcd34d", borderRadius: 10, background: "#fffbeb", color: "#92400e", fontSize: 13, overflowWrap: "anywhere" }}>
    <strong>Possible duplicate — check before approving.</strong>{" "}
    The same customer and job/PO number appear on order{relatedOrderIds.length === 1 ? "" : "s"}{" "}
    {relatedOrderIds.slice(0, 5).map(id => `#${id}`).join(", ")}{relatedOrderIds.length > 5 ? ` and ${relatedOrderIds.length - 5} more` : ""}.
    {" "}This is a separate request. Approving it creates its own job; nothing is automatically combined.
  </div>;
}
