import { Injectable } from '@nestjs/common';
import {
  CompilableComponent,
  Capability,
  CapabilityParameter,
  ComponentValidationError,
  CapabilityExecutor,
} from './compilable-component.interface';
import { JsonSchema } from './json-schema.interface';

/**
 * Validates that components implement the CompilableComponent interface correctly
 */
@Injectable()
export class ComponentValidator {
  /**
   * Validate a component implements the interface correctly
   */
  async validateComponent(component: CompilableComponent): Promise<void> {
    const errors: string[] = [];

    // Validate metadata
    if (!component.id || typeof component.id !== 'string') {
      errors.push('id is required and must be a string');
    }
    if (!component.name || typeof component.name !== 'string') {
      errors.push('name is required and must be a string');
    }
    if (!component.version || typeof component.version !== 'string') {
      errors.push('version is required and must be a string (e.g., "1.0.0")');
    }
    if (!component.description || typeof component.description !== 'string') {
      errors.push('description is required and must be a string');
    }

    // Validate capabilities array
    if (!Array.isArray(component.capabilities) || component.capabilities.length === 0) {
      errors.push('capabilities must be a non-empty array');
    } else {
      for (let i = 0; i < component.capabilities.length; i++) {
        const capErrors = this.validateCapability(component.capabilities[i], i);
        errors.push(...capErrors);
      }
    }

    // Validate constraints format
    if (component.constraints) {
      if (!Array.isArray(component.constraints)) {
        errors.push('constraints must be an array if provided');
      } else {
        for (let i = 0; i < component.constraints.length; i++) {
          const constraint = component.constraints[i];
          if (!constraint.type || !['maxConcurrent', 'rateLimit', 'resource', 'dependency'].includes(constraint.type)) {
            errors.push(`constraints[${i}].type must be one of: maxConcurrent, rateLimit, resource, dependency`);
          }
          if (!constraint.description) {
            errors.push(`constraints[${i}].description is required`);
          }
        }
      }
    }

    // Validate required methods
    if (typeof component.validate !== 'function') {
      errors.push('validate() method is required (async (void) => Promise<void>)');
    }
    if (typeof component.toJSON !== 'function') {
      errors.push('toJSON() method is required');
    }

    if (errors.length > 0) {
      throw new ComponentValidationError(component.id, errors);
    }

    // Call component's own validation hook
    try {
      await component.validate();
    } catch (error) {
      errors.push(`Component.validate() failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ComponentValidationError(component.id, errors);
    }

    // Validate toJSON output
    try {
      const json = component.toJSON();
      this.validateCapabilityJSON(json);
    } catch (error) {
      errors.push(`Component.toJSON() output invalid: ${error instanceof Error ? error.message : String(error)}`);
      throw new ComponentValidationError(component.id, errors);
    }
  }

  /**
   * Validate a single capability within a component
   */
  private validateCapability(capability: Capability, index: number): string[] {
    const errors: string[] = [];
    const prefix = `capabilities[${index}]`;

    // Validate ID
    if (!capability.id || typeof capability.id !== 'string') {
      errors.push(`${prefix}.id is required and must be a string`);
    }

    // Validate name
    if (!capability.name || typeof capability.name !== 'string') {
      errors.push(`${prefix}.name is required and must be a string`);
    }

    // Validate description
    if (!capability.description || typeof capability.description !== 'string') {
      errors.push(`${prefix}.description is required`);
    }

    // Validate category
    const validCategories = ['connector', 'service', 'action', 'transform'];
    if (!capability.category || !validCategories.includes(capability.category)) {
      errors.push(`${prefix}.category must be one of: ${validCategories.join(', ')}`);
    }

    // Validate inputs
    if (!Array.isArray(capability.inputs)) {
      errors.push(`${prefix}.inputs must be an array`);
    } else {
      for (let i = 0; i < capability.inputs.length; i++) {
        const paramErrors = this.validateParameter(capability.inputs[i], `${prefix}.inputs[${i}]`);
        errors.push(...paramErrors);
      }
    }

    // Validate outputs
    if (!Array.isArray(capability.outputs)) {
      errors.push(`${prefix}.outputs must be an array`);
    } else {
      for (let i = 0; i < capability.outputs.length; i++) {
        const paramErrors = this.validateParameter(capability.outputs[i], `${prefix}.outputs[${i}]`);
        errors.push(...paramErrors);
      }
    }

    // Validate executor
    if (!capability.executor) {
      errors.push(`${prefix}.executor is required`);
    } else {
      const execErrors = this.validateExecutor(capability.executor, `${prefix}.executor`);
      errors.push(...execErrors);
    }

    // Validate performance hints
    if (capability.estimatedDuration !== undefined && typeof capability.estimatedDuration !== 'number') {
      errors.push(`${prefix}.estimatedDuration must be a number (milliseconds)`);
    }
    if (capability.cacheTTL !== undefined && typeof capability.cacheTTL !== 'number') {
      errors.push(`${prefix}.cacheTTL must be a number (seconds)`);
    }

    // Validate estimatedCost
    if (capability.estimatedCost) {
      if (typeof capability.estimatedCost.cpu !== 'number' || capability.estimatedCost.cpu < 0 || capability.estimatedCost.cpu > 1) {
        errors.push(`${prefix}.estimatedCost.cpu must be between 0 and 1`);
      }
      if (typeof capability.estimatedCost.memory !== 'number' || capability.estimatedCost.memory < 0) {
        errors.push(`${prefix}.estimatedCost.memory must be a positive number (MB)`);
      }
    }

    return errors;
  }

  /**
   * Validate a capability parameter
   */
  private validateParameter(param: CapabilityParameter, prefix: string): string[] {
    const errors: string[] = [];

    if (!param.name || typeof param.name !== 'string') {
      errors.push(`${prefix}.name is required and must be a string`);
    }

    const validTypes = ['string', 'number', 'boolean', 'array', 'object', 'any'];
    if (!param.type || !validTypes.includes(param.type)) {
      errors.push(`${prefix}.type must be one of: ${validTypes.join(', ')}`);
    }

    if (typeof param.required !== 'boolean') {
      errors.push(`${prefix}.required must be a boolean`);
    }

    // Validate schema if provided
    if (param.schema) {
      const schemaErrors = this.validateJsonSchema(param.schema, `${prefix}.schema`);
      errors.push(...schemaErrors);
    }

    return errors;
  }

  /**
   * Validate an executor configuration
   */
  private validateExecutor(executor: CapabilityExecutor, prefix: string): string[] {
    const errors: string[] = [];

    const validTypes = ['function', 'http', 'grpc', 'websocket'];
    if (!executor.type || !validTypes.includes(executor.type)) {
      errors.push(`${prefix}.type must be one of: ${validTypes.join(', ')}`);
    }

    if (executor.type === 'function') {
      if (!executor.functionRef) {
        errors.push(`${prefix}.functionRef is required for type 'function'`);
      } else {
        if (!executor.functionRef.module || typeof executor.functionRef.module !== 'string') {
          errors.push(`${prefix}.functionRef.module is required and must be a string`);
        }
        if (!executor.functionRef.functionName || typeof executor.functionRef.functionName !== 'string') {
          errors.push(`${prefix}.functionRef.functionName is required and must be a string`);
        }
      }
    } else if (executor.type === 'http') {
      if (!executor.httpRef) {
        errors.push(`${prefix}.httpRef is required for type 'http'`);
      } else {
        const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
        if (!executor.httpRef.method || !validMethods.includes(executor.httpRef.method)) {
          errors.push(`${prefix}.httpRef.method must be one of: ${validMethods.join(', ')}`);
        }
        if (!executor.httpRef.url || typeof executor.httpRef.url !== 'string') {
          errors.push(`${prefix}.httpRef.url is required and must be a string`);
        }
      }
    }

    return errors;
  }

  /**
   * Validate a JSON Schema
   */
  private validateJsonSchema(schema: JsonSchema, prefix: string): string[] {
    const errors: string[] = [];

    // Basic schema validation
    if (schema.type) {
      const validTypes = ['string', 'number', 'boolean', 'array', 'object', 'null', 'integer'];
      if (typeof schema.type === 'string' && !validTypes.includes(schema.type)) {
        errors.push(`${prefix}.type must be a valid JSON Schema type`);
      } else if (Array.isArray(schema.type)) {
        for (const t of schema.type) {
          if (!validTypes.includes(t)) {
            errors.push(`${prefix}.type[...] contains invalid type: ${t}`);
          }
        }
      }
    }

    // Validate object properties
    if (schema.properties) {
      if (typeof schema.properties !== 'object') {
        errors.push(`${prefix}.properties must be an object`);
      }
    }

    return errors;
  }

  /**
   * Validate CapabilityJSON output format
   */
  private validateCapabilityJSON(json: any): void {
    const errors: string[] = [];

    if (!json.id || typeof json.id !== 'string') {
      errors.push('toJSON().id is required');
    }
    if (!json.name || typeof json.name !== 'string') {
      errors.push('toJSON().name is required');
    }
    if (!json.capabilities || !Array.isArray(json.capabilities)) {
      errors.push('toJSON().capabilities must be an array');
    }

    if (errors.length > 0) {
      throw new Error(`Invalid toJSON() output: ${errors.join('; ')}`);
    }
  }
}
