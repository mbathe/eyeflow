import React, { useState, useEffect } from 'react';
import './LlmConfigManager.css';
import { LlmConfigService } from '../../services/api';

interface LlmConfig {
  id: string;
  provider: string;
  model: string;
  isDefault: boolean;
  temperature: number;
  maxTokens: number;
  lastHealthCheckAt?: string;
  lastHealthCheckSuccessful: boolean;
  totalInferences: number;
  totalTokensUsed: number;
  estimatedCostUsd?: number;
  averageLatency?: number;
}

/**
 * Interface pour gérer les configurations LLM
 * Supporte:
 * - Exécution locale (Ollama, llama.cpp)
 * - API distants (OpenAI, Anthropic, Azure)
 * - Switching entre local et API
 */
export const LlmConfigManager: React.FC = () => {
  const [configs, setConfigs] = useState<LlmConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [executionMode, setExecutionMode] = useState<'local' | 'api' | null>(null);
  const [formData, setFormData] = useState({
    provider: '',
    model: '',
    isDefault: false,
    temperature: 0.7,
    maxTokens: 2000,
  });
  const [testingConfigId, setTestingConfigId] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const data = await LlmConfigService.listLlmConfigs();
      setConfigs(data);
    } catch (error) {
      console.error('Failed to load LLM configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConfig = async () => {
    if (!formData.provider || !formData.model) {
      alert('Veuillez sélectionner un provider et un modèle');
      return;
    }

    try {
      const config: any = {
        provider: formData.provider,
        model: formData.model,
        isDefault: formData.isDefault,
        temperature: formData.temperature,
        maxTokens: formData.maxTokens,
      };

      if (executionMode === 'local') {
        config.localConfig = {
          type: 'ollama',
          apiUrl: 'http://localhost:11434',
          gpuEnabled: true,
          cpuThreads: 8,
          contextWindow: 4096,
          autoDownload: true,
        };
      } else if (executionMode === 'api') {
        config.apiConfig = {
          provider: formData.provider,
          apiKey: (document.getElementById('apiKey') as HTMLInputElement)?.value || '',
          requestsPerMinute: 100,
          tokensPerMinute: 100000,
        };
      }

      await LlmConfigService.createLlmConfig(config);
      setShowModal(false);
      setExecutionMode(null);
      setFormData({
        provider: '',
        model: '',
        isDefault: false,
        temperature: 0.7,
        maxTokens: 2000,
      });
      loadConfigs();
    } catch (error) {
      console.error('Failed to create LLM config:', error);
      alert('Erreur lors de la création');
    }
  };

  const handleHealthCheck = async (configId: string) => {
    try {
      setTestingConfigId(configId);
      const result = await LlmConfigService.healthCheck(configId);

      if (result.status === 'healthy') {
        alert(`✅ Health check réussi! (Latence: ${result.latency}ms)`);
      } else {
        alert(`❌ Health check échoué: ${result.error}`);
      }

      loadConfigs();
    } catch (error) {
      console.error('Health check failed:', error);
      alert('Erreur lors du health check');
    } finally {
      setTestingConfigId(null);
    }
  };

  const handleSetDefault = async (configId: string) => {
    try {
      await LlmConfigService.updateLlmConfig(configId, { isDefault: true });
      loadConfigs();
    } catch (error) {
      console.error('Failed to set default:', error);
      alert('Erreur lors de la mise à jour');
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette configuration?')) {
      return;
    }

    try {
      await LlmConfigService.deleteLlmConfig(configId);
      loadConfigs();
    } catch (error) {
      console.error('Failed to delete config:', error);
      alert('Erreur lors de la suppression');
    }
  };

  if (loading) {
    return <div className="llm-config-manager loading">Chargement...</div>;
  }

  const defaultConfig = configs.find((c) => c.isDefault);

  return (
    <div className="llm-config-manager">
      {/* HEADER */}
      <div className="lcm-header">
        <h1>🧠 Configuration des Modèles LLM</h1>
        <p>Gérez vos modèles d'IA: local (Ollama) ou API (OpenAI, Anthropic, etc.)</p>
      </div>

      {/* DEFAULT CONFIG HIGHLIGHT */}
      {defaultConfig && (
        <div className="lcm-default-config">
          <div className="lcm-dc-icon">⭐</div>
          <div className="lcm-dc-info">
            <h3>Configuration par Défaut</h3>
            <p>
              {defaultConfig.provider} / {defaultConfig.model}
            </p>
          </div>
          <div className="lcm-dc-stats">
            <span>{defaultConfig.totalInferences} inférences</span>
            {defaultConfig.estimatedCostUsd && (
              <span>~${defaultConfig.estimatedCostUsd.toFixed(2)}</span>
            )}
          </div>
        </div>
      )}

      {/* ACTION BAR */}
      <div className="lcm-action-bar">
        <button className="lcm-btn-create" onClick={() => setShowModal(true)}>
          ➕ Ajouter Configuration
        </button>
      </div>

      {/* CONFIGS GRID */}
      <div className="lcm-configs-grid">
        {configs.length === 0 ? (
          <div className="lcm-empty-state">
            <p>Aucune configuration. Créez-en une pour commencer!</p>
          </div>
        ) : (
          configs.map((config) => (
            <div
              key={config.id}
              className={`lcm-config-card ${config.isDefault ? 'default' : ''}`}
            >
              {/* Badge Default */}
              {config.isDefault && <div className="lcm-default-badge">⭐ Défaut</div>}

              {/* Header */}
              <div className="lcm-card-header">
                <h3>{config.provider}</h3>
                <span className="lcm-model">{config.model}</span>
              </div>

              {/* Status */}
              <div className={`lcm-status ${config.lastHealthCheckSuccessful ? 'healthy' : 'unhealthy'}`}>
                {config.lastHealthCheckSuccessful ? '🟢' : '🔴'}{' '}
                {config.lastHealthCheckSuccessful ? 'Sain' : 'Erreur'}
              </div>

              {/* Stats */}
              <div className="lcm-stats">
                <div className="stat">
                  <span className="stat-label">Inférences</span>
                  <span className="stat-value">{config.totalInferences}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Tokens</span>
                  <span className="stat-value">{(config.totalTokensUsed / 1000).toFixed(0)}k</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Latence avg</span>
                  <span className="stat-value">{config.averageLatency || '-'}ms</span>
                </div>
                {config.estimatedCostUsd && (
                  <div className="stat">
                    <span className="stat-label">Coût</span>
                    <span className="stat-value">${config.estimatedCostUsd.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Slider Settings */}
              <div className="lcm-settings">
                <div className="setting">
                  <label>Température: {config.temperature.toFixed(1)}</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    defaultValue={config.temperature}
                    className="lcm-slider"
                    disabled
                  />
                </div>
                <div className="setting">
                  <label>Max Tokens: {config.maxTokens}</label>
                  <div style={{ color: '#a0aec0', fontSize: '0.85rem' }}>
                    {config.maxTokens} tokens max
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="lcm-actions">
                <button
                  className="lcm-btn test"
                  onClick={() => handleHealthCheck(config.id)}
                  disabled={testingConfigId === config.id}
                >
                  {testingConfigId === config.id ? '⏳' : '🧪'} Test
                </button>

                {!config.isDefault && (
                  <button
                    className="lcm-btn default"
                    onClick={() => handleSetDefault(config.id)}
                  >
                    ⭐ Défaut
                  </button>
                )}

                <button className="lcm-btn edit">✏️ Éditer</button>

                <button
                  className="lcm-btn delete"
                  onClick={() => handleDeleteConfig(config.id)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="lcm-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="lcm-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="lcm-modal-close"
              onClick={() => setShowModal(false)}
            >
              ✕
            </button>

            <h2>Nouvelle Configuration LLM</h2>

            {/* STEP 1: Execution Mode */}
            {!executionMode ? (
              <div className="lcm-mode-selector">
                <button
                  className="lcm-mode-btn local"
                  onClick={() => setExecutionMode('local')}
                >
                  <div className="mode-icon">💻</div>
                  <h3>Local</h3>
                  <p>Exécution sur votre machine (Ollama, llama.cpp)</p>
                  <ul>
                    <li>✅ Confidentialité totale</li>
                    <li>✅ Latence 0</li>
                    <li>✅ Gratuit</li>
                    <li>❌ Ressources requises</li>
                  </ul>
                </button>

                <button
                  className="lcm-mode-btn api"
                  onClick={() => setExecutionMode('api')}
                >
                  <div className="mode-icon">☁️</div>
                  <h3>API</h3>
                  <p>Utiliser un service cloud (OpenAI, Anthropic...)</p>
                  <ul>
                    <li>✅ Puissance maximale</li>
                    <li>✅ Pas de setup</li>
                    <li>✅ Models dernière génération</li>
                    <li>❌ Coût par utilisation</li>
                  </ul>
                </button>
              </div>
            ) : (
              <>
                {/* STEP 2: Configuration */}

                {executionMode === 'local' && (
                  <div className="lcm-form">
                    <div className="form-group">
                      <label>Provider</label>
                      <select
                        value={formData.provider}
                        onChange={(e) =>
                          setFormData({ ...formData, provider: e.target.value })
                        }
                      >
                        <option value="">Sélectionner...</option>
                        <option value="ollama_local">Ollama</option>
                        <option value="llama_cpp">Llama.cpp</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Modèle</label>
                      <select
                        value={formData.model}
                        onChange={(e) =>
                          setFormData({ ...formData, model: e.target.value })
                        }
                      >
                        <option value="">Sélectionner...</option>
                        <option value="llama2-7b">Llama 2 7B</option>
                        <option value="llama2-13b">Llama 2 13B</option>
                        <option value="mistral-7b">Mistral 7B</option>
                        <option value="neural-hermes-7b">Neural Hermes 7B</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Température ({formData.temperature.toFixed(1)})</label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={formData.temperature}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            temperature: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Max Tokens</label>
                      <input
                        type="number"
                        value={formData.maxTokens}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            maxTokens: parseInt(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={formData.isDefault}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              isDefault: e.target.checked,
                            })
                          }
                        />
                        Défaut
                      </label>
                    </div>

                    <div className="lcm-info-box">
                      <p>
                        💡 Assurez-vous qu'Ollama est en cours d'exécution sur
                        localhost:11434
                      </p>
                    </div>
                  </div>
                )}

                {executionMode === 'api' && (
                  <div className="lcm-form">
                    <div className="form-group">
                      <label>Provider API</label>
                      <select
                        value={formData.provider}
                        onChange={(e) =>
                          setFormData({ ...formData, provider: e.target.value })
                        }
                      >
                        <option value="">Sélectionner...</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="azure_openai">Azure OpenAI</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Modèle</label>
                      <select
                        value={formData.model}
                        onChange={(e) =>
                          setFormData({ ...formData, model: e.target.value })
                        }
                      >
                        <option value="">Sélectionner...</option>
                        {formData.provider === 'openai' && (
                          <>
                            <option value="gpt-4-turbo">GPT-4 Turbo</option>
                            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                          </>
                        )}
                        {formData.provider === 'anthropic' && (
                          <>
                            <option value="claude-3-5-sonnet-20241022">
                              Claude 3.5 Sonnet
                            </option>
                            <option value="claude-3-opus-20240229">
                              Claude 3 Opus
                            </option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>API Key</label>
                      <input
                        type="password"
                        id="apiKey"
                        placeholder="Entrez votre clé API"
                      />
                    </div>

                    <div className="form-group">
                      <label>Température ({formData.temperature.toFixed(1)})</label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={formData.temperature}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            temperature: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={formData.isDefault}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              isDefault: e.target.checked,
                            })
                          }
                        />
                        Défaut
                      </label>
                    </div>
                  </div>
                )}

                {/* Buttons */}
                <div className="lcm-modal-buttons">
                  <button
                    className="lcm-btn-back"
                    onClick={() => setExecutionMode(null)}
                  >
                    ← Retour
                  </button>
                  <button
                    className="lcm-btn-submit"
                    onClick={handleCreateConfig}
                  >
                    ✔️ Créer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LlmConfigManager;
