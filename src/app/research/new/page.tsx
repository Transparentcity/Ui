"use client";

import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import {
  createResearch,
  CreateResearchRequest,
  getSavedCities,
  getAvailableModels,
  type ModelGroupInfo,
} from "@/lib/apiClient";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import "../brand-styles.css";
import "./styles.css";

export default function NewResearchPage() {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently } = useAuth0();
  const router = useRouter();
  
  const [prompt, setPrompt] = useState("");
  const [cityId, setCityId] = useState<number | null>(null);
  const [maxIterations, setMaxIterations] = useState(2);
  const [maxSubquestions, setMaxSubquestions] = useState(3);
  const [modelKey, setModelKey] = useState("claude-3-5-sonnet-20241022");
  const [requireAgendaApproval, setRequireAgendaApproval] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelGroupInfo[]>([]);
  
  const [cities, setCities] = useState<any[]>([]);
  const [estimatedCost, setEstimatedCost] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load cities
  useEffect(() => {
    if (isAuthenticated) {
      getAccessTokenSilently().then(token => {
        getSavedCities(token).then(setCities).catch(console.error);
      });
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  // Load available models (same as chat)
  useEffect(() => {
    const loadModels = async () => {
      try {
        let token: string | undefined;
        try {
          token = await getAccessTokenSilently();
        } catch (e) {
          console.warn("Could not get token for models, proceeding unauthenticated", e);
        }
        const models = await getAvailableModels(token);
        setAvailableModels(models);
        const defaultKey = pickDefaultModelKey(models);
        if (defaultKey) {
          setModelKey(defaultKey);
        }
      } catch (err) {
        console.error("Failed to load models:", err);
        setAvailableModels([]);
      }
    };
    loadModels();
  }, [getAccessTokenSilently]);
  
  // Calculate cost estimate using pricing from selected model
  useEffect(() => {
    const flatModels = availableModels.flatMap((group) => group.models);
    const selected = flatModels.find((m) => m.key === modelKey);
    if (!selected) {
      setEstimatedCost(null);
      return;
    }

    // Token estimates similar to backend CostEstimator
    const agenda_input = 2000;
    const agenda_output = 1000;
    const item_input = 5000;
    const item_output = 2000;
    const synth_input = 10000;
    const synth_output = 3000;

    const total_items = maxSubquestions * (1 + maxIterations);
    const total_input_tokens = agenda_input + total_items * item_input + synth_input;
    const total_output_tokens = agenda_output + total_items * item_output + synth_output;

    const input_cost =
      (total_input_tokens / 1_000_000) * (selected.input_price ?? 0);
    const output_cost =
      (total_output_tokens / 1_000_000) * (selected.output_price ?? 0);
    const estimated = input_cost + output_cost;

    setEstimatedCost({
      estimated_cost_usd: estimated.toFixed(2),
      low_estimate_usd: (estimated * 0.7).toFixed(2),
      high_estimate_usd: (estimated * 1.3).toFixed(2),
      estimated_items: total_items,
    });
  }, [availableModels, modelKey, maxIterations, maxSubquestions]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (prompt.length < 10) {
      setError("Research question must be at least 10 characters");
      return;
    }
    
    try {
      setIsSubmitting(true);
      const token = await getAccessTokenSilently();
      
      const payload: CreateResearchRequest = {
        prompt,
        city_id: cityId,
        max_iterations: maxIterations,
        max_subquestions: maxSubquestions,
        model_key: modelKey,
        require_agenda_approval: requireAgendaApproval,
      };
      
      const response = await createResearch(payload, token);
      if (response.job_id) {
        notifyJobCreated(response.job_id);
      }
      
      // Notify ResearchList to reload
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("research:invalidate"));
      }
      
      // Redirect to research detail page or back to dashboard
      if (window.location.pathname.startsWith("/dashboard")) {
        // In dashboard view, stay in dashboard and show the new research
        window.dispatchEvent(new CustomEvent("research:created", { detail: response.report_id }));
      } else {
        router.push(`/research/${response.report_id}`);
      }
    } catch (err: any) {
      console.error("Failed to create research:", err);
      setError(err.message || "Failed to create research");
      setIsSubmitting(false);
    }
  };
  
  if (authLoading) {
    return <div className="research-page loading">Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <div className="research-page">Please log in to create research.</div>;
  }
  
  return (
    <div className="research-page">
      <div className="research-container">
        <h1>Create Deep Research</h1>
        <p className="research-subtitle">
          Investigate complex questions using multiple data sources and AI-powered analysis.
        </p>
        
        <form onSubmit={handleSubmit} className="research-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="prompt">Research Question *</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g., Is the Mission District safe? What are the crime trends?"
              rows={4}
              maxLength={2000}
              required
              className="research-textarea"
            />
            <div className="char-count">{prompt.length} / 2000 characters</div>
          </div>
          
          <div className="form-group">
            <label htmlFor="city">City (Optional)</label>
            <select
              id="city"
              value={cityId || ""}
              onChange={(e) => setCityId(e.target.value ? Number(e.target.value) : null)}
              className="research-select"
            >
              <option value="">All cities / Not specified</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.emoji} {city.display_name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={requireAgendaApproval}
                onChange={(e) => setRequireAgendaApproval(e.target.checked)}
              />
              Require agenda approval (generate plan first, then run)
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="model">Model</label>
            <select
              id="model"
              value={modelKey}
              onChange={(e) => setModelKey(e.target.value)}
              className="research-select"
            >
              {availableModels.length === 0 && (
                <option>Loading models...</option>
              )}
              {availableModels.flatMap((group) =>
                group.models.map((model) => (
                  <option key={model.key} value={model.key}>
                    {model.name} — ${Math.round(model.input_price || 0)} in / ${Math.round(model.output_price || 0)} out (per 1M tokens)
                  </option>
                ))
              )}
            </select>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="iterations">
                Max Iterations: {maxIterations}
                <span className="help-text"> (0-5, depth of investigation)</span>
              </label>
              <input
                type="range"
                id="iterations"
                min="0"
                max="5"
                value={maxIterations}
                onChange={(e) => setMaxIterations(Number(e.target.value))}
                className="research-slider"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="subquestions">
                Max Subquestions: {maxSubquestions}
                <span className="help-text"> (0-10, breadth per iteration)</span>
              </label>
              <input
                type="range"
                id="subquestions"
                min="0"
                max="10"
                value={maxSubquestions}
                onChange={(e) => setMaxSubquestions(Number(e.target.value))}
                className="research-slider"
              />
            </div>
          </div>
          
          {estimatedCost && (
            <div className="cost-estimate">
              <h3>Estimated Cost</h3>
              <div className="cost-breakdown">
                <div className="cost-main">${estimatedCost.estimated_cost_usd}</div>
                <div className="cost-range">
                  Range: ${estimatedCost.low_estimate_usd} - ${estimatedCost.high_estimate_usd}
                </div>
                <div className="cost-items">
                  ~{estimatedCost.estimated_items} research items
                </div>
              </div>
            </div>
          )}
          
          <button
            type="submit"
            disabled={isSubmitting || prompt.length < 10}
            className="submit-button"
          >
            {isSubmitting ? "Creating Research..." : "Create Research"}
          </button>
        </form>
      </div>
    </div>
  );
}

