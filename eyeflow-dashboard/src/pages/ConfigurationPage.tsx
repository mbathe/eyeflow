/**
 * ConfigurationPage — full CRUD for Connectors, Nodes, and LLM configs.
 *
 * Layout
 *   Tab bar  →  Connecteurs | Nœuds | LLM
 *   Each tab has a "+ Ajouter" button.
 *   A slide-in right panel handles create/edit forms.
 *   Delete uses an inline confirmation dialog.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { connectorsApi, nodesApi, llmConfigApi } from '@/services/api';
import { cn } from '@/lib/utils';
import {
  Plug, Server, BrainCircuit, CheckCircle2, XCircle, Loader2,
  RefreshCw, Wifi, Globe, Database, Lock, Star,
  Plus, Pencil, Trash2, Zap, Copy, Check, Eye, EyeOff,
  ChevronDown, AlertTriangle, Activity,
  MonitorSmartphone, X, Cpu,
  Search, HardDrive, Cloud, Mail, MessageSquare, Phone,
  ShoppingCart, CreditCard, Users, Code2, BarChart2, FolderOpen,
  Monitor, LayoutGrid,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

const rel = (d?: string) => {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `il y a ${s}s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(d).toLocaleDateString();
};

type TestState = 'idle' | 'loading' | 'ok' | 'fail';

// ─── Connector type catalogue ─────────────────────────────────────────────────

const CONNECTOR_TYPES = [
  // ── Base de données ──────────────────────────────────────────────────────
  { group: 'Base de données', value: 'postgresql',   label: 'PostgreSQL',      Icon: Database,      bg: 'bg-blue-900/40',    ic: 'text-blue-300',    description: 'Base relationnelle robuste, idéale pour données structurées avec ACID complet.' },
  { group: 'Base de données', value: 'mysql',        label: 'MySQL / MariaDB', Icon: Database,      bg: 'bg-blue-900/40',    ic: 'text-blue-300',    description: 'Moteur SQL open-source très répandu, compatible avec MariaDB.' },
  { group: 'Base de données', value: 'mongodb',      label: 'MongoDB',         Icon: Database,      bg: 'bg-blue-900/40',    ic: 'text-blue-300',    description: 'Base NoSQL orientée documents JSON, schéma flexible et scalable.' },
  { group: 'Base de données', value: 'dynamodb',     label: 'DynamoDB',        Icon: Cloud,         bg: 'bg-blue-900/40',    ic: 'text-blue-300',    description: 'Base NoSQL managée AWS, latence faible et scalabilité automatique.' },
  { group: 'Base de données', value: 'firestore',    label: 'Firestore',       Icon: Cloud,         bg: 'bg-blue-900/40',    ic: 'text-blue-300',    description: 'Base NoSQL temps réel de Google Firebase — sync automatique multi-clients.' },
  // ── Fichiers ─────────────────────────────────────────────────────────────
  { group: 'Fichiers',        value: 'local_file',   label: 'Fichier local',   Icon: HardDrive,     bg: 'bg-amber-900/40',   ic: 'text-amber-300',   description: "Lecture et écriture sur le système de fichiers local du nœud d'exécution." },
  { group: 'Fichiers',        value: 's3',           label: 'AWS S3',          Icon: Cloud,         bg: 'bg-amber-900/40',   ic: 'text-amber-300',   description: 'Stockage objet AWS — archivage, assets statiques et backup dans le cloud.' },
  { group: 'Fichiers',        value: 'google_drive', label: 'Google Drive',    Icon: FolderOpen,    bg: 'bg-amber-900/40',   ic: 'text-amber-300',   description: "Lecture, écriture et partage de fichiers dans Google Drive via l'API." },
  { group: 'Fichiers',        value: 'dropbox',      label: 'Dropbox',         Icon: FolderOpen,    bg: 'bg-amber-900/40',   ic: 'text-amber-300',   description: 'Synchronisation et gestion de fichiers dans votre espace Dropbox.' },
  // ── IoT / Streaming ──────────────────────────────────────────────────────
  { group: 'IoT / Streaming', value: 'mqtt',         label: 'MQTT',            Icon: Wifi,          bg: 'bg-emerald-900/40', ic: 'text-emerald-300', description: 'Protocole léger publish/subscribe pour IoT et communications machine-to-machine.' },
  { group: 'IoT / Streaming', value: 'kafka',        label: 'Kafka',           Icon: BarChart2,     bg: 'bg-emerald-900/40', ic: 'text-emerald-300', description: 'Plateforme de streaming distribué pour pipelines de données à haut débit.' },
  { group: 'IoT / Streaming', value: 'influxdb',     label: 'InfluxDB',        Icon: Activity,      bg: 'bg-emerald-900/40', ic: 'text-emerald-300', description: 'Base de données time series optimisée pour métriques, capteurs et monitoring.' },
  // ── Communication ─────────────────────────────────────────────────────────
  { group: 'Communication',   value: 'smtp',         label: 'Email (SMTP)',    Icon: Mail,          bg: 'bg-violet-900/40',  ic: 'text-violet-300',  description: "Envoi d'emails transactionnels ou de notification via n'importe quel serveur SMTP." },
  { group: 'Communication',   value: 'slack',        label: 'Slack',           Icon: MessageSquare, bg: 'bg-violet-900/40',  ic: 'text-violet-300',  description: 'Envoi de messages et alertes dans des canaux ou en direct via API Slack.' },
  { group: 'Communication',   value: 'teams',        label: 'Microsoft Teams', Icon: Monitor,       bg: 'bg-violet-900/40',  ic: 'text-violet-300',  description: 'Publication de messages et notifications dans Teams via webhook entrant.' },
  { group: 'Communication',   value: 'whatsapp',     label: 'WhatsApp',        Icon: Phone,         bg: 'bg-violet-900/40',  ic: 'text-violet-300',  description: "Envoi et réception de messages WhatsApp via l'API Cloud Business." },
  // ── ERP / SaaS ───────────────────────────────────────────────────────────
  { group: 'ERP / SaaS',      value: 'shopify',      label: 'Shopify',         Icon: ShoppingCart,  bg: 'bg-orange-900/40',  ic: 'text-orange-300',  description: 'Intégration e-commerce : commandes, produits, clients et inventaire Shopify.' },
  { group: 'ERP / SaaS',      value: 'hubspot',      label: 'HubSpot',         Icon: Users,         bg: 'bg-orange-900/40',  ic: 'text-orange-300',  description: 'CRM HubSpot : contacts, deals, formulaires et automatisations marketing.' },
  // ── Paiement ─────────────────────────────────────────────────────────────
  { group: 'Paiement',        value: 'stripe',       label: 'Stripe',          Icon: CreditCard,    bg: 'bg-green-900/40',   ic: 'text-green-300',   description: "Traitement des paiements, abonnements et facturation via l'API Stripe." },
  // ── Générique ────────────────────────────────────────────────────────────
  { group: 'Générique',       value: 'webhook',      label: 'Webhook',         Icon: Zap,           bg: 'bg-gray-700/50',    ic: 'text-gray-300',    description: 'Envoi de requêtes HTTP vers un endpoint externe avec signature HMAC optionnelle.' },
  { group: 'Générique',       value: 'rest_api',     label: 'REST API',        Icon: Globe,         bg: 'bg-gray-700/50',    ic: 'text-gray-300',    description: "Connecteur HTTP générique : GET, POST, PUT, DELETE vers n'importe quelle API REST." },
  { group: 'Générique',       value: 'graphql',      label: 'GraphQL',         Icon: Code2,         bg: 'bg-gray-700/50',    ic: 'text-gray-300',    description: "Requêtes et mutations vers un endpoint GraphQL avec support des headers d'auth." },
] as const;

type ConnectorTypeValue = (typeof CONNECTOR_TYPES)[number]['value'];

interface FieldSpec {
  key: string; label: string;
  type: 'text' | 'password' | 'number' | 'url' | 'boolean' | 'select';
  required?: boolean; placeholder?: string;
  options?: { value: string; label: string }[];
  hint?: string;
}

const CONNECTOR_FIELDS: Record<string, FieldSpec[]> = {
  postgresql:   [
    { key: 'host',     label: 'Hôte',          type: 'text',     required: true,  placeholder: 'localhost' },
    { key: 'port',     label: 'Port',          type: 'number',   required: true,  placeholder: '5432' },
    { key: 'database', label: 'Base',          type: 'text',     required: true  },
    { key: 'username', label: 'Utilisateur',   type: 'text',     required: true  },
    { key: 'password', label: 'Mot de passe',  type: 'password', required: true  },
    { key: 'ssl',      label: 'SSL',           type: 'boolean' },
  ],
  mysql:        [
    { key: 'host',     label: 'Hôte',          type: 'text',     required: true,  placeholder: 'localhost' },
    { key: 'port',     label: 'Port',          type: 'number',   required: true,  placeholder: '3306' },
    { key: 'database', label: 'Base',          type: 'text',     required: true  },
    { key: 'username', label: 'Utilisateur',   type: 'text',     required: true  },
    { key: 'password', label: 'Mot de passe',  type: 'password', required: true  },
    { key: 'ssl',      label: 'SSL / TLS',     type: 'boolean' },
  ],
  mongodb:      [
    { key: 'uri',        label: 'URI MongoDB',   type: 'text',     required: true,  placeholder: 'mongodb://localhost:27017', hint: "Peut contenir user:pass@host. Les champs ci-dessous sont des alternatives." },
    { key: 'database',   label: 'Base',          type: 'text',     required: true  },
    { key: 'username',   label: 'Utilisateur',   type: 'text',     hint: 'Optionnel si déjà dans l\'URI' },
    { key: 'password',   label: 'Mot de passe',  type: 'password', hint: 'Optionnel si déjà dans l\'URI' },
    { key: 'authSource', label: 'Auth Source',   type: 'text',     placeholder: 'admin', hint: 'Base où l\'utilisateur est défini (souvent admin)' },
    { key: 'replicaSet', label: 'Replica Set',   type: 'text',     placeholder: 'rs0', hint: 'Nom du replica set si cluster' },
  ],
  dynamodb:     [
    { key: 'region',          label: 'Région AWS',        type: 'text',     required: true,  placeholder: 'eu-west-1' },
    { key: 'accessKeyId',     label: 'Access Key ID',     type: 'text',     required: true  },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true  },
    { key: 'sessionToken',    label: 'Session Token',     type: 'password', hint: 'Pour credentials temporaires (IAM Role / STS)' },
    { key: 'endpoint',        label: 'Endpoint custom',   type: 'url',      placeholder: 'http://localhost:8000', hint: 'Laisser vide pour AWS. Renseigner pour LocalStack ou endpoint privé.' },
  ],
  firestore:    [
    { key: 'projectId',         label: 'Project ID',          type: 'text',     required: true },
    { key: 'serviceAccountKey', label: 'Service Account JSON', type: 'password', required: true },
  ],
  s3:           [
    { key: 'region',          label: 'Région AWS',        type: 'text',     required: true,  placeholder: 'eu-west-1' },
    { key: 'bucket',          label: 'Bucket',            type: 'text',     required: true  },
    { key: 'accessKeyId',     label: 'Access Key ID',     type: 'text',     required: true  },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true  },
    { key: 'endpoint',        label: 'Endpoint custom',   type: 'url',      placeholder: 'https://s3.example.com', hint: 'Pour MinIO, Wasabi, Scaleway, etc. Laisser vide pour AWS.' },
    { key: 'pathStyle',       label: 'Path-style URL',    type: 'boolean',  hint: 'Activer pour MinIO et la plupart des S3-compatibles.' },
  ],
  local_file:   [{ key: 'basePath', label: 'Chemin de base', type: 'text', required: true, placeholder: '/data' }],
  google_drive: [
    { key: 'clientId',     label: 'Client ID',     type: 'text',     required: true },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
    { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: true },
  ],
  dropbox:      [
    { key: 'accessToken',  label: 'Access Token',  type: 'password', hint: 'Token long-lived (offline). Généré via l\'API Dropbox.' },
    { key: 'appKey',       label: 'App Key',       type: 'text',     hint: 'OAuth2 — identifiant de l\'application Dropbox' },
    { key: 'appSecret',    label: 'App Secret',    type: 'password', hint: 'OAuth2 — secret de l\'application Dropbox' },
    { key: 'refreshToken', label: 'Refresh Token', type: 'password', hint: 'OAuth2 — token de renouvellement automatique' },
  ],
  mqtt:         [
    { key: 'brokerUrl', label: 'URL du broker', type: 'url',      required: true, placeholder: 'mqtt://localhost:1883' },
    { key: 'clientId',  label: 'Client ID',     type: 'text' },
    { key: 'username',  label: 'Utilisateur',   type: 'text' },
    { key: 'password',  label: 'Mot de passe',  type: 'password' },
    { key: 'useTls',    label: 'TLS/SSL',        type: 'boolean' },
  ],
  kafka:        [
    { key: 'brokers',       label: 'Brokers (virgule-séparé)', type: 'text',     required: true, placeholder: 'localhost:9092,broker2:9092' },
    { key: 'clientId',      label: 'Client ID',                type: 'text',     placeholder: 'eyeflow-client' },
    { key: 'groupId',       label: 'Consumer Group ID',        type: 'text',     placeholder: 'eyeflow-group' },
    { key: 'topic',         label: 'Topics (virgule-séparé)',  type: 'text',     placeholder: 'topic-in,topic-out' },
    { key: 'saslMechanism', label: 'Mécanisme SASL',           type: 'select',   options: [
      { value: '',                label: 'Aucun (sans auth)'           },
      { value: 'PLAIN',           label: 'PLAIN'                       },
      { value: 'SCRAM-SHA-256',   label: 'SCRAM-SHA-256'               },
      { value: 'SCRAM-SHA-512',   label: 'SCRAM-SHA-512'               },
      { value: 'OAUTHBEARER',     label: 'OAuth Bearer'                },
    ]},
    { key: 'username',      label: 'SASL Username',            type: 'text' },
    { key: 'password',      label: 'SASL Password',            type: 'password' },
    { key: 'ssl',           label: 'TLS / SSL',                type: 'boolean' },
    { key: 'requestTimeout',label: 'Timeout requêtes (ms)',    type: 'number',   placeholder: '30000' },
  ],
  influxdb:     [
    { key: 'url',    label: 'URL',    type: 'url',      required: true, placeholder: 'http://localhost:8086' },
    { key: 'token',  label: 'Token',  type: 'password', required: true },
    { key: 'org',    label: 'Org',    type: 'text',     required: true },
    { key: 'bucket', label: 'Bucket', type: 'text',     required: true },
  ],
  smtp:         [
    { key: 'host',     label: 'Hôte SMTP',         type: 'text',     required: true },
    { key: 'port',     label: 'Port',              type: 'number',   required: true, placeholder: '587' },
    { key: 'from',     label: 'Adresse expéditeur',type: 'text',     required: true },
    { key: 'username', label: 'Utilisateur',       type: 'text' },
    { key: 'password', label: 'Mot de passe',      type: 'password' },
    { key: 'secure',   label: 'TLS (port 465)',    type: 'boolean' },
  ],
  slack:        [
    { key: 'webhookUrl',      label: 'Webhook URL',      type: 'url',      placeholder: 'https://hooks.slack.com/…', hint: 'Pour Incoming Webhooks (simple, sans bot)' },
    { key: 'botToken',        label: 'Bot Token',        type: 'password', hint: 'xoxb-… — pour poster via API Bot (plus flexible)' },
    { key: 'defaultChannel',  label: 'Canal par défaut', type: 'text',     placeholder: '#général', hint: 'Canal utilisé si non précisé dans l\'action (ex: #alerts)' },
  ],
  teams:        [{ key: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true }],
  whatsapp:     [
    { key: 'apiUrl',        label: 'API URL',        type: 'url',      required: true,  placeholder: 'https://graph.facebook.com/v18.0', hint: 'URL de base de l\'API WhatsApp Cloud (Meta)' },
    { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text',     required: true,  hint: 'ID du numéro WhatsApp Business dans Meta Business Manager' },
    { key: 'accessToken',   label: 'Access Token',   type: 'password', required: true,  hint: 'Token permanent généré dans Meta for Developers' },
    { key: 'wabaId',        label: 'WABA ID',        type: 'text',     hint: 'WhatsApp Business Account ID (optionnel, pour webhooks)' },
  ],
  shopify:      [
    { key: 'shopDomain',  label: 'Domain boutique', type: 'text',     required: true, placeholder: 'my-store.myshopify.com' },
    { key: 'apiKey',      label: 'API Key',         type: 'text',     required: true },
    { key: 'apiSecret',   label: 'API Secret',      type: 'password', required: true },
    { key: 'accessToken', label: 'Access Token',    type: 'password', required: true },
  ],
  stripe:       [
    { key: 'secretKey',     label: 'Secret Key',     type: 'password', required: true, placeholder: 'sk_live_…' },
    { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', placeholder: 'whsec_…' },
  ],
  hubspot:      [
    { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
    { key: 'portalId',    label: 'Portal ID',    type: 'text' },
  ],
  webhook:      [
    { key: 'endpointUrl', label: 'Endpoint URL', type: 'url',      required: true },
    { key: 'secret',      label: 'Secret HMAC',  type: 'password' },
  ],
  rest_api:     [
    { key: 'baseUrl',     label: 'Base URL',         type: 'url',      required: true },
    { key: 'authType',    label: 'Type d\'auth',     type: 'select',   options: [
      { value: 'none',    label: 'Aucune'            },
      { value: 'api_key', label: 'API Key (header)'  },
      { value: 'bearer',  label: 'Bearer Token'      },
      { value: 'basic',   label: 'Basic Auth'        },
    ], hint: 'Méthode d\'authentification utilisée pour chaque requête' },
    { key: 'apiKeyHeader', label: 'Nom du header',   type: 'text',     placeholder: 'X-API-Key', hint: 'Nom du header pour l\'API Key (authType = api_key)' },
    { key: 'apiKey',      label: 'API Key',          type: 'password', hint: 'Valeur de l\'API Key' },
    { key: 'bearerToken', label: 'Bearer Token',     type: 'password', hint: 'Token JWT ou OAuth2' },
    { key: 'username',    label: 'Utilisateur',      type: 'text',     hint: 'Basic Auth — login' },
    { key: 'password',    label: 'Mot de passe',     type: 'password', hint: 'Basic Auth — mot de passe' },
  ],
  graphql:      [
    { key: 'endpoint',    label: 'Endpoint URL',     type: 'url',      required: true },
    { key: 'authType',    label: 'Type d\'auth',     type: 'select',   options: [
      { value: 'none',    label: 'Aucune'            },
      { value: 'api_key', label: 'API Key (header)'  },
      { value: 'bearer',  label: 'Bearer Token'      },
      { value: 'basic',   label: 'Basic Auth'        },
    ], hint: 'Méthode d\'authentification' },
    { key: 'apiKeyHeader', label: 'Nom du header',   type: 'text',     placeholder: 'X-API-Key' },
    { key: 'apiKey',      label: 'API Key',          type: 'password' },
    { key: 'bearerToken', label: 'Bearer Token',     type: 'password' },
    { key: 'username',    label: 'Utilisateur',      type: 'text',     hint: 'Basic Auth — login' },
    { key: 'password',    label: 'Mot de passe',     type: 'password', hint: 'Basic Auth — mot de passe' },
  ],
};

// ─── LLM metadata ─────────────────────────────────────────────────────────────

const LLM_PROVIDERS = [
  { value: 'openai',       label: 'OpenAI',              isLocal: false },
  { value: 'anthropic',    label: 'Anthropic',           isLocal: false },
  { value: 'google',       label: 'Google (Gemini)',     isLocal: false },
  { value: 'mistral',      label: 'Mistral AI',          isLocal: false },
  { value: 'groq',         label: 'Groq',                isLocal: false },
  { value: 'deepseek',     label: 'DeepSeek',            isLocal: false },
  { value: 'xai',          label: 'xAI (Grok)',          isLocal: false },
  { value: 'cohere',       label: 'Cohere',              isLocal: false },
  { value: 'azure_openai', label: 'Azure OpenAI',        isLocal: false },
  { value: 'huggingface',  label: 'Hugging Face',        isLocal: false },
  { value: 'ollama_local', label: 'Ollama (local)',      isLocal: true  },
  { value: 'llama_cpp',    label: 'llama.cpp (local)',   isLocal: true  },
  { value: 'custom',       label: 'API personnalisée',    isLocal: false },
] as const;

const LLM_MODELS: Record<string, Array<{ value: string; label: string; ctx?: number }>> = {
  openai: [
    { value: 'gpt-4o',            label: 'GPT-4o',             ctx: 128000 },
    { value: 'gpt-4o-mini',       label: 'GPT-4o mini',        ctx: 128000 },
    { value: 'o1',                label: 'o1',                 ctx: 200000 },
    { value: 'o1-mini',           label: 'o1-mini',            ctx: 128000 },
    { value: 'o3-mini',           label: 'o3-mini',            ctx: 200000 },
    { value: 'gpt-4-turbo',       label: 'GPT-4 Turbo',        ctx: 128000 },
    { value: 'gpt-4',             label: 'GPT-4',              ctx: 8192   },
    { value: 'gpt-3.5-turbo',     label: 'GPT-3.5 Turbo',     ctx: 16385  },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', ctx: 200000 },
    { value: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku',  ctx: 200000 },
    { value: 'claude-3-opus-20240229',     label: 'Claude 3 Opus',     ctx: 200000 },
    { value: 'claude-3-sonnet-20240229',   label: 'Claude 3 Sonnet',   ctx: 200000 },
    { value: 'claude-3-haiku-20240307',    label: 'Claude 3 Haiku',    ctx: 200000 },
  ],
  google: [
    { value: 'gemini-2.0-flash',   label: 'Gemini 2.0 Flash',   ctx: 1000000 },
    { value: 'gemini-1.5-pro',     label: 'Gemini 1.5 Pro',     ctx: 2097152 },
    { value: 'gemini-1.5-flash',   label: 'Gemini 1.5 Flash',   ctx: 1048576 },
  ],
  mistral: [
    { value: 'mistral-large-latest',  label: 'Mistral Large',   ctx: 131072 },
    { value: 'mistral-medium-latest', label: 'Mistral Medium',  ctx: 131072 },
    { value: 'mistral-small-latest',  label: 'Mistral Small',   ctx: 131072 },
    { value: 'codestral-latest',      label: 'Codestral',       ctx: 256000 },
  ],
  groq: [
    { value: 'llama-3.3-70b-versatile', label: 'LLaMA 3.3 70B',  ctx: 128000 },
    { value: 'llama-3.1-8b-instant',    label: 'LLaMA 3.1 8B',   ctx: 131072 },
    { value: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B',   ctx: 32768  },
    { value: 'gemma2-9b-it',            label: 'Gemma 2 9B',      ctx: 8192   },
  ],
  deepseek: [
    { value: 'deepseek-chat',      label: 'DeepSeek V3',        ctx: 64000  },
    { value: 'deepseek-reasoner',  label: 'DeepSeek R1',        ctx: 64000  },
    { value: 'deepseek-coder',     label: 'DeepSeek Coder',     ctx: 16384  },
  ],
  xai: [
    { value: 'grok-2-latest', label: 'Grok 2', ctx: 131072 },
    { value: 'grok-beta',     label: 'Grok 1.5', ctx: 131072 },
  ],
  cohere: [
    { value: 'command-r-plus', label: 'Command R+', ctx: 128000 },
    { value: 'command-r',      label: 'Command R',  ctx: 128000 },
  ],
  azure_openai: [
    { value: 'gpt-4o',        label: 'GPT-4o (Azure)',       ctx: 128000 },
    { value: 'gpt-4-turbo',   label: 'GPT-4 Turbo (Azure)',  ctx: 128000 },
    { value: 'gpt-4',         label: 'GPT-4 (Azure)',         ctx: 8192   },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Azure)',ctx: 16385  },
  ],
  huggingface: [
    { value: 'mistralai/Mistral-7B-Instruct-v0.3', label: 'Mistral 7B Instruct' },
    { value: 'meta-llama/Llama-3.1-8B-Instruct',   label: 'LLaMA 3.1 8B'       },
  ],
  ollama_local: [
    { value: 'llama3.3:70b',          label: 'LLaMA 3.3 70B',         ctx: 128000 },
    { value: 'llama3.1:8b',           label: 'LLaMA 3.1 8B',          ctx: 131072 },
    { value: 'mistral:latest',        label: 'Mistral 7B',             ctx: 32768  },
    { value: 'qwen2.5:72b',           label: 'Qwen 2.5 72B',          ctx: 128000 },
    { value: 'phi3:medium',           label: 'Phi-3 Medium',           ctx: 128000 },
    { value: 'codellama:13b',         label: 'Code LLaMA 13B',        ctx: 16384  },
    { value: 'deepseek-coder-v2',     label: 'DeepSeek Coder V2',     ctx: 32768  },
    { value: 'neural-hermes-7b',      label: 'Neural Hermes 7B',      ctx: 4096   },
    { value: 'llama2:7b',             label: 'LLaMA 2 7B',            ctx: 4096   },
  ],
  llama_cpp: [
    { value: 'mistral-7b',   label: 'Mistral 7B'  },
    { value: 'llama2:7b',    label: 'LLaMA 2 7B'  },
    { value: 'llama2:13b',   label: 'LLaMA 2 13B' },
  ],
  custom: [
    { value: 'custom', label: 'Modèle personnalisé' },
  ],
};

// ─── LLM Skills (predefined tags) ─────────────────────────────────────────────
const LLM_SKILL_OPTIONS = [
  { value: 'code_generation',    label: 'Génération de code',       group: 'Code'      },
  { value: 'code_review',        label: 'Revue de code',            group: 'Code'      },
  { value: 'sql_query',          label: 'SQL / Requêtes BD',       group: 'Code'      },
  { value: 'api_design',         label: 'Conception API',           group: 'Code'      },
  { value: 'regex',              label: 'Expressions régulières',   group: 'Code'      },
  { value: 'dag_builder',        label: 'Construction DAG',         group: 'Eyeflow'   },
  { value: 'rule_compiler',      label: 'Compilation règles',       group: 'Eyeflow'   },
  { value: 'connector_mapping',  label: 'Mapping connecteurs',      group: 'Eyeflow'   },
  { value: 'intent_parsing',     label: 'Analyse d’intention',      group: 'Eyeflow'   },
  { value: 'workflow_design',    label: 'Design de workflow',       group: 'Eyeflow'   },
  { value: 'json_schema',        label: 'JSON structuré',           group: 'Data'      },
  { value: 'data_transformation',label: 'Transformation données',   group: 'Data'      },
  { value: 'logical_reasoning',  label: 'Raisonnement logique',     group: 'Data'      },
  { value: 'statistics',         label: 'Statistiques',             group: 'Data'      },
  { value: 'math',               label: 'Mathématiques',            group: 'Data'      },
  { value: 'summarization',      label: 'Résumé',                   group: 'Langue'    },
  { value: 'translation',        label: 'Traduction',               group: 'Langue'    },
  { value: 'multilingual',       label: 'Multilingue',              group: 'Langue'    },
  { value: 'french',             label: 'Français',                 group: 'Langue'    },
  { value: 'content_creation',   label: 'Rédaction créative',       group: 'Langue'    },
  { value: 'classification',     label: 'Classification',           group: 'Analyse'   },
  { value: 'entity_extraction',  label: 'Extraction entités',       group: 'Analyse'   },
  { value: 'sentiment_analysis', label: 'Sentiment',                group: 'Analyse'   },
  { value: 'document_qa',        label: 'Q&A documentaire',         group: 'Analyse'   },
  { value: 'tool_use',           label: 'Appel d’outils (tools)',   group: 'Fonctions' },
  { value: 'long_context',       label: 'Long contexte',            group: 'Fonctions' },
  { value: 'fast_inference',     label: 'Inférence rapide',         group: 'Fonctions' },
  { value: 'high_accuracy',      label: 'Haute précision',          group: 'Fonctions' },
  { value: 'low_cost',           label: 'Faible coût',              group: 'Fonctions' },
  { value: 'vision',             label: 'Vision / image',           group: 'Fonctions' },
] as const;

const LLM_TASK_OPTIONS = [
  { value: 'rule_generation',   label: 'Génération de règles' },
  { value: 'dag_compilation',   label: 'Compilation DAG'      },
  { value: 'code_generation',   label: 'Génération de code'   },
  { value: 'data_analysis',     label: 'Analyse de données'   },
  { value: 'text_processing',   label: 'Traitement texte'      },
  { value: 'classification',    label: 'Classification'        },
  { value: 'reasoning',         label: 'Raisonnement'          },
  { value: 'structured_extract',label: 'Extraction JSON'       },
  { value: 'summarization',     label: 'Résumé'                },
  { value: 'translation',       label: 'Traduction'            },
  { value: 'function_calling',  label: 'Appel d’outils'       },
  { value: 'vision',            label: 'Vision'                },
] as const;

// ─── Primitives ───────────────────────────────────────────────────────────────

const Badge = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium', className)}>
    {children}
  </span>
);

const Dot = ({ online }: { online: boolean }) => (
  <span className={cn('w-2 h-2 rounded-full shrink-0 inline-block', online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400')} />
);

function FormField({ spec, value, onChange }: { spec: FieldSpec; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);

  if (spec.type === 'boolean') {
    return (
      <div>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-300">
          <input type="checkbox" checked={value === 'true'} onChange={e => onChange(e.target.checked ? 'true' : 'false')}
            className="accent-purple-500 w-4 h-4 rounded" />
          {spec.label}
        </label>
        {spec.hint && <p className="text-[11px] text-gray-600 mt-1 ml-6">{spec.hint}</p>}
      </div>
    );
  }

  if (spec.type === 'select') {
    return (
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          {spec.label}{spec.required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        <div className="relative">
          <select value={value} onChange={e => onChange(e.target.value)} required={spec.required}
            className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500/60 pr-8">
            {spec.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
        {spec.hint && <p className="text-[11px] text-gray-600 mt-1">{spec.hint}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">
        {spec.label}{spec.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input type={spec.type === 'password' && !show ? 'password' : spec.type === 'number' ? 'number' : 'text'}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={spec.placeholder} required={spec.required}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/60 pr-8" />
        {spec.type === 'password' && (
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </div>
      {spec.hint && <p className="text-[11px] text-gray-600 mt-1">{spec.hint}</p>}
    </div>
  );
}

// ─── Slide panel ──────────────────────────────────────────────────────────────

function SlidePanel({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <>
      <div onClick={onClose} className={cn(
        'fixed inset-0 bg-black/60 z-40 transition-opacity duration-200',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )} />
      <div className={cn(
        'fixed top-0 right-0 h-full w-full max-w-lg bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-2xl transition-transform duration-200',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </>
  );
}

// ─── Confirm delete dialog ────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel, loading }: {
  message: string; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-start gap-3 mb-5">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-200">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 transition-colors">
            Annuler
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MARKETPLACE
// ══════════════════════════════════════════════════════════════════════════════

function ConnectorMarketplace({ open, existingConnectors, onSelect, onCustom, onClose }: {
  open: boolean;
  existingConnectors: any[];
  onSelect: (type: ConnectorTypeValue) => void;
  onCustom: () => void;
  onClose: () => void;
}) {
  const [query,       setQuery]       = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const groups = [...new Set(CONNECTOR_TYPES.map(t => t.group))];
  const counts = existingConnectors.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1; return acc;
  }, {});

  const filtered = CONNECTOR_TYPES.filter(t =>
    (!activeGroup || t.group === activeGroup) &&
    (!query ||
      t.label.toLowerCase().includes(query.toLowerCase()) ||
      t.description.toLowerCase().includes(query.toLowerCase())),
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <LayoutGrid size={16} className="text-purple-400" />
            <h2 className="text-base font-semibold text-gray-100">Marketplace des connecteurs</h2>
            <Badge className="bg-gray-800 text-gray-400">{CONNECTOR_TYPES.length} types disponibles</Badge>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Search + group filters */}
        <div className="px-6 pt-4 pb-3 border-b border-gray-800 space-y-3 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher un connecteur…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/60"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveGroup(null)}
              className={cn('px-2.5 py-1 rounded-full text-xs transition-colors', !activeGroup ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
              Tous ({CONNECTOR_TYPES.length})
            </button>
            {groups.map(g => (
              <button
                key={g}
                onClick={() => setActiveGroup(g === activeGroup ? null : g)}
                className={cn('px-2.5 py-1 rounded-full text-xs transition-colors', activeGroup === g ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                {g} ({CONNECTOR_TYPES.filter(t => t.group === g).length})
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-600">
              <Search size={28} className="opacity-30 mb-3" />
              <p className="text-sm">Aucun résultat pour «&#160;{query}&#160;»</p>
              <button onClick={() => setQuery('')} className="text-xs text-purple-400 mt-2 hover:text-purple-300">
                Effacer la recherche
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(t => {
                const count = counts[t.value] ?? 0;
                return (
                  <button
                    key={t.value}
                    onClick={() => onSelect(t.value)}
                    className="group text-left bg-gray-800/40 border border-gray-700/60 rounded-xl p-4 hover:border-purple-600/60 hover:bg-purple-900/10 transition-all focus:outline-none focus:ring-1 focus:ring-purple-500/40">
                    <div className="flex items-start justify-between mb-3">
                      <div className={cn('p-2.5 rounded-xl', t.bg)}>
                        <t.Icon size={17} className={t.ic} />
                      </div>
                      {count > 0 && (
                        <Badge className="bg-emerald-900/30 border border-emerald-700/30 text-emerald-400">
                          {count}&nbsp;✓
                        </Badge>
                      )}
                    </div>
                    <div className="font-medium text-sm text-gray-100 mb-1 leading-tight">{t.label}</div>
                    <div className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{t.description}</div>
                    <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-purple-400 group-hover:text-purple-300 transition-colors">
                      <Plus size={10} /> Configurer
                    </div>
                  </button>
                );
              })}

              {/* Custom connector tile — shown when no group filter or Générique, or when search matches */}
              {(!activeGroup || activeGroup === 'Générique' ||
                'personnalisé custom'.includes(query.toLowerCase())) && (
                <button
                  onClick={onCustom}
                  className="group text-left bg-gray-800/20 border border-dashed border-gray-600 rounded-xl p-4 hover:border-purple-600/60 hover:bg-purple-900/10 transition-all focus:outline-none focus:ring-1 focus:ring-purple-500/40">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2.5 rounded-xl bg-gray-800 border border-gray-700">
                      <Plus size={17} className="text-gray-400 group-hover:text-purple-400 transition-colors" />
                    </div>
                  </div>
                  <div className="font-medium text-sm text-gray-100 mb-1 leading-tight">Connecteur personnalisé</div>
                  <div className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                    Votre connecteur n'est pas dans la liste ? Définissez votre propre type avec des paramètres libres.
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-gray-500 group-hover:text-purple-300 transition-colors">
                    <Zap size={10} /> Personnaliser
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONNECTORS
// ══════════════════════════════════════════════════════════════════════════════

function ConnectorForm({ initial, defaultType, onSave, onClose }: {
  initial?: any; defaultType?: ConnectorTypeValue; onSave: (d: any) => Promise<void>; onClose: () => void;
}) {
  const isEdit = !!initial?.id;
  const [name, setName]       = useState(initial?.name ?? '');
  const [type, setType]       = useState<ConnectorTypeValue>((initial?.type as ConnectorTypeValue) ?? defaultType ?? 'postgresql');
  const [fields, setFields]   = useState<Record<string, string>>(() =>
    initial?.config
      ? Object.fromEntries(Object.entries(initial.config as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]))
      : {},
  );
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  const specs    = CONNECTOR_FIELDS[type] ?? [];
  const typeInfo = CONNECTOR_TYPES.find(t => t.value === type);
  const groups   = [...new Set(CONNECTOR_TYPES.map(t => t.group))];
  const setF     = (key: string, val: string) => setFields(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const config: Record<string, unknown> = {};
      for (const s of specs) {
        const v = fields[s.key] ?? '';
        if (s.type === 'boolean') config[s.key] = v === 'true';
        else if (s.type === 'number') { if (v) config[s.key] = Number(v); }
        else if (v) config[s.key] = v;
      }
      await onSave({ name, type, config });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  const buildConfig = (): Record<string, unknown> => {
    const config: Record<string, unknown> = {};
    for (const s of specs) {
      const v = fields[s.key] ?? '';
      if (s.type === 'boolean') config[s.key] = v === 'true';
      else if (s.type === 'number') { if (v) config[s.key] = Number(v); }
      else if (v) config[s.key] = v;
    }
    return config;
  };

  const handleTest = async () => {
    setTestStatus('loading');
    setTestMessage('');
    try {
      let res: any;
      if (isEdit && initial?.id) {
        res = await connectorsApi.test(initial.id);
      } else {
        res = await connectorsApi.testConfig({ type, config: buildConfig() });
      }
      const d = res?.data ?? res;
      const ok = d?.success !== false;
      setTestStatus(ok ? 'ok' : 'fail');
      setTestMessage(d?.message ?? (ok ? 'Connexion réussie' : 'Échec de connexion'));
      if (d?.latency) setTestMessage(prev => `${prev} — ${d.latency}ms`);
    } catch (err: any) {
      setTestStatus('fail');
      setTestMessage(err?.response?.data?.message ?? err?.response?.data?.error ?? err?.message ?? 'Erreur de connexion');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Nom <span className="text-red-400">*</span></label>
        <input value={name} onChange={e => setName(e.target.value)} required
          placeholder="Ex : PostgreSQL Production"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/60" />
      </div>

      {!isEdit ? (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Type <span className="text-red-400">*</span></label>
          <div className="relative">
            <select value={type} onChange={e => { setType(e.target.value as ConnectorTypeValue); setFields({}); }}
              className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500/60 pr-8">
              {groups.map(g => (
                <optgroup key={g} label={g}>
                  {CONNECTOR_TYPES.filter(t => t.group === g).map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-2 px-3 rounded-lg border border-gray-700 bg-gray-800/50">
          {typeInfo && <typeInfo.Icon size={14} className="text-gray-400" />}
          <span className="text-sm text-gray-300">{typeInfo?.label ?? type}</span>
          <span className="text-xs text-gray-600 ml-1">(type immuable)</span>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Configuration</p>
        {specs.length === 0
          ? <p className="text-xs text-gray-500 italic">Aucun champ requis pour ce type.</p>
          : specs.map(s => <FormField key={s.key} spec={s} value={fields[s.key] ?? ''} onChange={v => setF(s.key, v)} />)
        }
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* ── Test de connexion ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">Tester la connexion avant de sauvegarder</span>
          <button
            type="button"
            onClick={handleTest}
            disabled={testStatus === 'loading'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
              testStatus === 'ok'      ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40' :
              testStatus === 'fail'    ? 'bg-red-900/30 text-red-400 border-red-700/40' :
              testStatus === 'loading' ? 'text-gray-500 border-gray-700' :
                                         'text-purple-400 border-purple-700/40 hover:bg-purple-900/20'
            }`}>
            {testStatus === 'loading' ? <Loader2 size={11} className="animate-spin" /> :
             testStatus === 'ok'      ? <CheckCircle2 size={11} /> :
             testStatus === 'fail'    ? <XCircle size={11} /> :
                                        <Zap size={11} />}
            {testStatus === 'ok' ? 'OK' : testStatus === 'fail' ? 'Échec' : testStatus === 'loading' ? 'Test…' : 'Tester'}
          </button>
        </div>
        {testMessage && (
          <p className={`mt-1.5 text-xs ${
            testStatus === 'ok' ? 'text-emerald-400' : 'text-red-400'
          }`}>{testMessage}</p>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 transition-colors">
          Annuler
        </button>
        <button type="submit" disabled={saving || !name}
          className="flex-1 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 size={13} className="animate-spin" />}
          {isEdit ? 'Enregistrer' : 'Créer le connecteur'}
        </button>
      </div>
    </form>
  );
}

// ─── Custom connector form ───────────────────────────────────────────────────

interface CustomField { key: string; value: string; isSecret: boolean; }

function CustomConnectorForm({ onSave, onClose }: {
  onSave: (d: any) => Promise<void>; onClose: () => void;
}) {
  const [name,     setName]     = useState('');
  const [baseType, setBaseType] = useState<ConnectorTypeValue>('rest_api');
  const [rows,     setRows]     = useState<CustomField[]>([
    { key: '', value: '', isSecret: false },
  ]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const groups = [...new Set(CONNECTOR_TYPES.map(t => t.group))];

  const setRow = (i: number, patch: Partial<CustomField>) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const addRow  = () => setRows(prev => [...prev, { key: '', value: '', isSecret: false }]);
  const delRow  = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const config: Record<string, unknown> = {};
      for (const r of rows) {
        if (r.key.trim()) config[r.key.trim()] = r.value;
      }
      await onSave({ name, type: baseType, config });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-start gap-2 bg-purple-900/20 border border-purple-700/30 rounded-lg px-3 py-2.5">
        <Zap size={13} className="text-purple-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-purple-300 leading-relaxed">
          Définissez librement le nom, le type de base (protocole backend) et tous les paramètres de configuration clé/valeur dont vous avez besoin.
        </p>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Nom du connecteur <span className="text-red-400">*</span></label>
        <input value={name} onChange={e => setName(e.target.value)} required
          placeholder="Ex : Mon API interne v2"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/60" />
      </div>

      {/* Base type */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Type de base <span className="text-gray-600 ml-1 font-normal">(protocole de connexion backend)</span>
        </label>
        <div className="relative">
          <select value={baseType} onChange={e => setBaseType(e.target.value as ConnectorTypeValue)}
            className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500/60 pr-8">
            {groups.map(g => (
              <optgroup key={g} label={g}>
                {CONNECTOR_TYPES.filter(t => t.group === g).map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {/* Dynamic key-value rows */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Paramètres de configuration</p>
          <button type="button" onClick={addRow}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors">
            <Plus size={11} /> Ajouter un champ
          </button>
        </div>

        {/* header row */}
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center text-[10px] text-gray-600 uppercase tracking-wide px-0.5">
          <span>Clé</span><span>Valeur</span><span>Secret</span><span />
        </div>

        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
            <input value={r.key} onChange={e => setRow(i, { key: e.target.value })}
              placeholder="ma_cle"
              className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono" />
            <div className="relative">
              <input value={r.value} onChange={e => setRow(i, { value: e.target.value })}
                type={r.isSecret ? 'password' : 'text'}
                placeholder="valeur"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
            </div>
            <button type="button" title={r.isSecret ? 'Masqué' : 'Visible'}
              onClick={() => setRow(i, { isSecret: !r.isSecret })}
              className={cn('p-1.5 rounded-lg transition-colors', r.isSecret ? 'text-amber-400 bg-amber-900/20' : 'text-gray-600 hover:text-gray-400')}>
              {r.isSecret ? <Lock size={13} /> : <Eye size={13} />}
            </button>
            <button type="button" onClick={() => delRow(i)} disabled={rows.length === 1}
              className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 transition-colors disabled:opacity-30">
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        {rows.every(r => !r.key.trim()) && (
          <p className="text-[11px] text-gray-600 italic pt-1">Ajoutez au moins un paramètre (ex : baseUrl, apiKey…)</p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />{error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 transition-colors">
          Annuler
        </button>
        <button type="submit" disabled={saving || !name}
          className="flex-1 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 size={13} className="animate-spin" />}
          Créer le connecteur
        </button>
      </div>
    </form>
  );
}

function ConnectorCard({ c, onEdit, onDelete, onTest }: {
  c: any; onEdit: (c: any) => void; onDelete: (id: string) => void; onTest: (id: string) => Promise<boolean>;
}) {
  const [ts, setTs] = useState<TestState>('idle');
  const ti = CONNECTOR_TYPES.find(t => t.value === c.type);
  const Icon = ti?.Icon ?? Plug;

  const handleTest = async () => {
    setTs('loading');
    const ok = await onTest(c.id);
    setTs(ok ? 'ok' : 'fail');
    setTimeout(() => setTs('idle'), 3500);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-gray-800 text-gray-400 group-hover:text-gray-200 transition-colors">
            <Icon size={15} />
          </div>
          <div>
            <div className="font-medium text-sm text-gray-100 leading-tight">{c.name}</div>
            <div className="text-[11px] text-gray-500 mt-0.5 capitalize">{ti?.label ?? c.type}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(c)} title="Modifier"
            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(c.id)} title="Supprimer"
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* non-sensitive config preview */}
      {c.config && (() => {
        const entries = Object.entries(c.config as Record<string, unknown>)
          .filter(([k]) => !/(pass|secret|token|key|credential)/i.test(k))
          .slice(0, 3);
        if (!entries.length) return null;
        return (
          <div className="mb-3 space-y-0.5">
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-[11px]">
                <span className="text-gray-600 capitalize w-20 shrink-0 truncate">{k}</span>
                <span className="text-gray-400 font-mono truncate">{String(v).slice(0, 28)}</span>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="flex items-center justify-between pt-3 border-t border-gray-800">
        <span className="text-[11px] text-gray-600">{rel(c.updatedAt ?? c.createdAt)}</span>
        <button onClick={handleTest} disabled={ts === 'loading'}
          className={cn(
            'flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-all',
            ts === 'ok'      ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40' :
            ts === 'fail'    ? 'bg-red-900/30 text-red-400 border-red-700/40' :
            ts === 'loading' ? 'text-gray-500 border-gray-700' :
            'text-gray-500 border-gray-700 hover:text-purple-300 hover:border-purple-700/40',
          )}>
          {ts === 'loading' ? <Loader2 size={11} className="animate-spin" /> :
           ts === 'ok'      ? <CheckCircle2 size={11} /> :
           ts === 'fail'    ? <XCircle size={11} /> :
           <Zap size={11} />}
          {ts === 'ok' ? 'OK' : ts === 'fail' ? 'Échec' : ts === 'loading' ? 'Test…' : 'Tester'}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  NODES
// ══════════════════════════════════════════════════════════════════════════════

function NodeCard({ n }: { n: any }) {
  const lastSeen = n.lastSeen ?? n.lastSeenAt ?? n.updatedAt;
  const secs     = lastSeen ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000) : 9999;
  const online   = secs < 60;
  const statusLabel = secs < 30 ? 'En ligne' : secs < 300 ? 'Inactif' : 'Hors ligne';
  const statusColor = secs < 30 ? 'text-emerald-400' : secs < 300 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-gray-800"><MonitorSmartphone size={15} className="text-gray-400" /></div>
          <div>
            <div className="flex items-center gap-1.5">
              <Dot online={online} />
              <span className="font-medium text-sm text-gray-100">{n.label ?? n.name ?? n.nodeId ?? n.id}</span>
            </div>
            <div className="text-[11px] text-gray-500 capitalize mt-0.5">{n.tier ?? n.type ?? 'node'}</div>
          </div>
        </div>
        <span className={cn('text-xs font-medium', statusColor)}>{statusLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        {n.version && (
          <div><div className="text-gray-500">Version</div><div className="font-mono text-gray-300">{n.version}</div></div>
        )}
        <div><div className="text-gray-500">Vu</div><div className="text-gray-300">{rel(lastSeen)}</div></div>
        {(n.latencyToCentralMs ?? n.latencyMs) != null && (
          <div><div className="text-gray-500">Latence</div><div className="text-gray-300">{n.latencyToCentralMs ?? n.latencyMs} ms</div></div>
        )}
      </div>

      {(n.capabilities ?? n.supportedTriggerDrivers)?.length > 0 && (
        <div className="pt-2 border-t border-gray-800 flex flex-wrap gap-1">
          {[...(n.capabilities ?? []), ...(n.supportedTriggerDrivers ?? [])].slice(0, 6).map((cap: string) => (
            <Badge key={cap} className="bg-purple-900/30 border border-purple-700/30 text-purple-300">{cap}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function NodeRegisterHelper() {
  const [copied, setCopied] = useState(false);
  const [nodeId, setNodeId] = useState('node-edge-01');
  const [label,  setLabel]  = useState('Edge Node 01');
  const [apiUrl, setApiUrl] = useState('http://localhost:3001');

  const cmd = `curl -X POST ${apiUrl}/api/nodes/register \\\n  -H "Content-Type: application/json" \\\n  -d '{"nodeId":"${nodeId}","label":"${label}","tier":"edge","status":"ONLINE","capabilities":["execute"]}'`;

  const copy = async () => {
    await navigator.clipboard.writeText(cmd.replace(/\\n/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
        <Cpu size={14} className="text-purple-400" />
        Enregistrer un nœud manuellement
      </div>
      <p className="text-xs text-gray-500">
        Les nœuds s'enregistrent automatiquement au démarrage. Vous pouvez aussi les enregistrer via <code className="text-purple-400 bg-gray-900 px-1 rounded">POST /api/nodes/register</code>.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Node ID', value: nodeId, set: setNodeId },
          { label: 'Label',   value: label,  set: setLabel  },
          { label: 'API URL', value: apiUrl, set: setApiUrl },
        ].map(f => (
          <div key={f.label}>
            <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
            <input value={f.value} onChange={e => f.set(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
          </div>
        ))}
      </div>
      <div className="relative">
        <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-[11px] font-mono text-gray-400 overflow-x-auto whitespace-pre">{cmd}</pre>
        <button onClick={copy}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-gray-800 text-gray-400 hover:text-gray-100 transition-colors">
          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  LLM CONFIG
// ══════════════════════════════════════════════════════════════════════════════

function LlmForm({ initial, onSave, onClose }: {
  initial?: any; onSave: (d: any) => Promise<void>; onClose: () => void;
}) {
  const isEdit = !!initial?.id;
  const [provider,    setProvider]    = useState(initial?.provider    ?? 'openai');
  const [model,       setModel]       = useState(initial?.model       ?? '');
  const [agentName,   setAgentName]   = useState(initial?.name        ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [apiKey,      setApiKey]      = useState('');
  const [apiUrl,      setApiUrl]      = useState(
    initial?.localConfig?.apiUrl ?? initial?.apiConfig?.apiUrl ?? (initial?.apiConfig?.apiUrl) ?? '',
  );
  const [apiVersion,    setApiVersion]    = useState(initial?.apiConfig?.apiVersion ?? '');
  const [deployment,    setDeployment]    = useState(initial?.apiConfig?.deployment ?? '');
  const [temperature,   setTemperature]   = useState(String(initial?.temperature   ?? '0.7'));
  const [maxTokens,     setMaxTokens]     = useState(String(initial?.maxTokens     ?? '2000'));
  const [isDefault,     setIsDefault]     = useState<boolean>(initial?.isDefault   ?? false);
  const [showKey,       setShowKey]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  // Advanced params
  const [topP,             setTopP]             = useState(String(initial?.topP             ?? ''));
  const [freqPenalty,      setFreqPenalty]      = useState(String(initial?.frequencyPenalty ?? ''));
  const [presPenalty,      setPresPenalty]      = useState(String(initial?.presencePenalty  ?? ''));
  const [seed,             setSeed]             = useState(String(initial?.seed             ?? ''));
  const [responseFormat,   setResponseFormat]   = useState<string>(initial?.responseFormat  ?? 'text');
  const [contextWindow,    setContextWindow]    = useState(String(initial?.contextWindow    ?? ''));
  const [stopSeqs,         setStopSeqs]         = useState<string>((initial?.stopSequences ?? []).join(', '));
  const [systemPrompt,     setSystemPrompt]     = useState(initial?.systemPrompt            ?? '');
  // Skills + task affinities
  const [selectedSkills, setSelectedSkills] = useState<string[]>(initial?.skills ?? []);
  const [taskAffinities,  setTaskAffin]     = useState<Record<string, number>>(
    () => Object.fromEntries((initial?.taskAffinities ?? []).map((t: any) => [t.taskType, t.score])),
  );

  const pi      = LLM_PROVIDERS.find(p => p.value === provider);
  const models  = LLM_MODELS[provider] ?? [];
  const isLocal = pi?.isLocal ?? false;

  const toggleSkill = (s: string) =>
    setSelectedSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const data: Record<string, unknown> = {
        provider, isDefault,
        model:       (model || models[0]?.value) ?? '',
        name:        agentName  || undefined,
        description: description || undefined,
        temperature: Number(temperature),
        maxTokens:   Number(maxTokens),
        skills:      selectedSkills,
        taskAffinities: Object.entries(taskAffinities)
          .filter(([, v]) => v > 0)
          .map(([taskType, score]) => ({ taskType, score })),
        systemPrompt: systemPrompt || undefined,
        ...(topP           ? { topP:             Number(topP)        } : {}),
        ...(freqPenalty    ? { frequencyPenalty: Number(freqPenalty) } : {}),
        ...(presPenalty    ? { presencePenalty:  Number(presPenalty) } : {}),
        ...(seed           ? { seed:             Number(seed)        } : {}),
        ...(responseFormat !== 'text' ? { responseFormat } : {}),
        ...(contextWindow  ? { contextWindow:    Number(contextWindow) } : {}),
        stopSequences: stopSeqs ? stopSeqs.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      if (isLocal && apiUrl) {
        data.localConfig = {
          type: provider === 'ollama_local' ? 'ollama' : 'llama_cpp',
          apiUrl, gpuEnabled: false, cpuThreads: 4,
          contextWindow: contextWindow ? Number(contextWindow) : 4096,
        };
      }
      if (!isLocal && apiKey) {
        data.apiConfig = {
          apiKey,
          ...(apiUrl      ? { apiUrl }      : {}),
          ...(apiVersion  ? { apiVersion }  : {}),
          ...(deployment  ? { deployment }  : {}),
        };
      }
      await onSave(data);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/60';
  const smallInputCls = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500/60';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Identity ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Identité de l'agent</p>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Nom de l'agent</label>
          <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="ex : Analyseur de données, Compilateur de DAG…"
            className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="À quoi sert cet agent LLM ?"
            className={inputCls} />
        </div>
      </div>

      {/* ── Provider & Model ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fournisseur & modèle</p>
        {!isEdit ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Fournisseur <span className="text-red-400">*</span></label>
              <div className="relative">
                <select value={provider} onChange={e => { setProvider(e.target.value); setModel(''); }}
                  className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500/60 pr-8">
                  {LLM_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Modèle <span className="text-red-400">*</span></label>
              {provider === 'custom' || provider === 'huggingface' ? (
                <input value={model} onChange={e => setModel(e.target.value)} placeholder="ex : meta-llama/Llama-3…"
                  className={inputCls} />
              ) : (
                <div className="relative">
                  <select value={(model || models[0]?.value) ?? ''} onChange={e => setModel(e.target.value)}
                    className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500/60 pr-8">
                    {models.map(m => (
                      <option key={m.value} value={m.value}>
                        {m.label}{'ctx' in m && m.ctx ? ` (${(m.ctx/1000).toFixed(0)}k ctx)` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-2 px-3 rounded-lg border border-gray-700 bg-gray-800/50">
            <BrainCircuit size={14} className="text-gray-400" />
            <span className="text-sm text-gray-300">{pi?.label ?? provider} / {initial?.model}</span>
            <span className="text-xs text-gray-600 ml-1">(immuable)</span>
          </div>
        )}

        {/* API key / local URL */}
        {isLocal ? (
          <div>
            <label className="block text-xs text-gray-400 mb-1">URL de l'API locale <span className="text-red-400">*</span></label>
            <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
              placeholder={provider === 'ollama_local' ? 'http://localhost:11434' : 'http://localhost:8080'}
              className={inputCls} />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Clé API {!isEdit && <span className="text-red-400">*</span>}
                {isEdit && <span className="text-gray-600 ml-1">(laisser vide pour conserver)</span>}
              </label>
              <div className="relative">
                <input value={apiKey} onChange={e => setApiKey(e.target.value)}
                  type={showKey ? 'text' : 'password'} placeholder={isEdit ? '••••••••' : 'sk-…'}
                  className={cn(inputCls, 'pr-8')} />
                <button type="button" onClick={() => setShowKey(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
            {(provider === 'azure_openai') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Endpoint Azure <span className="text-red-400">*</span></label>
                  <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
                    placeholder="https://my-res.openai.azure.com/" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Déploiement</label>
                  <input value={deployment} onChange={e => setDeployment(e.target.value)}
                    placeholder="gpt-4o" className={inputCls} />
                </div>
              </div>
            )}
            {(provider === 'custom' || provider === 'huggingface') && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Base URL</label>
                <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
                  placeholder="https://api.example.com/v1" className={inputCls} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Base generation params ─────────────────────────────────────────── */}
      <div className="bg-gray-800/50 rounded-lg p-3 space-y-3">
        <p className="text-xs font-medium text-gray-500">Paramètres de génération</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Température <span className="text-gray-600">(0 – 2)</span></label>
            <input type="number" value={temperature} onChange={e => setTemperature(e.target.value)}
              min="0" max="2" step="0.05" className={smallInputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Max tokens</label>
            <input type="number" value={maxTokens} onChange={e => setMaxTokens(e.target.value)}
              min="100" max="200000" step="100" className={smallInputCls} />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-300">
          <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)}
            className="accent-purple-500 w-4 h-4 rounded" />
          Définir comme agent LLM par défaut
        </label>
      </div>

      {/* ── Advanced params (collapsible) ──────────────────────────────────── */}
      <div>
        <button type="button" onClick={() => setShowAdvanced(s => !s)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full">
          <ChevronDown size={12} className={cn('transition-transform', showAdvanced && 'rotate-180')} />
          Paramètres avancés
        </button>
        {showAdvanced && (
          <div className="mt-3 grid grid-cols-2 gap-3 bg-gray-800/30 rounded-lg p-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Top-P <span className="text-gray-600">(0–1)</span></label>
              <input type="number" value={topP} onChange={e => setTopP(e.target.value)}
                min="0" max="1" step="0.05" placeholder="1" className={smallInputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Freq-Penalty <span className="text-gray-600">(-2–2)</span></label>
              <input type="number" value={freqPenalty} onChange={e => setFreqPenalty(e.target.value)}
                min="-2" max="2" step="0.1" placeholder="0" className={smallInputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Presence-Penalty</label>
              <input type="number" value={presPenalty} onChange={e => setPresPenalty(e.target.value)}
                min="-2" max="2" step="0.1" placeholder="0" className={smallInputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Seed <span className="text-gray-600">(déterminisme)</span></label>
              <input type="number" value={seed} onChange={e => setSeed(e.target.value)}
                min="0" placeholder="aléatoire" className={smallInputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Format de sortie</label>
              <select value={responseFormat} onChange={e => setResponseFormat(e.target.value)}
                className="w-full appearance-none bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none">
                <option value="text">Texte libre</option>
                <option value="json_object">JSON structuré</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Context window <span className="text-gray-600">(tokens)</span></label>
              <input type="number" value={contextWindow} onChange={e => setContextWindow(e.target.value)}
                min="1024" step="1024" placeholder="défaut modèle" className={smallInputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Stop sequences <span className="text-gray-600">(séparés par virgule)</span></label>
              <input value={stopSeqs} onChange={e => setStopSeqs(e.target.value)}
                placeholder='ex : "\n\n", "###"' className={smallInputCls} />
            </div>
          </div>
        )}
      </div>

      {/* ── System Prompt ──────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Prompt système <span className="text-gray-600">(injecté avant chaque appel)</span></label>
        <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={3}
          placeholder="Tu es un expert en compilation de règles d'automatisation. Réponds toujours en JSON valide…"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/60 resize-y" />
      </div>

      {/* ── Skills ─────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Compétences déclarées</p>
        {(['Code', 'Eyeflow', 'Data', 'Langue', 'Analyse', 'Fonctions'] as const).map(group => (
          <div key={group} className="mb-2">
            <p className="text-[10px] text-gray-600 mb-1">{group}</p>
            <div className="flex flex-wrap gap-1.5">
              {LLM_SKILL_OPTIONS.filter(s => s.group === group).map(s => {
                const active = selectedSkills.includes(s.value);
                return (
                  <button key={s.value} type="button" onClick={() => toggleSkill(s.value)}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] border transition-colors',
                      active
                        ? 'bg-purple-900/40 border-purple-700/60 text-purple-300'
                        : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400',
                    )}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Task Affinities ────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Affinités de tâches <span className="text-gray-600 normal-case font-normal">(score 0-100)</span></p>
        <div className="space-y-2">
          {LLM_TASK_OPTIONS.map(t => (
            <div key={t.value} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-40 shrink-0">{t.label}</span>
              <input type="range" min="0" max="100" step="5"
                value={taskAffinities[t.value] ?? 0}
                onChange={e => setTaskAffin(prev => ({ ...prev, [t.value]: Number(e.target.value) }))}
                className="flex-1 accent-purple-500" />
              <span className="text-xs text-gray-500 w-8 text-right">{taskAffinities[t.value] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />{error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 transition-colors">
          Annuler
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 size={13} className="animate-spin" />}
          {isEdit ? 'Enregistrer' : "Ajouter l'agent LLM"}
        </button>
      </div>
    </form>
  );
}

function LlmCard({ p, onEdit, onDelete, onSetDefault }: {
  p: any; onEdit: (p: any) => void; onDelete: (id: string) => void; onSetDefault: (id: string) => void;
}) {
  const pi = LLM_PROVIDERS.find(pr => pr.value === p.provider);

  // Top-2 task affinities sorted by score descending
  const topAffinities: { taskType: string; score: number }[] = [...(p.taskAffinities ?? [])]
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 2);

  const taskLabel = (taskType: string) =>
    LLM_TASK_OPTIONS.find(t => t.value === taskType)?.label ?? taskType;

  // Skills: show first 4, then "+N"
  const skills: string[] = p.skills ?? [];
  const visibleSkills = skills.slice(0, 4);
  const extraSkills = skills.length - visibleSkills.length;

  const agentName = p.name?.trim() || pi?.label || p.provider;

  return (
    <div className={cn(
      'bg-gray-900 border rounded-xl p-4 hover:border-gray-700 transition-colors group relative flex flex-col gap-3',
      p.isDefault ? 'border-purple-700/50' : 'border-gray-800',
    )}>
      {p.isDefault && (
        <div className="absolute -top-2.5 left-3">
          <Badge className="bg-purple-600 text-white shadow-md"><Star size={9} /> Défaut</Badge>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-gray-800 shrink-0">
            <BrainCircuit size={15} className={p.isDefault ? 'text-purple-400' : 'text-gray-400'} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm text-gray-100 truncate flex items-center gap-1.5">
              {agentName}
              {p.systemPrompt && (
                <span title="Prompt système configuré"
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-700/40 text-indigo-300 text-[8px] font-bold shrink-0">
                  S
                </span>
              )}
            </div>
            <div className="font-mono text-[11px] text-gray-500 mt-0.5 truncate">
              {p.provider !== agentName ? `${pi?.label ?? p.provider} · ` : ''}{p.model ?? '—'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onEdit(p)} title="Modifier"
            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(p.id)} title="Supprimer"
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Description ────────────────────────────────────────────────────── */}
      {p.description && (
        <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{p.description}</p>
      )}

      {/* ── Generation params ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div><span className="text-gray-500">Température </span><span className="text-gray-300">{p.temperature ?? '—'}</span></div>
        <div><span className="text-gray-500">Max tokens </span><span className="text-gray-300">{p.maxTokens?.toLocaleString() ?? '—'}</span></div>
        {p.contextWindow && (
          <div><span className="text-gray-500">Contexte </span><span className="text-gray-300">{(p.contextWindow / 1000).toFixed(0)}k tokens</span></div>
        )}
        {p.responseFormat === 'json_object' && (
          <div className="text-indigo-400 text-[11px] flex items-center gap-1">JSON mode</div>
        )}
        {pi?.isLocal && (
          <div className="col-span-2"><span className="text-gray-500">URL </span><span className="font-mono text-gray-300 text-[11px]">{p.apiUrl ?? '—'}</span></div>
        )}
      </div>

      {/* ── Task affinities ────────────────────────────────────────────────── */}
      {topAffinities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topAffinities.map(af => (
            <span key={af.taskType}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-900/30 border border-purple-700/30 text-[10px] text-purple-300">
              <span className="font-mono text-purple-500">{af.score}</span>
              {taskLabel(af.taskType)}
            </span>
          ))}
        </div>
      )}

      {/* ── Skills ─────────────────────────────────────────────────────────── */}
      {visibleSkills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {visibleSkills.map(skill => (
            <span key={skill}
              className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-400">
              {skill.replace(/_/g, ' ')}
            </span>
          ))}
          {extraSkills > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-500">
              +{extraSkills}
            </span>
          )}
        </div>
      )}

      {/* ── Set-default action ─────────────────────────────────────────────── */}
      {!p.isDefault && (
        <button onClick={() => onSetDefault(p.id)}
          className="w-full text-xs border border-gray-700 rounded-lg py-1.5 text-gray-400 hover:bg-gray-800 hover:border-purple-700/40 hover:text-purple-300 transition-colors flex items-center justify-center gap-1.5 mt-auto">
          <Star size={11} /> Définir par défaut
        </button>
      )}
    </div>
  );
}

function LlmTestPanel() {
  const [prompt,  setPrompt]  = useState('');
  const [result,  setResult]  = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    try {
      await llmConfigApi.getDefault();
      setResult(`✓ Connexion au fournisseur LLM par défaut établie.\n\nPrompt : "${prompt}"\n\n[Ping réussi — pour un vrai test de génération, exposez un endpoint /llm-config/test]`);
    } catch {
      setResult('✗ Impossible de joindre le fournisseur LLM par défaut. Vérifiez la configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
        <Zap size={13} className="text-purple-400" /> Tester la connexion LLM
      </div>
      <div className="flex gap-2">
        <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && prompt.trim() && run()}
          placeholder="Saisir un prompt de test…"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/60" />
        <button onClick={run} disabled={loading || !prompt.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          Tester
        </button>
      </div>
      {result && (
        <pre className={cn(
          'rounded-lg p-3 text-xs font-mono whitespace-pre-wrap',
          result.startsWith('✗') ? 'bg-red-900/20 text-red-400 border border-red-800/40' : 'bg-emerald-900/20 text-emerald-400 border border-emerald-800/40',
        )}>{result}</pre>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

type Tab = 'connectors' | 'nodes' | 'llm';

const TABS: Array<{ key: Tab; label: string; Icon: React.ElementType }> = [
  { key: 'connectors', label: 'Connecteurs', Icon: Plug         },
  { key: 'nodes',      label: 'Nœuds',       Icon: Server       },
  { key: 'llm',        label: 'LLM',         Icon: BrainCircuit },
];

export default function ConfigurationPage() {
  const [tab,          setTab]          = useState<Tab>('connectors');
  const [connectors,   setConnectors]   = useState<any[]>([]);
  const [nodes,        setNodes]        = useState<any[]>([]);
  const [llmProviders, setLlmProviders] = useState<any[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // panel
  const [panelOpen,       setPanelOpen]       = useState(false);
  const [editing,         setEditing]         = useState<any | null>(null);
  const [panelTitle,      setPanelTitle]      = useState('');
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [pendingType,     setPendingType]     = useState<ConnectorTypeValue>('postgresql');
  const [isCustomForm,    setIsCustomForm]    = useState(false);

  // delete confirm
  const [deleteTarget,  setDeleteTarget]  = useState<{ id: string; type: Tab } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [c, n, l] = await Promise.all([
        connectorsApi.list().catch(() => ({ data: [] })),
        nodesApi.list().catch(() => ({ data: [] })),
        llmConfigApi.list().catch(() => ({ data: [] })),
      ]) as [any, any, any];
      setConnectors(Array.isArray(c?.data) ? c.data : Array.isArray(c) ? c : []);
      setNodes(      Array.isArray(n?.data) ? n.data : Array.isArray(n) ? n : []);
      setLlmProviders(Array.isArray(l?.data) ? l.data : Array.isArray(l) ? l : []);
    } catch (e: any) {
      setError(e?.message ?? 'Chargement échoué');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    if (tab === 'connectors') {
      setMarketplaceOpen(true);
    } else {
      setEditing(null);
      setPanelTitle('Nouveau fournisseur LLM');
      setPanelOpen(true);
    }
  };

  const openFromMarket = (type: ConnectorTypeValue) => {
    const ti = CONNECTOR_TYPES.find(t => t.value === type);
    setIsCustomForm(false);
    setPendingType(type);
    setPanelTitle(`Nouveau connecteur — ${ti?.label ?? type}`);
    setMarketplaceOpen(false);
    setPanelOpen(true);
  };

  const openFromMarketCustom = () => {
    setEditing(null);
    setIsCustomForm(true);
    setPanelTitle('Connecteur personnalisé');
    setMarketplaceOpen(false);
    setPanelOpen(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setPanelTitle(
      tab === 'connectors' ? `Modifier "${item.name}"` :
      tab === 'llm'        ? `Modifier ${LLM_PROVIDERS.find(p => p.value === item.provider)?.label ?? item.provider}` : '',
    );
    setPanelOpen(true);
  };

  const testConnector = async (id: string) => {
    try { await connectorsApi.test(id); return true; } catch { return false; }
  };

  const saveConnector = async (data: any) => {
    if (editing?.id) await connectorsApi.update(editing.id, data);
    else             await connectorsApi.create(data);
    await load();
  };

  const saveLlm = async (data: any) => {
    if (editing?.id) await llmConfigApi.update(editing.id, data);
    else             await llmConfigApi.create(data);
    await load();
  };

  const setDefaultLlm = async (id: string) => {
    await llmConfigApi.setDefault(id);
    setLlmProviders(prev => prev.map(p => ({ ...p, isDefault: p.id === id })));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      if (deleteTarget.type === 'connectors') await connectorsApi.delete(deleteTarget.id);
      else if (deleteTarget.type === 'llm')   await llmConfigApi.delete(deleteTarget.id);
      await load();
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const counts    = { connectors: connectors.length, nodes: nodes.length, llm: llmProviders.length };
  const nodesOnline = nodes.filter((n: any) => {
    const ls = n.lastSeen ?? n.lastSeenAt;
    return ls && (Date.now() - new Date(ls).getTime()) / 1000 < 60;
  }).length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-100">Configuration</h1>
            <p className="text-sm text-gray-500 mt-0.5">Connecteurs, nœuds d'exécution &amp; fournisseurs IA</p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors disabled:opacity-50 text-gray-300">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 border border-red-800/40 px-4 py-2.5 rounded-lg">
            <AlertTriangle size={14} />{error}
          </div>
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left',
                tab === key ? 'border-purple-700/50 bg-purple-900/10' : 'border-gray-800 bg-gray-900 hover:bg-gray-800/50',
              )}>
              <Icon size={17} className={tab === key ? 'text-purple-400' : 'text-gray-500'} />
              <div>
                <div className="text-lg font-bold leading-none text-gray-100">
                  {counts[key]}
                  {key === 'nodes' && nodesOnline > 0 && (
                    <span className="text-xs text-emerald-400 font-normal ml-2">({nodesOnline} en ligne)</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Tab bar + Add button */}
        <div className="flex items-center border-b border-gray-800">
          <div className="flex gap-1 flex-1">
            {TABS.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  tab === key ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-500 hover:text-gray-200',
                )}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>
          {tab !== 'nodes' && (
            <button onClick={openCreate}
              className="mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors">
              <Plus size={13} />
              {tab === 'connectors' ? 'Connecteur' : 'LLM'}
            </button>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-36 rounded-xl bg-gray-800/50" />)}
          </div>
        )}

        {/* Connectors */}
        {!loading && tab === 'connectors' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectors.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20 gap-3 text-gray-600">
                <Plug size={36} className="opacity-30" />
                <p className="text-sm">Aucun connecteur configuré</p>
                <button onClick={openCreate} className="text-sm text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1">
                  <Plus size={13} /> Ajouter un connecteur
                </button>
              </div>
            ) : connectors.map(c => (
              <ConnectorCard key={c.id} c={c}
                onEdit={openEdit}
                onDelete={id => setDeleteTarget({ id, type: 'connectors' })}
                onTest={testConnector} />
            ))}
          </div>
        )}

        {/* Nodes */}
        {!loading && tab === 'nodes' && (
          <div className="space-y-4">
            {nodes.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {nodes.map((n: any) => <NodeCard key={n.nodeId ?? n.id} n={n} />)}
              </div>
            )}
            {nodes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
                <Server size={36} className="opacity-30" />
                <p className="text-sm">Aucun nœud enregistré</p>
              </div>
            )}
            <NodeRegisterHelper />
          </div>
        )}

        {/* LLM */}
        {!loading && tab === 'llm' && (
          <div className="space-y-4">
            {llmProviders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
                <BrainCircuit size={36} className="opacity-30" />
                <p className="text-sm">Aucun fournisseur LLM configuré</p>
                <button onClick={openCreate} className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1">
                  <Plus size={13} /> Ajouter un LLM
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {llmProviders.map(p => (
                  <LlmCard key={p.id} p={p}
                    onEdit={openEdit}
                    onDelete={id => setDeleteTarget({ id, type: 'llm' })}
                    onSetDefault={setDefaultLlm} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Marketplace */}
      <ConnectorMarketplace
        open={marketplaceOpen}
        existingConnectors={connectors}
        onSelect={openFromMarket}
        onCustom={openFromMarketCustom}
        onClose={() => setMarketplaceOpen(false)}
      />

      {/* Slide panel */}
      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title={panelTitle}>
        {tab === 'connectors' && panelOpen && !isCustomForm && (
          <ConnectorForm
            initial={editing}
            defaultType={editing ? undefined : pendingType}
            onSave={saveConnector}
            onClose={() => setPanelOpen(false)}
          />
        )}
        {tab === 'connectors' && panelOpen && isCustomForm && !editing && (
          <CustomConnectorForm
            onSave={saveConnector}
            onClose={() => setPanelOpen(false)}
          />
        )}
        {tab === 'llm' && panelOpen && (
          <LlmForm initial={editing} onSave={saveLlm} onClose={() => setPanelOpen(false)} />
        )}
      </SlidePanel>

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          message={`Confirmer la suppression ${deleteTarget.type === 'connectors' ? 'du connecteur' : 'du fournisseur LLM'} ? Cette action est irréversible.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
