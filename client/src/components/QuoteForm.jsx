import { useState } from 'react';
import './QuoteForm.css';

const EQUIPMENT_OPTIONS = [
  { value: 'VAN',     label: 'Dry Van' },
  { value: 'REEFER',  label: 'Reefer (Temperature Controlled)' },
  { value: 'FLATBED', label: 'Flatbed' },
];

const ZIP_RE = /^\d{5}$/;

export default function QuoteForm({ onSubmit, loading }) {
  const [form, setForm] = useState({
    originZip:      '',
    destinationZip: '',
    equipmentType:  'VAN',
  });

  const [fieldErrors, setFieldErrors] = useState({});

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  }

  function validate() {
    const errors = {};
    if (!ZIP_RE.test(form.originZip))      errors.originZip      = 'Enter a valid 5-digit ZIP code.';
    if (!ZIP_RE.test(form.destinationZip)) errors.destinationZip = 'Enter a valid 5-digit ZIP code.';
    if (form.originZip === form.destinationZip && ZIP_RE.test(form.originZip)) {
      errors.destinationZip = 'Destination must differ from origin.';
    }
    return errors;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    onSubmit(form);
  }

  return (
    <form className="quote-form" onSubmit={handleSubmit} noValidate>
      <div className="field-group">
        <div className={`field ${fieldErrors.originZip ? 'field--error' : ''}`}>
          <label htmlFor="originZip" className="label">Origin ZIP Code</label>
          <input
            id="originZip"
            name="originZip"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 30301"
            maxLength={5}
            value={form.originZip}
            onChange={handleChange}
            className="input"
            disabled={loading}
            aria-describedby={fieldErrors.originZip ? 'originZip-err' : undefined}
          />
          {fieldErrors.originZip && (
            <span id="originZip-err" className="field-error">{fieldErrors.originZip}</span>
          )}
        </div>

        <div className={`field ${fieldErrors.destinationZip ? 'field--error' : ''}`}>
          <label htmlFor="destinationZip" className="label">Destination ZIP Code</label>
          <input
            id="destinationZip"
            name="destinationZip"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 90001"
            maxLength={5}
            value={form.destinationZip}
            onChange={handleChange}
            className="input"
            disabled={loading}
            aria-describedby={fieldErrors.destinationZip ? 'destinationZip-err' : undefined}
          />
          {fieldErrors.destinationZip && (
            <span id="destinationZip-err" className="field-error">{fieldErrors.destinationZip}</span>
          )}
        </div>
      </div>

      <div className="field">
        <label htmlFor="equipmentType" className="label">Equipment Type</label>
        <div className="equipment-grid">
          {EQUIPMENT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`equipment-card ${form.equipmentType === opt.value ? 'equipment-card--selected' : ''}`}
            >
              <input
                type="radio"
                name="equipmentType"
                value={opt.value}
                checked={form.equipmentType === opt.value}
                onChange={handleChange}
                disabled={loading}
              />
              <span className="equipment-label">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <button type="submit" className="submit-btn" disabled={loading}>
        {loading ? (
          <span className="btn-loading">
            <span className="spinner" aria-hidden="true" /> Getting Your Quote&hellip;
          </span>
        ) : (
          'Get My Freight Quote'
        )}
      </button>
    </form>
  );
}
