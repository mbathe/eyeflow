/**
 * LLM Configuration Types
 * Support pour exécution locale ou via API
 * Modèle étendu : chaque configuration LLM est traitée comme un « agent »
 * avec des compétences déclarées, des affinités de tâches et un prompt système.
 * Le moteur de génération de règles (DAG compiler) utilise ces métadonnées
 * pour sélectionner automatiquement le meilleur LLM selon la tâche à accomplir.
 */

// ─── Providers ────────────────────────────────────────────────────────────────

export enum LlmProvider {
  OPENAI        = 'openai',
  ANTHROPIC     = 'anthropic',
  OLLAMA_LOCAL  = 'ollama_local',
  LLAMA_CPP     = 'llama_cpp',
  AZURE_OPENAI  = 'azure_openai',
  GOOGLE        = 'google',
  MISTRAL       = 'mistral',
  GROQ          = 'groq',
  DEEPSEEK      = 'deepseek',
  COHERE        = 'cohere',
  XAI           = 'xai',
  HUGGINGFACE   = 'huggingface',
  CUSTOM        = 'custom',
}

// ─── Models ───────────────────────────────────────────────────────────────────

export enum LlmModel {
  // OpenAI — current
  GPT_4O               = 'gpt-4o',
  GPT_4O_MINI          = 'gpt-4o-mini',
  GPT4_TURBO           = 'gpt-4-turbo',
  GPT4                 = 'gpt-4',
  GPT35_TURBO          = 'gpt-3.5-turbo',
  O1                   = 'o1',
  O1_MINI              = 'o1-mini',
  O3_MINI              = 'o3-mini',

  // Anthropic
  CLAUDE_3_5_SONNET    = 'claude-3-5-sonnet-20241022',
  CLAUDE_3_5_HAIKU     = 'claude-3-5-haiku-20241022',
  CLAUDE_3_OPUS        = 'claude-3-opus-20240229',
  CLAUDE_3_SONNET      = 'claude-3-sonnet-20240229',
  CLAUDE_3_HAIKU       = 'claude-3-haiku-20240307',

  // Google
  GEMINI_2_0_FLASH     = 'gemini-2.0-flash',
  GEMINI_1_5_PRO       = 'gemini-1.5-pro',
  GEMINI_1_5_FLASH     = 'gemini-1.5-flash',

  // Mistral AI
  MISTRAL_LARGE        = 'mistral-large-latest',
  MISTRAL_MEDIUM       = 'mistral-medium-latest',
  MISTRAL_SMALL        = 'mistral-small-latest',
  CODESTRAL            = 'codestral-latest',

  // Groq (fast inference)
  LLAMA3_70B_GROQ      = 'llama-3.3-70b-versatile',
  LLAMA3_8B_GROQ       = 'llama-3.1-8b-instant',
  MIXTRAL_8X7B_GROQ    = 'mixtral-8x7b-32768',
  GEMMA2_9B_GROQ       = 'gemma2-9b-it',

  // DeepSeek
  DEEPSEEK_V3          = 'deepseek-chat',
  DEEPSEEK_REASONER    = 'deepseek-reasoner',
  DEEPSEEK_CODER       = 'deepseek-coder',

  // xAI
  GROK_2               = 'grok-2-latest',
  GROK_BETA            = 'grok-beta',

  // Cohere
  COMMAND_R_PLUS       = 'command-r-plus',
  COMMAND_R            = 'command-r',

  // Local models (Ollama / llama.cpp)
  LLAMA_3_3_70B        = 'llama3.3:70b',
  LLAMA_3_1_8B         = 'llama3.1:8b',
  LLAMA_2_7B           = 'llama2-7b',
  LLAMA_2_13B          = 'llama2-13b',
  MISTRAL_7B           = 'mistral-7b',
  NEURAL_HERMES_7B     = 'neural-hermes-7b',
  PHI_3_MEDIUM         = 'phi3:medium',
  QWEN2_5_72B          = 'qwen2.5:72b',
  CODELLAMA_13B        = 'codellama:13b',
  DEEPSEEK_CODER_V2    = 'deepseek-coder-v2',
}

// ─── Task types (for affinity scoring) ───────────────────────────────────────

export enum LlmTaskType {
  RULE_GENERATION      = 'rule_generation',       // Génération de règles métier / DAG intent
  DAG_COMPILATION      = 'dag_compilation',        // Compilation de DAG en IR SVM
  CODE_GENERATION      = 'code_generation',        // Génération / complétion de code
  DATA_ANALYSIS        = 'data_analysis',          // Analyse et interprétation de données
  TEXT_PROCESSING      = 'text_processing',        // NLP / résumé / extraction / traduction
  CLASSIFICATION       = 'classification',         // Catégorisation / tagging
  REASONING            = 'reasoning',              // Raisonnement long / chain-of-thought
  STRUCTURED_EXTRACT   = 'structured_extract',     // Extraction JSON structuré
  CREATIVE_WRITING     = 'creative_writing',       // Rédaction créative / marketing
  QA_ANSWER            = 'qa_answer',              // Question-réponse documentaire
  SUMMARIZATION        = 'summarization',          // Résumé de texte long
  TRANSLATION          = 'translation',            // Traduction multilingue
  FUNCTION_CALLING     = 'function_calling',       // Appel d'outils / tool use
  VISION               = 'vision',                 // Analyse d'image / multimodal
}

// ─── Skills (predefined capability tags) ─────────────────────────────────────

export enum LlmSkillTag {
  // Code
  CODE_GENERATION      = 'code_generation',
  CODE_REVIEW          = 'code_review',
  SQL_QUERY            = 'sql_query',
  REGEX                = 'regex',
  API_DESIGN           = 'api_design',

  // Data / Logic
  DATA_TRANSFORMATION  = 'data_transformation',
  JSON_SCHEMA          = 'json_schema',
  LOGICAL_REASONING    = 'logical_reasoning',
  MATH                 = 'math',
  STATISTICS           = 'statistics',

  // Eyeflow-specific
  DAG_BUILDER          = 'dag_builder',
  RULE_COMPILER        = 'rule_compiler',
  CONNECTOR_MAPPING    = 'connector_mapping',
  INTENT_PARSING       = 'intent_parsing',
  WORKFLOW_DESIGN      = 'workflow_design',

  // Language / Content
  MULTILINGUAL         = 'multilingual',
  FRENCH               = 'french',
  SUMMARIZATION        = 'summarization',
  TRANSLATION          = 'translation',
  CONTENT_CREATION     = 'content_creation',

  // Analysis
  SENTIMENT_ANALYSIS   = 'sentiment_analysis',
  CLASSIFICATION       = 'classification',
  ENTITY_EXTRACTION    = 'entity_extraction',
  DOCUMENT_QA          = 'document_qa',
  VISION               = 'vision',

  // Functional
  TOOL_USE             = 'tool_use',
  LONG_CONTEXT         = 'long_context',
  FAST_INFERENCE       = 'fast_inference',
  LOW_COST             = 'low_cost',
  HIGH_ACCURACY        = 'high_accuracy',
}

// ─── Task affinity (score for each task type) ─────────────────────────────────

export interface LlmTaskAffinity {
  taskType: LlmTaskType;
  /** Score 0-100, higher = more preferred for this task */
  score: number;
}

// ─── Agent context (what the rule engine receives per LLM) ───────────────────

export interface LlmAgentContext {
  /** Config DB ID */
  configId: string;
  /** Human-readable alias */
  name: string;
  description?: string;
  provider: string;
  model: string;
  isDefault: boolean;
  /** Skills declared by user */
  skills: LlmSkillTag[];
  /** Per-task affinity scores */
  taskAffinities: LlmTaskAffinity[];
  /** System prompt pre-baked into this agent */
  systemPrompt?: string;
  /** Advanced params */
  temperature: number;
  maxTokens: number;
  responseFormat?: 'text' | 'json_object';
  contextWindow?: number;
}

// ─── Core config interface ────────────────────────────────────────────────────

export interface LlmConfig {
  id: string;
  userId: string;

  /** Human-readable alias for this LLM agent */
  name?: string;
  /** What this LLM agent is configured to do */
  description?: string;

  provider: LlmProvider;
  model: string; // Free string — not limited to the enum
  isDefault: boolean;

  // ── Base generation params ──────────────────────────────────────────────
  temperature: number;        // 0-2,   default 0.7
  maxTokens: number;          // default 2000
  topP: number;               // 0-1,   default 1
  frequencyPenalty: number;   // -2…2,  default 0
  presencePenalty: number;    // -2…2,  default 0

  // ── Advanced params ─────────────────────────────────────────────────────
  /** Reproducible outputs (null = random) */
  seed?: number;
  /** Force JSON output */
  responseFormat?: 'text' | 'json_object';
  /** Override provider-default context window */
  contextWindow?: number;
  /** Custom stop sequences */
  stopSequences?: string[];

  // ── Agent identity ──────────────────────────────────────────────────────
  /** System prompt injected before every call */
  systemPrompt?: string;
  /** Declared skill tags */
  skills?: LlmSkillTag[];
  /** Task type → affinity score */
  taskAffinities?: LlmTaskAffinity[];

  // ── Provider config ─────────────────────────────────────────────────────
  localConfig?: LocalLlmConfig;
  apiConfig?: ApiLlmConfig;

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
  provider: string;
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
