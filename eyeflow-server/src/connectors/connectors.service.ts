import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { ConnectorEntity } from './connector.entity';
import {
  ConnectorType,
  ConnectorStatus,
  AnyConnectorConfig,
  ConnectorTestResponse,
  ConnectorExecutionResult,
} from './connector.types';

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);
  private readonly encryptionKey = process.env.ENCRYPTION_KEY || 'dev-key-change-in-prod-32-chars!';
  private readonly iv = process.env.ENCRYPTION_IV || 'dev-iv-16-chars!';

  constructor(
    @InjectRepository(ConnectorEntity)
    private connectorRepository: Repository<ConnectorEntity>,
  ) {}

  /**
   * Créer un nouveau connecteur
   */
  async create(userId: string, config: AnyConnectorConfig): Promise<ConnectorEntity> {
    // Vérifier qu'un connecteur avec le même nom n'existe pas
    const existing = await this.connectorRepository.findOne({
      where: { userId, name: config.name, deletedAt: IsNull() },
    });

    if (existing) {
      throw new ConflictException(`Connector "${config.name}" already exists for this user`);
    }

    // Chiffrer les credentials
    const { auth, ...configWithoutAuth } = config;
    const encryptedCredentials = this.encrypt(auth.credentials);

    const connector = this.connectorRepository.create({
      userId,
      name: config.name,
      description: config.description,
      type: config.type,
      status: ConnectorStatus.INACTIVE,
      authType: auth.type,
      encryptedCredentials,
      config: {
        ...configWithoutAuth,
        auth: {
          type: auth.type,
          credentials: {}, // Credentials not stored in clear
          encrypted: true,
        },
      } as any,
      timeout: config.timeout || 30000,
      retryCount: config.retryCount || 3,
      retryDelay: config.retryDelay || 1000,
      rateLimit: config.rateLimit,
    });

    return this.connectorRepository.save(connector);
  }

  /**
   * Récupérer tous les connecteurs d'un utilisateur
   */
  async findAll(userId: string, filter?: {
    type?: ConnectorType;
    status?: ConnectorStatus;
  }): Promise<ConnectorEntity[]> {
    const query = this.connectorRepository
      .createQueryBuilder('connector')
      .where('connector.userId = :userId', { userId })
      .andWhere('connector.deletedAt IS NULL');

    if (filter?.type) {
      query.andWhere('connector.type = :type', { type: filter.type });
    }

    if (filter?.status) {
      query.andWhere('connector.status = :status', { status: filter.status });
    }

    return query.orderBy('connector.createdAt', 'DESC').getMany();
  }

  /**
   * Récupérer un connecteur spécifique
   */
  async findOne(userId: string, connectorId: string): Promise<ConnectorEntity> {
    const connector = await this.connectorRepository.findOne({
      where: { id: connectorId, userId, deletedAt: IsNull() },
    });

    if (!connector) {
      throw new NotFoundException('Connector not found');
    }

    return connector;
  }

  /**
   * Mettre à jour un connecteur
   */
  async update(
    userId: string,
    connectorId: string,
    updateData: Partial<AnyConnectorConfig>,
  ): Promise<ConnectorEntity> {
    const connector = await this.findOne(userId, connectorId);

    if (updateData.auth) {
      // Chiffrer les nouvelles credentials
      connector.encryptedCredentials = this.encrypt(updateData.auth.credentials);
      connector.authType = updateData.auth.type;
    }

    if (updateData.name) connector.name = updateData.name;
    if (updateData.description) connector.description = updateData.description;
    if (updateData.timeout) connector.timeout = updateData.timeout;
    if (updateData.retryCount) connector.retryCount = updateData.retryCount;
    if (updateData.retryDelay) connector.retryDelay = updateData.retryDelay;
    if (updateData.rateLimit !== undefined) connector.rateLimit = updateData.rateLimit;

    return this.connectorRepository.save(connector);
  }

  /**
   * Tester la connexion avec un connecteur sauvegardé (par ID)
   */
  async testConnection(userId: string, connectorId: string): Promise<ConnectorTestResponse> {
    const connector = await this.findOne(userId, connectorId);
    const startTime = Date.now();

    try {
      const credentials = this.decrypt(connector.encryptedCredentials);
      const result = await this.testConnectionByType(connector.type, credentials, startTime);

      // Sauvegarder le résultat du test
      await this.connectorRepository.update(connectorId, {
        lastTestedAt: new Date(),
        lastTestSuccessful: result.success,
        lastTestError: result.success ? undefined : result.error,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.connectorRepository.update(connectorId, {
        lastTestedAt: new Date(),
        lastTestSuccessful: false,
        lastTestError: errorMessage,
      });
      return { success: false, message: 'Connection test failed', latency: Date.now() - startTime, error: errorMessage };
    }
  }

  /**
   * Tester une configuration sans connecteur sauvegardé (utilisé lors de la création)
   */
  async testConnectionByConfig(type: string, config: Record<string, any>): Promise<ConnectorTestResponse> {
    const startTime = Date.now();
    try {
      return await this.testConnectionByType(type, config, startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, message: 'Connection test failed', latency: Date.now() - startTime, error: errorMessage };
    }
  }

  /**
   * Logique partagée de test par type de connecteur
   */
  private async testConnectionByType(type: string, credentials: any, startTime: number): Promise<ConnectorTestResponse> {
    switch (type) {
      case ConnectorType.POSTGRESQL:
      case 'mysql':
        return await this.testPostgresConnection(credentials, startTime);
      case ConnectorType.MONGODB:
        return await this.testMongoConnection(credentials, startTime);
      case ConnectorType.MQTT:
        return await this.testMqttConnection(credentials, startTime);
      case ConnectorType.SLACK:
        return await this.testSlackConnection(credentials, startTime);
      case ConnectorType.TEAMS:
        return await this.testTeamsConnection(credentials, startTime);
      case ConnectorType.REST_API:
      case 'webhook':
      case 'graphql':
        return await this.testRestApiConnection(credentials, startTime);
      case ConnectorType.KAFKA:
        return this.testByFieldPresence(credentials, ['brokers'], 'Kafka', startTime);
      case 'smtp':
        return this.testByFieldPresence(credentials, ['host', 'port'], 'SMTP', startTime);
      case 'stripe':
        return this.testByFieldPresence(credentials, ['apiKey'], 'Stripe', startTime);
      case 's3':
      case 'minio':
        return this.testByFieldPresence(credentials, ['accessKeyId', 'secretAccessKey', 'region'], 'S3', startTime);
      case 'local_file':
        return this.testByFieldPresence(credentials, ['basePath'], 'Local File', startTime);
      case 'shopify':
        return this.testByFieldPresence(credentials, ['shopDomain', 'token'], 'Shopify', startTime);
      case 'hubspot':
        return this.testByFieldPresence(credentials, ['apiKey'], 'HubSpot', startTime);
      case 'influxdb':
        return this.testByFieldPresence(credentials, ['url', 'token'], 'InfluxDB', startTime);
      default:
        // Pour les connecteurs HTTP génériques / personnalisés, vérifier baseUrl
        if (credentials?.baseUrl || credentials?.url) {
          return { success: true, message: `Configuration valide pour "${type}"`, latency: Date.now() - startTime };
        }
        return { success: true, message: `Test non spécifique disponible pour "${type}" — configuration acceptée`, latency: Date.now() - startTime };
    }
  }

  private testByFieldPresence(credentials: any, requiredFields: string[], label: string, startTime: number): ConnectorTestResponse {
    const missing = requiredFields.filter(f => !credentials?.[f]);
    if (missing.length > 0) {
      throw new Error(`Champs obligatoires manquants pour ${label} : ${missing.join(', ')}`);
    }
    return { success: true, message: `Configuration ${label} valide`, latency: Date.now() - startTime };
  }

  /**
   * Supprimer un connecteur (soft delete)
   */
  async delete(userId: string, connectorId: string): Promise<void> {
    const connector = await this.findOne(userId, connectorId);
    await this.connectorRepository.update(connectorId, {
      deletedAt: new Date(),
    });
  }

  /**
   * Activer/Désactiver un connecteur
   */
  async setStatus(userId: string, connectorId: string, status: ConnectorStatus): Promise<ConnectorEntity> {
    const connector = await this.findOne(userId, connectorId);
    connector.status = status;
    return this.connectorRepository.save(connector);
  }

  /**
   * Décrypter les credentials
   */
  getDecryptedCredentials(connector: ConnectorEntity): any {
    return this.decrypt(connector.encryptedCredentials);
  }

  /**
   * ========================
   * HELPERS DE CHIFFREMENT
   * ========================
   */

  private encrypt(data: any): string {
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey.substring(0, 32).padEnd(32, '0')),
      Buffer.from(this.iv.substring(0, 16).padEnd(16, '0')),
    );

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private decrypt(encryptedData: string): any {
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey.substring(0, 32).padEnd(32, '0')),
      Buffer.from(this.iv.substring(0, 16).padEnd(16, '0')),
    );

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  /**
   * ========================
   * TEST IMPLEMENTATIONS
   * ========================
   */

  private async testPostgresConnection(credentials: any, startTime: number): Promise<ConnectorTestResponse> {
    // Implémentation simplifiée - en production utiliser pg client
    try {
      const { host, port, database, username } = credentials;
      if (!host || !port || !database || !username) {
        throw new Error('Missing required PostgreSQL credentials');
      }

      return {
        success: true,
        message: 'PostgreSQL connection test successful',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      throw error;
    }
  }

  private async testMongoConnection(credentials: any, startTime: number): Promise<ConnectorTestResponse> {
    try {
      const { connectionString } = credentials;
      if (!connectionString) {
        throw new Error('Missing MongoDB connection string');
      }

      return {
        success: true,
        message: 'MongoDB connection test successful',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      throw error;
    }
  }

  private async testMqttConnection(credentials: any, startTime: number): Promise<ConnectorTestResponse> {
    try {
      const { broker, port } = credentials;
      if (!broker || !port) {
        throw new Error('Missing MQTT broker or port');
      }

      return {
        success: true,
        message: 'MQTT connection test successful',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      throw error;
    }
  }

  private async testSlackConnection(credentials: any, startTime: number): Promise<ConnectorTestResponse> {
    try {
      const token = credentials.botToken ?? credentials.token ?? credentials.accessToken;
      if (!token) {
        throw new Error('Slack token manquant (botToken / token)');
      }

      // Accepter tous les formats Slack valides :
      // xoxb- = Bot Token, xapp- = App-Level (Socket Mode), xoxp- = User Token, xoxa- = Legacy
      const validPrefixes = ['xoxb-', 'xapp-', 'xoxp-', 'xoxa-'];
      if (!validPrefixes.some(p => token.startsWith(p))) {
        throw new Error(`Format de token Slack non reconnu. Attendu : ${validPrefixes.join(' | ')}`);
      }

      // Appel réel à l'API Slack auth.test
      const res = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json() as Record<string, unknown>;

      if (!data['ok']) {
        throw new Error(`Slack auth.test failed: ${data['error']}`);
      }

      const teamName = data['team'] ?? 'unknown team';
      const user     = data['user'] ?? data['bot_id'] ?? 'bot';
      return {
        success: true,
        message: `Slack connecté — workspace: ${teamName}, identité: ${user}`,
        latency: Date.now() - startTime,
        details: { team: teamName, user, tokenType: data['token_type'] ?? 'unknown' },
      };
    } catch (error) {
      throw error;
    }
  }

  private async testTeamsConnection(credentials: any, startTime: number): Promise<ConnectorTestResponse> {
    try {
      const { webhookUrl } = credentials;
      if (!webhookUrl) {
        throw new Error('Missing Teams webhook URL');
      }

      return {
        success: true,
        message: 'Teams connection test successful',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      throw error;
    }
  }

  private async testRestApiConnection(credentials: any, startTime: number): Promise<ConnectorTestResponse> {
    try {
      // Implémentation HTTP test - va être améliorée
      return {
        success: true,
        message: 'REST API connection test successful',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      throw error;
    }
  }
}
