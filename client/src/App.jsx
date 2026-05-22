import { useState } from 'react';
import Header from './components/Header';
import QuoteForm from './components/QuoteForm';
import QuoteResult from './components/QuoteResult';
import './App.css';

export default function App() {
  const [quote, setQuote]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleGetQuote(formData) {
    setLoading(true);
    setError('');
    setQuote(null);

    try {
      const res = await fetch('/api/rate/quote', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setQuote(data);
    } catch {
      setError('Unable to connect to the server. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <Header />
      <main className="main">
        <div className="card">
          <h2 className="card-title">Get an Instant Freight Quote</h2>
          <p className="card-subtitle">
            Enter your shipment details below to receive a competitive rate in seconds.
          </p>
          <QuoteForm onSubmit={handleGetQuote} loading={loading} />
          {error && (
            <div className="error-banner" role="alert">
              <span className="error-icon">&#9888;</span> {error}
            </div>
          )}
          {quote && <QuoteResult quote={quote} />}
        </div>
      </main>
      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} Freight Flex LLC &mdash; All rates are estimates and subject to availability.</p>
      </footer>
    </div>
  );
}
