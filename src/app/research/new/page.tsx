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
  const [oneShot, setOneShot] = useState(false);
  const [modelKey, setModelKey] = useState("claude-sonnet-4.6");
  const [requireAgendaApproval, setRequireAgendaApproval] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelGroupInfo[]>([]);

  const [cities, setCities] = useState<any[]>([]);
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
        one_shot: oneShot,
        require_scoping: !oneShot,
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
                checked={oneShot}
                onChange={(e) => setOneShot(e.target.checked)}
              />
              Quick answer (one-shot: single pass, no scoping or deep research)
            </label>
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

