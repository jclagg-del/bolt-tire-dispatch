type Props = {
  internal: boolean;
  quantity: number;
  sort: string;
  onQuantityChange: (quantity: number) => void;
  onSortChange: (sort: string) => void;
};

export default function TireResultControls({ internal, quantity, sort, onQuantityChange, onSortChange }: Props) {
  return <div className="tire-beta-result-controls">
    <label>
      Quantity
      <select value={quantity} onChange={event => onQuantityChange(Number(event.target.value))}>
        {[1, 2, 3, 4, 5, 6].map(item => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
    <label>
      Sort by
      <select aria-label="Sort tires" value={sort} onChange={event => onSortChange(event.target.value)}>
        <option value="price">Lowest installed price</option>
        <option value="availability">Best availability</option>
        {internal && <option value="margin">Best gross profit</option>}
      </select>
    </label>
  </div>;
}
