/**
 * SERVICE MANIFEST
 * 
 * Définit tous les connecteurs, actions et services disponibles
 * dans le système pour la compilation et l'exécution
 */

export interface ServiceManifest {
  id: string;
  name: string;
  version: string;
  format: 'WASM' | 'MCP' | 'NATIVE' | 'DOCKER';
  description: string;
  inputs: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
  outputs: Array<{
    name: string;
    type: string;
  }>;
  wasmBinaryUrl?: string;
  mcpServer?: string;
  nativeBinaryUrl?: string;
  dockerImage?: string;
}

/**
 * GLOBAL SERVICE MANIFEST
 * Tous les services inscrits dans le système
 */
export const GLOBAL_SERVICE_MANIFEST: ServiceManifest[] = [
  // Sentiment Analysis Service
  {
    id: 'sentiment-analyzer',
    name: 'Sentiment Analyzer',
    version: '2.1.0',
    format: 'WASM',
    description: 'Analyze sentiment of text',
    inputs: [
      { name: 'text', type: 'string', required: true },
    ],
    outputs: [
      { name: 'sentiment', type: 'string' },
      { name: 'score', type: 'number' },
    ],
    wasmBinaryUrl: 'https://services.example.com/sentiment-analyzer-2.1.0.wasm',
  },

  // Image Processor Service
  {
    id: 'image-processor',
    name: 'Image Processor',
    version: '1.5.0',
    format: 'WASM',
    description: 'Process and analyze images',
    inputs: [
      { name: 'imageUrl', type: 'string', required: true },
      { name: 'operation', type: 'string', required: true },
    ],
    outputs: [
      { name: 'result', type: 'object' },
      { name: 'metadata', type: 'object' },
    ],
    wasmBinaryUrl: 'https://services.example.com/image-processor-1.5.0.wasm',
  },

  // GitHub Search Service (MCP)
  {
    id: 'github-search',
    name: 'GitHub Search',
    version: '1.0.0',
    format: 'MCP',
    description: 'Search repositories on GitHub',
    inputs: [
      { name: 'query', type: 'string', required: true },
      { name: 'language', type: 'string', required: false },
    ],
    outputs: [
      { name: 'repositories', type: 'array' },
      { name: 'count', type: 'number' },
    ],
    mcpServer: 'localhost:9000',
  },

  // ML Trainer Service (Docker)
  {
    id: 'ml-trainer',
    name: 'ML Model Trainer',
    version: '3.0.0',
    format: 'DOCKER',
    description: 'Train machine learning models',
    inputs: [
      { name: 'datasetUrl', type: 'string', required: true },
      { name: 'modelType', type: 'string', required: true },
      { name: 'epochs', type: 'number', required: false },
    ],
    outputs: [
      { name: 'modelId', type: 'string' },
      { name: 'accuracy', type: 'number' },
      { name: 'trainingTime', type: 'number' },
    ],
    dockerImage: 'ml-trainer:3.0.0',
  },
];

/**
 * AVAILABLE ACTIONS
 * Actions que les utilisateurs peuvent demander
 */
export const AVAILABLE_ACTIONS = {
  'analyze-sentiment': {
    name: 'Analyze Sentiment',
    description: 'Analyze the sentiment of a text',
    requires: ['sentiment-analyzer'],
    parameters: ['text'],
  },
  'process-image': {
    name: 'Process Image',
    description: 'Process and analyze an image',
    requires: ['image-processor'],
    parameters: ['imageUrl', 'operation'],
  },
  'search-github': {
    name: 'Search GitHub',
    description: 'Search for repositories on GitHub',
    requires: ['github-search'],
    parameters: ['query', 'language'],
  },
  'train-model': {
    name: 'Train ML Model',
    description: 'Train a machine learning model',
    requires: ['ml-trainer'],
    parameters: ['datasetUrl', 'modelType'],
  },
  'analyze-sentiment-and-search': {
    name: 'Analyze & Search Combined',
    description: 'Analyze sentiment and search GitHub in parallel',
    requires: ['sentiment-analyzer', 'github-search'],
    parameters: ['text', 'query'],
  },
};

/**
 * CONNECTORS
 * Connecteurs disponibles pour l'intégration
 */
export const AVAILABLE_CONNECTORS = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub repository integration',
    services: ['github-search'],
  },
  {
    id: 'aws-s3',
    name: 'AWS S3',
    description: 'AWS S3 storage integration',
    services: ['image-processor', 'ml-trainer'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI API integration',
    services: ['sentiment-analyzer'],
  },
];

/**
 * Get service by ID
 */
export function getServiceById(serviceId: string): ServiceManifest | undefined {
  return GLOBAL_SERVICE_MANIFEST.find(s => s.id === serviceId);
}

/**
 * Get all available service IDs
 */
export function getAllServiceIds(): string[] {
  return GLOBAL_SERVICE_MANIFEST.map(s => s.id);
}

/**
 * Validate if action is available
 */
export function isActionAvailable(actionId: string): boolean {
  return actionId in AVAILABLE_ACTIONS;
}

/**
 * Get action details
 */
export function getActionDetails(actionId: string) {
  return (AVAILABLE_ACTIONS as any)[actionId];
}
