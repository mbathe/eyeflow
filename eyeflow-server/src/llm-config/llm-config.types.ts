/**
 * LLM Configuration Types
 * Support pour exécution locale ou via API
 */

export enum LlmProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  OLLAMA_LOCAL = 'ollama_local',
  LLAMA_CPP = 'llama_cpp',
  AZURE_OPENAI = 'azure_openai',
}

export enum LlmModel {
  // OpenAI
  GPT4_TURBO = 'gpt-4-turbo',
  GPT4 = 'gpt-4',
  GPT35_TURBO = 'gpt-3.5-turbo',

  // Anthropic
  CLAUDE_3_5_SONNET = 'claude-3-5-sonnet-20241022',
  CLAUDE_3_OPUS = 'claude-3-opus-20240229',
  CLAUDE_3_SONNET = 'claude-3-sonnet-20240229',
  CLAUDE_3_HAIKU = 'claude-3-haiku-20240307',

  // Local Models
  LLAMA_2_7B = 'llama2-7b',
  LLAMA_2_13B = 'llama2-13b',
  MISTRAL_7B = 'mistral-7b',
  NEURAL_HERMES_7B = 'neural-hermes-7b',
}

export interface LlmConfig {
  // Identifiant unique
  id: string;
  userId: string;

  // Configuration générale
  provider: LlmProvider;
  model: LlmModel;
  isDefault: boolean;

  // Paramètres de génération
  temperature: number; // 0-2, défaut 0.7
  maxTokens: number; // défaut 2000
  topP: number; // 0-1, défaut 1
  frequencyPenalty: number; // -2 à 2, défaut 0
  presencePenalty: number; // -2 à 2, défaut 0

  // Configuration locale
  localConfig?: LocalLlmConfig;

  // Configuration API
  apiConfig?: ApiLlmConfig;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Configuration pour LLM local (Ollama, llama.cpp)
 */
export interface LocalLlmConfig {
  // Type d'exécution locale
  type: 'ollama' | 'llama_cpp' | 'other';

  // Endpoint local
  apiUrl: string; // ex: http://localhost:11434

  // Ressources
  gpuEnabled: boolean;
  gpuModel?: string; // 'cuda', 'metal', 'vulkan'
  cpuThreads: number; // nombre de threads CPU
  contextWindow: number; // taille du contexte, défaut 4096

  // Chemin du modèle (pour llama.cpp)
  modelPath?: string;

  // Pull automatique du modèle depuis Ollama
  autoDownload: boolean;
}

/**
 * Configuration pour LLM via API
 */
export interface ApiLlmConfig {
  provider: LlmProvider;

  // Authentification
  apiKey: string; // chiffré en DB
  apiUrl?: string; // personnalisé si Azure ou endpoint custom

  // Organisation (OpenAI)
  organization?: string;

  // Déploiement (Azure OpenAI)
  deployment?: string;
  apiVersion?: string;

  // Rate limiting
  requestsPerMinute: number;
  tokensPerMinute: number;
}

/**
 * Réponse de configuration LLM
 */
export interface LlmConfigResponse {
  id: string;
  provider: LlmProvider;
  model: LlmModel;
  isDefault: boolean;
  isLocal: boolean;
  status: 'active' | 'error' | 'not_configured';
  lastHealthCheck?: Date;
  message?: string;
}

/**
 * Résultat du health check d'un LLM
 */
export interface LlmHealthCheck {
  status: 'healthy' | 'unhealthy';
  latency: number; // ms
  model: string;
  provider: LlmProvider;
  message?: string;
  error?: string;
}

/**
 * Résultat de l'exécution d'un prompt LLM
 */
export interface LlmInferenceResult {
  text: string;
  model: LlmModel;
  provider: LlmProvider;
  tokensUsed: number;
  tokensLimit: number;
  duration: number; // en ms
  cost?: number; // estimé en USD si API
  cachedResponse: boolean;
}
