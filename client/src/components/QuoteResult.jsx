import './QuoteResult.css';

const EQUIPMENT_LABELS = {
  VAN:                'Dry Van',
  STRAIGHT_BOX_TRUCK: 'Straight Box Truck',
};

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function QuoteResult({ quote }) {
  const { customerQuote, ratePerMile, miles, equipmentType, originZip, destinationZip, isMock } = quote;

  return (
    <div className="result" role="region" aria-label="Quote result">
      <div className="result-divider" />

      <div className="result-header">
        <span className="result-label">Your All-In Freight Quote</span>
        {isMock && (
          <span className="mock-badge" title="Using demo rates — connect DAT credentials for live pricing">
            Demo Rate
          </span>
        )}
      </div>

      <div className="quote-total">{fmt(customerQuote)}</div>

      <div className="result-meta">
        <div className="meta-item">
          <span className="meta-label">Rate / Mile</span>
          <span className="meta-value">${ratePerMile.toFixed(2)}</span>
        </div>
        <div className="meta-divider" />
        <div className="meta-item">
          <span className="meta-label">Est. Miles</span>
          <span className="meta-value">{miles.toLocaleString()}</span>
        </div>
        <div className="meta-divider" />
        <div className="meta-item">
          <span className="meta-label">Equipment</span>
          <span className="meta-value">{EQUIPMENT_LABELS[equipmentType] ?? equipmentType}</span>
        </div>
      </div>

      <div className="lane-info">
        <span className="lane-zip">{originZip}</span>
        <span className="lane-arrow">&#8594;</span>
        <span className="lane-zip">{destinationZip}</span>
      </div>

      <p className="result-disclaimer">
        Quote is valid for today&apos;s market conditions. Rates are subject to capacity availability.
        Contact us to book this shipment.
      </p>

    </div>
  );
}
