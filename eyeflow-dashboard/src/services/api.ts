/**
 * Service client pour l'API des connecteurs
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

export interface CreateConnectorRequest {
  name: string;
  type: string;
  description?: string;
  auth: {
    type: string;
    credentials: Record<string, any>;
  };
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  rateLimit?: number;
}

export class ConnectorService {
  /**
   * Créer un nouveau connecteur
   */
  static async createConnector(data: CreateConnectorRequest) {
    const response = await fetch(`${API_BASE_URL}/connectors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create connector: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Lister tous les connecteurs
   */
  static async listConnectors(filters?: {
    type?: string;
    status?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);

    const response = await fetch(
      `${API_BASE_URL}/connectors?${params.toString()}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to list connectors: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Récupérer un connecteur spécifique
   */
  static async getConnector(connectorId: string) {
    const response = await fetch(`${API_BASE_URL}/connectors/${connectorId}`);

    if (!response.ok) {
      throw new Error(`Failed to get connector: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Mettre à jour un connecteur
   */
  static async updateConnector(connectorId: string, data: Partial<CreateConnectorRequest>) {
    const response = await fetch(`${API_BASE_URL}/connectors/${connectorId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to update connector: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Tester la connexion avec un connecteur
   */
  static async testConnection(connectorId: string) {
    const response = await fetch(
      `${API_BASE_URL}/connectors/${connectorId}/test`,
      { method: 'POST' },
    );

    if (!response.ok) {
      throw new Error(`Connection test failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Supprimer un connecteur
   */
  static async deleteConnector(connectorId: string) {
    const response = await fetch(`${API_BASE_URL}/connectors/${connectorId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete connector: ${response.statusText}`);
    }
  }

  /**
   * Activer/Désactiver un connecteur
   */
  static async setConnectorStatus(connectorId: string, status: string) {
    const response = await fetch(
      `${API_BASE_URL}/connectors/${connectorId}/status`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to update connector status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Récupérer tous les types de connecteurs disponibles
   */
  static async getAvailableConnectorTypes() {
    const response = await fetch(`${API_BASE_URL}/connectors/catalog/available-types`);

    if (!response.ok) {
      throw new Error(`Failed to fetch connector types: ${response.statusText}`);
    }

    return response.json();
  }
}

/**
 * Service client pour l'API LLM Config
 */

export interface CreateLlmConfigRequest {
  provider: string;
  model: string;
  isDefault?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  localConfig?: {
    type: 'ollama' | 'llama_cpp' | 'other';
    apiUrl: string;
    gpuEnabled: boolean;
    gpuModel?: string;
    cpuThreads: number;
    contextWindow: number;
    modelPath?: string;
    autoDownload: boolean;
  };
  apiConfig?: {
    provider: string;
    apiKey: string;
    apiUrl?: string;
    organization?: string;
    deployment?: string;
    apiVersion?: string;
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export class LlmConfigService {
  /**
   * Créer une nouvelle configuration LLM
   */
  static async createLlmConfig(data: CreateLlmConfigRequest) {
    const response = await fetch(`${API_BASE_URL}/llm-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create LLM config: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Lister toutes les configurations LLM
   */
  static async listLlmConfigs() {
    const response = await fetch(`${API_BASE_URL}/llm-config`);

    if (!response.ok) {
      throw new Error(`Failed to list LLM configs: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Récupérer la configuration LLM par défaut
   */
  static async getDefaultLlmConfig() {
    const response = await fetch(`${API_BASE_URL}/llm-config/default`);

    if (!response.ok) {
      throw new Error(`Failed to get default LLM config: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Récupérer une configuration LLM spécifique
   */
  static async getLlmConfig(configId: string) {
    const response = await fetch(`${API_BASE_URL}/llm-config/${configId}`);

    if (!response.ok) {
      throw new Error(`Failed to get LLM config: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Mettre à jour une configuration LLM
   */
  static async updateLlmConfig(
    configId: string,
    data: Partial<CreateLlmConfigRequest>,
  ) {
    const response = await fetch(`${API_BASE_URL}/llm-config/${configId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to update LLM config: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Tester la santé d'une configuration LLM
   */
  static async healthCheck(configId: string) {
    const response = await fetch(
      `${API_BASE_URL}/llm-config/${configId}/health-check`,
      { method: 'POST' },
    );

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Supprimer une configuration LLM
   */
  static async deleteLlmConfig(configId: string) {
    const response = await fetch(`${API_BASE_URL}/llm-config/${configId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete LLM config: ${response.statusText}`);
    }
  }
}
