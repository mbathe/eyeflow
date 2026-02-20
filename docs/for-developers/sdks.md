---
id: sdks
sidebar_position: 4
title: SDKs & CLI
description: SDK TypeScript/Node.js, client Rust embarqué, CLI eyeflow et exemples d'intégration complets.
---

# SDKs & CLI

EyeFlow fournit plusieurs moyens d'intégration : un SDK TypeScript officiel, un client REST Rust pour les nœuds embarqués, et un CLI en ligne de commande.

---

## SDK TypeScript / Node.js

### Installation

```bash
npm install @eyeflow/sdk
# ou
yarn add @eyeflow/sdk
```

### Configuration

```typescript
import { EyeflowClient } from '@eyeflow/sdk';

const client = new EyeflowClient({
  baseUrl: 'https://api.eyeflow.example.com',
  apiKey: process.env.EYEFLOW_API_KEY,
  timeout: 30_000,
});
```

### Compiler une règle

```typescript
const compilation = await client.rules.compile({
  name: 'fermeture_vanne_urgence',
  naturalLanguage: `
    Si la pression dépasse 12 bar, fermer immédiatement la vanne d'urgence V-02,
    couper la pompe principale et envoyer une alerte critique à l'opérateur.
  `,
  sector: 'INDUSTRIAL',
  priority: 'CRITICAL',
});

// Attendre la fin de la compilation
const rule = await client.rules.waitForCompilation(compilation.id, {
  pollingIntervalMs: 1000,
  timeoutMs: 30_000,
});

console.log('Compilé avec succès:', rule.id);
console.log('Z3 vérifié:', rule.z3Verified);
console.log('Signature:', rule.signature.substring(0, 20) + '...');
```

### Déployer et surveiller

```typescript
// Déployer sur des nœuds cibles
const deployment = await client.rules.deploy(rule.id, {
  targetNodeIds: ['svm-usine-A', 'svm-usine-B'],
  strategy: 'ROLLING',
});

// S'abonner aux exécutions en temps réel
const subscription = client.executions.subscribe({
  ruleId: rule.id,
  onExecution: (exec) => {
    console.log(`Exécution ${exec.id}: ${exec.status} (${exec.durationMs}ms)`);
  },
  onInstruction: (instr) => {
    console.log(`  > ${instr.opcode}: ${JSON.stringify(instr.result)}`);
  },
});

// Se désabonner après 1 heure
setTimeout(() => subscription.unsubscribe(), 3_600_000);
```

### Lire le journal d'audit

```typescript
const auditEntries = await client.audit.list({
  ruleId: rule.id,
  since: new Date(Date.now() - 86_400_000), // dernières 24h
  format: 'json',
});

// Vérifier l'intégrité de la chaîne
const verification = await client.audit.verifyChain(execId);
console.log('Chaîne valide:', verification.valid);
```

### Types principaux

```typescript
interface Rule {
  id: string;
  name: string;
  status: 'COMPILING' | 'VALIDATION_PENDING' | 'COMPILED' | 'DEPLOYED' | 'REVOKED';
  compiledAt?: Date;
  irVersion?: string;
  z3Verified?: boolean;
  signature?: string;
  deployedNodes?: string[];
}

interface Execution {
  id: string;
  ruleId: string;
  nodeId: string;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'IN_PROGRESS';
  startedAt: Date;
  durationMs: number;
  instructionsExecuted: number;
  auditChainHash: string;
  trace?: InstructionTrace[];
}

interface InstructionTrace {
  instructionId: string;
  opcode: string;
  startedAt: Date;
  durationMs: number;
  result: Record<string, unknown>;
  auditHash: string;
}
```

---

## Client Rust (nœuds embarqués)

Pour les intégrations custom sur nœuds Linux edge (pas le SVM standard).

### `Cargo.toml`

```toml
[dependencies]
eyeflow-client = "0.3"
tokio = { version = "1", features = ["full"] }
serde_json = "1"
```

### Exemple d'utilisation

```rust
use eyeflow_client::{EyeflowClient, RuleCompileRequest};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let client = EyeflowClient::new(
        "https://api.eyeflow.example.com",
        std::env::var("EYEFLOW_API_KEY")?,
    );

    // Compiler une règle
    let request = RuleCompileRequest {
        name: "temperature_guard".to_string(),
        natural_language: "If temperature exceeds 90°C, close valve V-01.".to_string(),
        sector: "INDUSTRIAL".to_string(),
        priority: "HIGH".to_string(),
    };

    let compilation = client.rules().compile(request).await?;
    let rule = client.rules().wait_compiled(compilation.id, 30_000).await?;

    println!("Rule compiled: {} (Z3: {})", rule.id, rule.z3_verified);

    // Charger le binaire LLM-IR
    let ir_bytes = client.rules().get_ir_binary(rule.id).await?;
    println!("LLM-IR size: {} bytes", ir_bytes.len());

    Ok(())
}
```

---

## CLI eyeflow

### Installation

```bash
# Via npm (recommandé)
npm install -g @eyeflow/cli

# Vérifier l'installation
eyeflow --version
# EyeFlow CLI v1.4.0 (NestJS 3000 · SVM Rust · LLM-IR 2.4)
```

### Configuration

```bash
# Configurer le serveur et le token
eyeflow config set --url https://api.eyeflow.example.com
eyeflow config set --token YOUR_JWT_TOKEN

# Vérifier la configuration
eyeflow config show
```

### Commandes de règles

```bash
# Compiler une règle depuis un fichier texte
eyeflow rules compile --file surveillance_cuve.txt \
  --name "surveillance_cuve" \
  --sector INDUSTRIAL \
  --priority HIGH

# Lister les règles
eyeflow rules list
eyeflow rules list --status DEPLOYED --sector INDUSTRIAL

# Voir le détail d'une règle
eyeflow rules get rule-abc123

# Obtenir le LLM-IR d'une règle
eyeflow rules ir rule-abc123 --format json | jq .
eyeflow rules ir rule-abc123 --format proto --out ./rule.pb

# Valider manuellement une règle
eyeflow rules validate rule-abc123 --approved

# Déployer
eyeflow rules deploy rule-abc123 \
  --nodes svm-usine-A,svm-usine-B \
  --strategy ROLLING

# Révoquer
eyeflow rules revoke rule-abc123
```

### Commandes d'exécutions

```bash
# Lister les dernières exécutions
eyeflow executions list --limit 20
eyeflow executions list --rule rule-abc123 --status FAILED

# Voir la trace complète d'une exécution
eyeflow executions trace exec-555

# Simuler un événement (dev/test)
eyeflow executions simulate \
  --node svm-usine-A \
  --rule rule-abc123 \
  --payload '{"temperature_cuve": 92.0}'
```

### Commandes d'audit

```bash
# Exporter le journal d'audit
eyeflow audit export \
  --rule rule-abc123 \
  --since 2024-10-01 \
  --format csv \
  --out audit_octobre.csv

# Vérifier l'intégrité d'une exécution
eyeflow audit verify exec-555

# Rapport réglementaire complet
eyeflow audit report \
  --rule rule-abc123 \
  --format iec62304 \
  --out rapport_iec62304.pdf
```

### Commandes de nœuds

```bash
# Lister les nœuds SVM
eyeflow nodes list
eyeflow nodes list --type LINUX_ARM

# Surveiller un nœud
eyeflow nodes watch svm-usine-A

# Voir les métriques d'un nœud
eyeflow nodes metrics svm-usine-A --since 1h

# Mettre à jour le SVM d'un nœud
eyeflow nodes update svm-usine-A --version 1.4.0
```

### Commandes du catalog

```bash
# Lister les capabilities
eyeflow catalog list
eyeflow catalog list --sector INDUSTRIAL

# Détail d'une capability
eyeflow catalog get valve_control

# Enregistrer une capability custom
eyeflow catalog register \
  --file my_capability.json \
  --sign-with /etc/eyeflow/keys/ir_signing.pem

# Révoquer une capability
eyeflow catalog revoke valve_control --version 1.0.0
```

### Commandes de sécurité

```bash
# Générer une paire de clés pour la signature IR
eyeflow security keygen \
  --algorithm ed25519 \
  --out /etc/eyeflow/keys/ir_signing.pem

# Vérifier la signature d'un programme LLM-IR
eyeflow security verify \
  --ir ./rule.pb \
  --pubkey /etc/eyeflow/keys/ir_signing.pub

# Audit de sécurité complet
eyeflow security audit --full
```

---

## Exemples d'intégration avancés

### Intégration CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy-rules.yml
name: Deploy EyeFlow Rules

on:
  push:
    paths:
      - 'rules/**'
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup EyeFlow CLI
        run: npm install -g @eyeflow/cli

      - name: Configure EyeFlow
        run: |
          eyeflow config set --url ${{ vars.EYEFLOW_URL }}
          eyeflow config set --token ${{ secrets.EYEFLOW_TOKEN }}

      - name: Compile & Deploy Changed Rules
        run: |
          for rule_file in $(git diff --name-only HEAD~1 HEAD -- rules/); do
            rule_name=$(basename "$rule_file" .txt)
            eyeflow rules compile --file "$rule_file" \
              --name "$rule_name" \
              --sector ${{ vars.SECTOR }}
          done
```

### Réponse à un événement Kafka

```typescript
import { Kafka } from 'kafkajs';
import { EyeflowClient } from '@eyeflow/sdk';

const kafka = new Kafka({ brokers: ['localhost:9092'] });
const consumer = kafka.consumer({ groupId: 'my-app' });
const eyeflow = new EyeflowClient({ baseUrl: '...', apiKey: '...' });

await consumer.subscribe({ topic: 'factory.sensors' });

await consumer.run({
  eachMessage: async ({ message }) => {
    const sensor = JSON.parse(message.value!.toString());

    // Simuler l'événement dans EyeFlow
    const execution = await eyeflow.executions.simulate({
      nodeId: 'svm-usine-A',
      ruleId: 'rule-abc123',
      payload: {
        source: `sensor:${sensor.id}`,
        value: sensor.value,
        timestamp: sensor.timestamp,
      },
    });

    console.log('Résultat:', execution.status);
  },
});
```
