import { useState, useCallback } from 'react';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://fire-gateway.onrender.com';

const PIPELINE_STEPS = [
  { id: 'signals', label: '🔍 Searching company signals...', completedLabel: 'Signals captured' },
  { id: 'research', label: '🧠 Generating account insights...', completedLabel: 'Account brief generated' },
  { id: 'email', label: '✉️ Writing personalized email...', completedLabel: 'Email generated' },
  { id: 'sent', label: '📤 Sending email...', completedLabel: 'Email sent' },
];

function App() {
  const [form, setForm] = useState({ company: '', email: '', icp: '' });
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [requestId, setRequestId] = useState(null);

  const handleChange = useCallback((e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const runAgent = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentStep(0);
    setRequestId(null);

    try {
      // Simulate step progression while waiting for the actual API call
      const stepInterval = setInterval(() => {
        setCurrentStep(prev => {
          if (prev < 2) return prev + 1;
          return prev;
        });
      }, 4000);

      const response = await fetch(`${API_URL}/run-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      clearInterval(stepInterval);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Agent execution failed');
      }

      setResult(data.data || data);
      setRequestId(data.requestId);
      setCurrentStep(3); // All steps completed
    } catch (err) {
      setError(err.message);
      setCurrentStep(-1);
    } finally {
      setLoading(false);
    }
  }, [form]);

  const getStepStatus = (index) => {
    if (!loading && !result) return 'pending';
    if (result) return 'completed';
    if (index < currentStep) return 'completed';
    if (index === currentStep) return 'active';
    return 'pending';
  };

  const getStepIcon = (status) => {
    switch (status) {
      case 'completed': return '✓';
      case 'active': return '⟳';
      case 'error': return '✕';
      default: return '○';
    }
  };

  const getSentStatusInfo = (status) => {
    switch (status) {
      case 'sent': return { className: 'sent', icon: '✅', text: 'Email sent successfully' };
      case 'failed': return { className: 'failed', icon: '❌', text: 'Email delivery failed' };
      case 'skipped_no_smtp': return { className: 'skipped', icon: '⚠️', text: 'Skipped — SMTP not configured' };
      default: return { className: 'skipped', icon: '⏭️', text: `Status: ${status}` };
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header__logo">
          <span className="header__icon">🔥</span>
          <h1 className="header__title">FireReach</h1>
        </div>
        <p className="header__subtitle">Autonomous Outreach Engine — Signal-Driven Email Personalization</p>
      </header>

      {/* Form Section */}
      <section className="form-section card">
        <h2 className="card__title">🎯 Configure Outreach</h2>
        <form className="form" onSubmit={runAgent}>
          <div className="form-group">
            <label htmlFor="icp">Ideal Customer Profile (ICP)</label>
            <textarea
              id="icp"
              name="icp"
              placeholder="e.g., B2B SaaS companies with 50-500 employees looking for developer tooling solutions"
              value={form.icp}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="company">Target Company</label>
            <input
              id="company"
              name="company"
              type="text"
              placeholder="e.g., Notion, Vercel, Stripe"
              value={form.company}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="email">Recipient Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="e.g., outreach@company.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !form.company || !form.email || !form.icp}
          >
            {loading ? '⟳ Running FireReach Agent...' : '🚀 Run FireReach Agent'}
          </button>
        </form>
      </section>

      {/* Error */}
      {error && (
        <div className="error-banner">
          <span>❌</span>
          <span>{error}</span>
        </div>
      )}

      {/* Progress Tracker */}
      {(loading || result) && (
        <section className="results-section">
          <div className="card progress-tracker">
            <h2 className="card__title">📡 Agent Pipeline</h2>
            <div className="progress-steps">
              {PIPELINE_STEPS.map((step, index) => {
                const status = getStepStatus(index);
                return (
                  <div key={step.id} className="progress-step" style={{ animationDelay: `${index * 0.1}s` }}>
                    <div className={`step-icon ${status}`}>
                      {getStepIcon(status)}
                    </div>
                    <span className={`step-label ${status}`}>
                      {status === 'completed' ? step.completedLabel : step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Loading Shimmer */}
          {loading && (
            <>
              <div className="loading-shimmer" style={{ animationDelay: '0s' }} />
              <div className="loading-shimmer" style={{ animationDelay: '0.2s' }} />
            </>
          )}

          {/* Signals */}
          {result?.signals && result.signals.length > 0 && (
            <div className="card" style={{ animation: 'fadeInUp 0.4s ease-out' }}>
              <h2 className="card__title">📊 Captured Signals ({result.signals.length})</h2>
              <div className="signals-grid">
                {result.signals.map((signal, index) => (
                  <div
                    className="signal-card"
                    key={index}
                    style={{ animationDelay: `${index * 0.08}s` }}
                  >
                    <div className="signal-card__header">
                      <span className={`signal-badge ${signal.type}`}>
                        {signal.type.replace('_', ' ')}
                      </span>
                      <span className="signal-score">⚡ {signal.score}</span>
                    </div>
                    <div className="signal-card__title">{signal.title}</div>
                    <div className="signal-card__snippet">{signal.snippet}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Account Brief */}
          {result?.brief && (
            <div className="card" style={{ animation: 'fadeInUp 0.4s ease-out 0.1s both' }}>
              <h2 className="card__title">🧠 Account Brief</h2>
              <div className="brief-content">{result.brief}</div>
            </div>
          )}

          {/* Generated Email */}
          {result?.emailContent && (
            <div className="card" style={{ animation: 'fadeInUp 0.4s ease-out 0.2s both' }}>
              <h2 className="card__title">✉️ Generated Email</h2>
              <div className="email-preview">
                {result.emailSubject && (
                  <div className="email-subject">
                    Subject: {result.emailSubject}
                  </div>
                )}
                <div className="email-body">{result.emailContent}</div>
              </div>
              {result.sentStatus && (
                <div className={`status-badge ${getSentStatusInfo(result.sentStatus).className}`}>
                  <span>{getSentStatusInfo(result.sentStatus).icon}</span>
                  <span>{getSentStatusInfo(result.sentStatus).text}</span>
                </div>
              )}
            </div>
          )}

          {/* Execution Trace */}
          {result?.trace && result.trace.length > 0 && (
            <div className="card" style={{ animation: 'fadeInUp 0.4s ease-out 0.3s both' }}>
              <h2 className="card__title">🔗 Agent Reasoning Trace</h2>
              <div className="progress-steps">
                {result.trace.map((entry, index) => (
                  <div key={index} className="progress-step">
                    <div className={`step-icon ${entry.step.includes('error') ? 'error' : 'completed'}`}>
                      {entry.step.includes('error') ? '✕' : '✓'}
                    </div>
                    <span className={`step-label ${entry.step.includes('error') ? 'error' : 'completed'}`}>
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Request ID */}
          {requestId && (
            <div className="request-id">Request ID: {requestId}</div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
