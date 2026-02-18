import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface Action {
  id: string;
  name: string;
  type: 'shell' | 'http' | 'python' | 'database' | 'custom';
  command: string;
  description?: string;
  params?: Record<string, any>;
  enabled: boolean;
  createdAt: Date;
}

@Injectable()
export class ActionsService {
  private actions = new Map<string, Action>();

  createAction(data: Omit<Action, 'id' | 'createdAt'>): Action {
    const action: Action = {
      id: uuidv4(),
      ...data,
      createdAt: new Date(),
    };

    this.actions.set(action.id, action);
    console.log(`Action created: ${action.name} (${action.id})`);
    return action;
  }

  getAllActions(): Action[] {
    return Array.from(this.actions.values());
  }

  getAction(id: string): Action | undefined {
    return this.actions.get(id);
  }

  updateAction(id: string, data: Partial<Action>): Action | undefined {
    const action = this.actions.get(id);
    if (!action) return undefined;

    Object.assign(action, data);
    return action;
  }

  deleteAction(id: string): boolean {
    return this.actions.delete(id);
  }
}
