import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { LlmConfigEntity } from './llm-config.entity';
import {
  LlmConfig,
  LlmProvider,
  LlmModel,
  LlmConfigResponse,
  LlmHealthCheck,
  ApiLlmConfig,
  LocalLlmConfig,
} from './llm-config.types';

@Injectable()
export class LlmConfigService {
  private readonly logger = new Logger(LlmConfigService.name);
  private readonly encryptionKey = process.env.ENCRYPTION_KEY || 'dev-key-change-in-prod-32-chars!';
  private readonly iv = process.env.ENCRYPTION_IV || 'dev-iv-16-chars!';

  constructor(
    @InjectRepository(LlmConfigEntity)
    private llmConfigRepository: Repository<LlmConfigEntity>,
  ) {}

  /**
   * Créer une nouvelle configuration LLM
   */
  async create(userId: string, config: Partial<LlmConfig>): Promise<LlmConfigEntity> {
    // Si c'est défaut, désactiver les autres
    if (config.isDefault) {
      await this.llmConfigRepository.update(
        { userId },
        { isDefault: false },
      );
    }

    const llmConfig = new LlmConfigEntity();
    llmConfig.userId = userId;
    llmConfig.provider = config.provider!;
    llmConfig.model = config.model!;
    llmConfig.isDefault = config.isDefault || false;
    llmConfig.temperature = config.temperature || 0.7;
    llmConfig.maxTokens = config.maxTokens || 2000;
    llmConfig.topP = config.topP || 1;
    llmConfig.frequencyPenalty = config.frequencyPenalty || 0;
    llmConfig.presencePenalty = config.presencePenalty || 0;
    llmConfig.localConfig = config.localConfig;
    if (config.apiConfig) {
      llmConfig.encryptedApiConfig = this.encrypt(config.apiConfig);
    }

    return this.llmConfigRepository.save(llmConfig);
  }

  /**
   * Récupérer toutes les configurations d'un utilisateur
   */
  async findAll(userId: string): Promise<LlmConfigEntity[]> {
    return this.llmConfigRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Récupérer une configuration spécifique
   */
  async findOne(userId: string, configId: string): Promise<LlmConfigEntity> {
    const config = await this.llmConfigRepository.findOne({
      where: { id: configId, userId },
    });

    if (!config) {
      throw new NotFoundException('LLM config not found');
    }

    return config;
  }

  /**
   * Récupérer la configuration par défaut
   */
  async getDefault(userId: string): Promise<LlmConfigEntity> {
    const config = await this.llmConfigRepository.findOne({
      where: { userId, isDefault: true },
    });

    if (!config) {
      throw new NotFoundException('No default LLM config found. Please create one first.');
    }

    return config;
  }

  /**
   * Mettre à jour une configuration
   */
  async update(
    userId: string,
    configId: string,
    updateData: Partial<LlmConfig>,
  ): Promise<LlmConfigEntity> {
    const config = await this.findOne(userId, configId);

    if (updateData.isDefault && updateData.isDefault === true) {
      await this.llmConfigRepository.update(
        { userId },
        { isDefault: false },
      );
    }

    if (updateData.temperature !== undefined) config.temperature = updateData.temperature;
    if (updateData.maxTokens !== undefined) config.maxTokens = updateData.maxTokens;
    if (updateData.topP !== undefined) config.topP = updateData.topP;
    if (updateData.frequencyPenalty !== undefined) config.frequencyPenalty = updateData.frequencyPenalty;
    if (updateData.presencePenalty !== undefined) config.presencePenalty = updateData.presencePenalty;
    if (updateData.localConfig !== undefined) config.localConfig = updateData.localConfig;
    if (updateData.isDefault !== undefined) config.isDefault = updateData.isDefault;

    if (updateData.apiConfig) {
      config.encryptedApiConfig = this.encrypt(updateData.apiConfig);
    }

    return this.llmConfigRepository.save(config);
  }

  /**
   * Tester la santé d'une configuration LLM
   */
  async healthCheck(userId: string, configId: string): Promise<LlmHealthCheck> {
    const config = await this.findOne(userId, configId);
    const startTime = Date.now();

    try {
      if (config.localConfig) {
        return await this.testLocalLlmHealth(config);
      } else if (config.encryptedApiConfig) {
        return await this.testApiLlmHealth(config);
      } else {
        throw new BadRequestException('No LLM configuration found');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const response: LlmHealthCheck = {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        model: config.model,
        provider: config.provider,
        error: errorMessage,
      };

      await this.llmConfigRepository.update(configId, {
        lastHealthCheckAt: new Date(),
        lastHealthCheckSuccessful: false,
        lastHealthCheckError: errorMessage,
      });

      return response;
    }
  }

  /**
   * Supprimer une configuration
   */
  async delete(userId: string, configId: string): Promise<void> {
    const config = await this.findOne(userId, configId);

    // Empêcher la suppression de la config par défaut
    if (config.isDefault) {
      throw new BadRequestException('Cannot delete the default LLM config');
    }

    await this.llmConfigRepository.delete(configId);
  }

  /**
   * Obtenir les credentials décryptées
   */
  getDecryptedApiConfig(llmConfig: LlmConfigEntity): ApiLlmConfig | null {
    if (!llmConfig.encryptedApiConfig) {
      return null;
    }
    return this.decrypt(llmConfig.encryptedApiConfig) as ApiLlmConfig;
  }

  /**
   * ========================
   * HEALTH CHECK HELPERS
   * ========================
   */

  private async testLocalLlmHealth(config: LlmConfigEntity): Promise<LlmHealthCheck> {
    const startTime = Date.now();

    if (!config.localConfig) {
      throw new Error('Local config missing');
    }

    // Tests simples pour local LLM (Ollama)
    if (config.localConfig.type === 'ollama') {
      const apiUrl = config.localConfig.apiUrl || 'http://localhost:11434';
      const response = await fetch(`${apiUrl}/api/tags`);

      if (!response.ok) {
        throw new Error(`Ollama health check failed: ${response.statusText}`);
      }

      return {
        status: 'healthy',
        latency: Date.now() - startTime,
        model: config.model,
        provider: config.provider,
      };
    }

    return {
      status: 'healthy',
      latency: Date.now() - startTime,
      model: config.model,
      provider: config.provider,
    };
  }

  private async testApiLlmHealth(config: LlmConfigEntity): Promise<LlmHealthCheck> {
    const startTime = Date.now();
    const apiConfig = this.getDecryptedApiConfig(config);

    if (!apiConfig) {
      throw new Error('API config missing');
    }

    // Tests simples pour chaque provider
    switch (config.provider) {
      case LlmProvider.ANTHROPIC:
        return await this.testAnthropicHealth(apiConfig, startTime, config.model);
      case LlmProvider.OPENAI:
      case LlmProvider.AZURE_OPENAI:
        return await this.testOpenAiHealth(apiConfig, startTime, config.model);
      default:
        throw new Error(`Health check not implemented for provider: ${config.provider}`);
    }
  }

  private async testAnthropicHealth(
    apiConfig: ApiLlmConfig,
    startTime: number,
    model: LlmModel,
  ): Promise<LlmHealthCheck> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiConfig.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 100,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic health check failed: ${response.statusText}`);
      }

      return {
        status: 'healthy',
        latency: Date.now() - startTime,
        model,
        provider: LlmProvider.ANTHROPIC,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Anthropic health check error: ${errorMessage}`);
    }
  }

  private async testOpenAiHealth(
    apiConfig: ApiLlmConfig,
    startTime: number,
    model: LlmModel,
  ): Promise<LlmHealthCheck> {
    try {
      const headers: any = {
        'Authorization': `Bearer ${apiConfig.apiKey}`,
        'content-type': 'application/json',
      };

      if (apiConfig.organization) {
        headers['OpenAI-Organization'] = apiConfig.organization;
      }

      if (apiConfig.apiVersion) {
        headers['api-version'] = apiConfig.apiVersion;
      }

      const url = apiConfig.apiUrl || 'https://api.openai.com/v1/chat/completions';

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 10,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI health check failed: ${response.statusText}`);
      }

      return {
        status: 'healthy',
        latency: Date.now() - startTime,
        model,
        provider: LlmProvider.OPENAI,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI health check error: ${errorMessage}`);
    }
  }

  /**
   * ========================
   * ENCRYPTION HELPERS
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
}
