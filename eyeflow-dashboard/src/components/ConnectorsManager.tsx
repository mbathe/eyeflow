import React, { useState, useEffect } from 'react';
import './ConnectorsManager.css';
import { ConnectorService } from '../../services/api';

interface Connector {
  id: string;
  name: string;
  type: string;
  status: string;
  lastTestedAt?: string;
  lastTestSuccessful: boolean;
  successfulCalls: number;
  failedCalls: number;
  averageLatency?: number;
}

interface ConnectorType {
  id: string;
  label: string;
  category: string;
  icon: string;
  description: string;
}

const CONNECTOR_TEMPLATES: Record<string, ConnectorType> = {
  postgresql: {
    id: 'postgresql',
    label: 'PostgreSQL',
    category: 'database',
    icon: '🐘',
    description: 'Connexion à une base de données PostgreSQL',
  },
  mongodb: {
    id: 'mongodb',
    label: 'MongoDB',
    category: 'database',
    icon: '🍃',
    description: 'Connexion à une base de données MongoDB',
  },
  mysql: {
    id: 'mysql',
    label: 'MySQL',
    category: 'database',
    icon: '🐬',
    description: 'Connexion à une base de données MySQL',
  },
  slack: {
    id: 'slack',
    label: 'Slack',
    category: 'communication',
    icon: '💬',
    description: 'Envoyer des messages et notifications Slack',
  },
  teams: {
    id: 'teams',
    label: 'Microsoft Teams',
    category: 'communication',
    icon: '👥',
    description: 'Intégration avec Microsoft Teams',
  },
  mqtt: {
    id: 'mqtt',
    label: 'MQTT',
    category: 'iot',
    icon: '📡',
    description: 'Connexion à un broker MQTT pour IoT',
  },
  s3: {
    id: 's3',
    label: 'Amazon S3',
    category: 'filesystem',
    icon: '☁️',
    description: 'Connexion à Amazon S3',
  },
  rest_api: {
    id: 'rest_api',
    label: 'REST API',
    category: 'custom',
    icon: '🔗',
    description: 'Connecteur personnalisé REST API',
  },
};

/**
 * Interface complet pour configurer et gérer les connecteurs
 * C'est une interface "puissante et pro" pour:
 * - Créer de nouveaux connecteurs
 * - Tester les connexions
 * - Voir les statistiques d'utilisation
 * - Gérer les statuts
 */
export const ConnectorsManager: React.FC = () => {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedConnectorType, setSelectedConnectorType] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    credentials: {} as Record<string, any>,
  });
  const [testingConnectorId, setTestingConnectorId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Charger les connecteurs au montage
  useEffect(() => {
    loadConnectors();
  }, []);

  const loadConnectors = async () => {
    try {
      setLoading(true);
      const data = await ConnectorService.listConnectors();
      setConnectors(data);
    } catch (error) {
      console.error('Failed to load connectors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConnector = async () => {
    if (!selectedConnectorType || !formData.name) {
      alert('Veuillez remplir tous les champs requis');
      return;
    }

    try {
      const template = CONNECTOR_TEMPLATES[selectedConnectorType];
      await ConnectorService.createConnector({
        name: formData.name,
        type: selectedConnectorType,
        description: formData.description,
        auth: {
          type: 'api_key', // À adapter selon le connecteur
          credentials: formData.credentials,
        },
      });

      setShowModal(false);
      setFormData({ name: '', description: '', credentials: {} });
      setSelectedConnectorType(null);
      loadConnectors();
    } catch (error) {
      console.error('Failed to create connector:', error);
      alert('Erreur lors de la création du connecteur');
    }
  };

  const handleTestConnection = async (connectorId: string) => {
    try {
      setTestingConnectorId(connectorId);
      const result = await ConnectorService.testConnection(connectorId);

      if (result.success) {
        alert(`✅ Connexion réussie! (Latence: ${result.latency}ms)`);
      } else {
        alert(`❌ Erreur de connexion: ${result.error}`);
      }

      loadConnectors();
    } catch (error) {
      console.error('Test failed:', error);
      alert('Erreur lors du test de connexion');
    } finally {
      setTestingConnectorId(null);
    }
  };

  const handleDeleteConnector = async (connectorId: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce connecteur?')) {
      return;
    }

    try {
      await ConnectorService.deleteConnector(connectorId);
      loadConnectors();
    } catch (error) {
      console.error('Failed to delete connector:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const filteredConnectors = connectors.filter((connector) => {
    const template = CONNECTOR_TEMPLATES[connector.type];
    return filterCategory === 'all' || template?.category === filterCategory;
  });

  if (loading) {
    return <div className="connectors-manager loading">Chargement...</div>;
  }

  return (
    <div className="connectors-manager">
      {/* HEADER */}
      <div className="cm-header">
        <h1>🔌 Gestionnaire de Connecteurs</h1>
        <p>Gérez toutes vos sources de données et connecteurs d'intégration</p>
      </div>

      {/* ACTION BAR */}
      <div className="cm-action-bar">
        <div className="cm-filters">
          <button
            className={`filter-btn ${filterCategory === 'all' ? 'active' : ''}`}
            onClick={() => setFilterCategory('all')}
          >
            Tous
          </button>
          <button
            className={`filter-btn ${filterCategory === 'database' ? 'active' : ''}`}
            onClick={() => setFilterCategory('database')}
          >
            📊 Base de données
          </button>
          <button
            className={`filter-btn ${filterCategory === 'communication' ? 'active' : ''}`}
            onClick={() => setFilterCategory('communication')}
          >
            💬 Communication
          </button>
          <button
            className={`filter-btn ${filterCategory === 'iot' ? 'active' : ''}`}
            onClick={() => setFilterCategory('iot')}
          >
            📡 IoT
          </button>
          <button
            className={`filter-btn ${filterCategory === 'filesystem' ? 'active' : ''}`}
            onClick={() => setFilterCategory('filesystem')}
          >
            ☁️ Fichiers
          </button>
        </div>

        <button
          className="cm-btn-create"
          onClick={() => setShowModal(true)}
        >
          ➕ Nouveau Connecteur
        </button>
      </div>

      {/* CONNECTORS LIST */}
      <div className="cm-connectors-grid">
        {filteredConnectors.length === 0 ? (
          <div className="cm-empty-state">
            <p>Aucun connecteur trouvé. Créez-en un pour commencer!</p>
          </div>
        ) : (
          filteredConnectors.map((connector) => (
            <div key={connector.id} className={`cm-connector-card status-${connector.status}`}>
              {/* Card Header */}
              <div className="cmc-header">
                <div className="cmc-title">
                  <span className="cmc-icon">
                    {CONNECTOR_TEMPLATES[connector.type]?.icon || '🔗'}
                  </span>
                  <h3>{connector.name}</h3>
                  <span className={`cmc-status status-${connector.status}`}>
                    {connector.status === 'active' ? '🟢' : '🔴'} {connector.status}
                  </span>
                </div>
              </div>

              {/* Card Stats */}
              <div className="cmc-stats">
                <div className="stat">
                  <span className="stat-label">Type</span>
                  <span className="stat-value">{connector.type}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Succès</span>
                  <span className="stat-value">{connector.successfulCalls}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Erreurs</span>
                  <span className="stat-value error">{connector.failedCalls}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Latence</span>
                  <span className="stat-value">{connector.averageLatency || '-'}ms</span>
                </div>
              </div>

              {/* Test Status */}
              {connector.lastTestedAt && (
                <div className="cmc-test-status">
                  <span className={connector.lastTestSuccessful ? 'success' : 'error'}>
                    {connector.lastTestSuccessful ? '✅' : '❌'} Dernier test:{' '}
                    {new Date(connector.lastTestedAt).toLocaleDateString()}
                  </span>
                </div>
              )}

              {/* Card Actions */}
              <div className="cmc-actions">
                <button
                  className="cmc-btn test"
                  onClick={() => handleTestConnection(connector.id)}
                  disabled={testingConnectorId === connector.id}
                >
                  {testingConnectorId === connector.id ? '⏳ Test...' : '🧪 Tester'}
                </button>
                <button className="cmc-btn edit">✏️ Éditer</button>
                <button
                  className="cmc-btn delete"
                  onClick={() => handleDeleteConnector(connector.id)}
                >
                  🗑️ Supprimer
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL CREATION */}
      {showModal && (
        <div className="cm-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="cm-modal-close"
              onClick={() => setShowModal(false)}
            >
              ✕
            </button>

            <h2>Nouveau Connecteur</h2>

            {/* STEP 1: SELECT TYPE */}
            {!selectedConnectorType ? (
              <div className="cm-type-selector">
                <div className="cm-type-group">
                  <h3>📊 Bases de données</h3>
                  <div className="cm-type-grid">
                    {['postgresql', 'mongodb', 'mysql'].map((key) => (
                      <button
                        key={key}
                        className="cm-type-btn"
                        onClick={() => setSelectedConnectorType(key)}
                      >
                        <span className="type-icon">
                          {CONNECTOR_TEMPLATES[key].icon}
                        </span>
                        <span className="type-label">
                          {CONNECTOR_TEMPLATES[key].label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cm-type-group">
                  <h3>💬 Communication</h3>
                  <div className="cm-type-grid">
                    {['slack', 'teams'].map((key) => (
                      <button
                        key={key}
                        className="cm-type-btn"
                        onClick={() => setSelectedConnectorType(key)}
                      >
                        <span className="type-icon">
                          {CONNECTOR_TEMPLATES[key].icon}
                        </span>
                        <span className="type-label">
                          {CONNECTOR_TEMPLATES[key].label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cm-type-group">
                  <h3>📡 IoT</h3>
                  <div className="cm-type-grid">
                    {['mqtt'].map((key) => (
                      <button
                        key={key}
                        className="cm-type-btn"
                        onClick={() => setSelectedConnectorType(key)}
                      >
                        <span className="type-icon">
                          {CONNECTOR_TEMPLATES[key].icon}
                        </span>
                        <span className="type-label">
                          {CONNECTOR_TEMPLATES[key].label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* STEP 2: FORM */}
                <div className="cm-form-group">
                  <label>Nom du connecteur *</label>
                  <input
                    type="text"
                    placeholder="Ex: Mon PostgreSQL de prod"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>

                <div className="cm-form-group">
                  <label>Description</label>
                  <textarea
                    placeholder="Description optionnelle"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>

                {/* CREDENTIALS FORM - Dynamique selon le type */}
                <div className="cm-credentials">
                  <h3>🔐 Identifiants</h3>

                  {selectedConnectorType === 'postgresql' && (
                    <>
                      <input
                        type="text"
                        placeholder="Host"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            credentials: {
                              ...formData.credentials,
                              host: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="number"
                        placeholder="Port (5432)"
                        defaultValue="5432"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            credentials: {
                              ...formData.credentials,
                              port: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        placeholder="Database"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            credentials: {
                              ...formData.credentials,
                              database: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        placeholder="Username"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            credentials: {
                              ...formData.credentials,
                              username: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            credentials: {
                              ...formData.credentials,
                              password: e.target.value,
                            },
                          })
                        }
                      />
                    </>
                  )}

                  {selectedConnectorType === 'slack' && (
                    <input
                      type="password"
                      placeholder="Bot Token (xoxb-...)"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          credentials: {
                            ...formData.credentials,
                            botToken: e.target.value,
                          },
                        })
                      }
                    />
                  )}

                  {selectedConnectorType === 'mqtt' && (
                    <>
                      <input
                        type="text"
                        placeholder="Broker URL"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            credentials: {
                              ...formData.credentials,
                              broker: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="number"
                        placeholder="Port (1883)"
                        defaultValue="1883"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            credentials: {
                              ...formData.credentials,
                              port: e.target.value,
                            },
                          })
                        }
                      />
                    </>
                  )}
                </div>

                {/* BUTTONS */}
                <div className="cm-modal-buttons">
                  <button
                    className="cm-btn-back"
                    onClick={() => setSelectedConnectorType(null)}
                  >
                    ← Retour
                  </button>
                  <button
                    className="cm-btn-submit"
                    onClick={handleCreateConnector}
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

export default ConnectorsManager;
