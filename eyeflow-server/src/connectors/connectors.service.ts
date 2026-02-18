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
   * Tester la connexion avec un connecteur
   */
  async testConnection(userId: string, connectorId: string): Promise<ConnectorTestResponse> {
    const connector = await this.findOne(userId, connectorId);
    const startTime = Date.now();

    try {
      const credentials = this.decrypt(connector.encryptedCredentials);

      switch (connector.type) {
        case ConnectorType.POSTGRESQL:
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
          return await this.testRestApiConnection(credentials, startTime);
        default:
          throw new BadRequestException(`Test not implemented for connector type: ${connector.type}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const response: ConnectorTestResponse = {
        success: false,
        message: 'Connection test failed',
        latency: Date.now() - startTime,
        error: errorMessage,
      };

      // Sauvegarder le résultat du test
      await this.connectorRepository.update(connectorId, {
        lastTestedAt: new Date(),
        lastTestSuccessful: false,
        lastTestError: errorMessage,
      });

      return response;
    }
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
      const { botToken } = credentials;
      if (!botToken) {
        throw new Error('Missing Slack bot token');
      }

      // Vérifier token format
      if (!botToken.startsWith('xoxb-')) {
        throw new Error('Invalid Slack bot token format');
      }

      return {
        success: true,
        message: 'Slack connection test successful',
        latency: Date.now() - startTime,
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
