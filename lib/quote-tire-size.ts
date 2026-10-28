type SizeOption = { id?: string; tire_size?: string | null };
type SizeQuote = { tire_size?: string | null; selected_option_id?: string | null; quote_options?: SizeOption[] };

// Older quotes have only a shared size. New comparison choices keep their own.
export function quoteOptionSize(quote: SizeQuote, option: SizeOption) {
  return option.tire_size?.trim() || quote.tire_size?.trim() || "";
}

export function quoteSizeSummary(quote: SizeQuote) {
  const selected = quote.quote_options?.find(option => option.id === quote.selected_option_id);
  if (selected) return quoteOptionSize(quote, selected);
  const sizes = [...new Set((quote.quote_options || []).map(option => quoteOptionSize(quote, option)).filter(Boolean))];
  return sizes.join(" / ") || quote.tire_size || "";
}
