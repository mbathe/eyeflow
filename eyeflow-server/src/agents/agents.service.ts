import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface Agent {
  id: string;
  name: string;
  version: string;
  status: 'online' | 'offline' | 'error';
  lastHeartbeat: Date;
  capabilities: string[];
  createdAt: Date;
}

@Injectable()
export class AgentsService {
  private agents = new Map<string, Agent>();

  registerAgent(data: { agentName: string; version: string; capabilities: string[] }): Agent {
    const agent: Agent = {
      id: uuidv4(),
      name: data.agentName,
      version: data.version,
      status: 'online',
      lastHeartbeat: new Date(),
      capabilities: data.capabilities || [],
      createdAt: new Date(),
    };

    this.agents.set(agent.id, agent);
    console.log(`✅ Agent registered: ${agent.name} (${agent.id})`);
    return agent;
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  updateAgentStatus(id: string, status: 'online' | 'offline' | 'error'): Agent | undefined {
    const agent = this.agents.get(id);
    if (agent) {
      agent.status = status;
      agent.lastHeartbeat = new Date();
    }
    return agent;
  }

  removeAgent(id: string): boolean {
    return this.agents.delete(id);
  }
}
