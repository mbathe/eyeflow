---
id: deployment
sidebar_position: 3
title: Déploiement
description: Docker Compose, Kubernetes/Helm, cross-compile ARMv7/STM32F4, Vault, InfluxDB et variables d'environnement.
---

# Déploiement

Cette page couvre tous les scénarios de déploiement : développement local, production Linux, edge ARM et MCU embarqué.

---

## Déploiement local (développement)

### Prérequis

```bash
# Outils requis
node --version   # ≥ 20.0
rustup --version # stable 1.75+
docker --version # ≥ 24.0
docker compose version # ≥ 2.20
```

### Stack Docker Compose

```yaml
# eyeflow/docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: eyeflow
      POSTGRES_PASSWORD: eyeflow_secret
      POSTGRES_DB: eyeflow_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true'
    depends_on: [zookeeper]
    ports:
      - "9092:9092"

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  influxdb:
    image: influxdb:2.7
    ports:
      - "8086:8086"
    environment:
      DOCKER_INFLUXDB_INIT_MODE: setup
      DOCKER_INFLUXDB_INIT_USERNAME: admin
      DOCKER_INFLUXDB_INIT_PASSWORD: influx_secret
      DOCKER_INFLUXDB_INIT_ORG: eyeflow
      DOCKER_INFLUXDB_INIT_BUCKET: eyeflow_metrics

  vault:
    image: hashicorp/vault:1.15
    cap_add: [IPC_LOCK]
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: root-dev-token
      VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200
    ports:
      - "8200:8200"

  llm-service:
    build: ./eyeflow-llm-service
    ports:
      - "8001:8001"
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY}

volumes:
  postgres_data:
```

### Démarrage

```bash
cd eyeflow

# 1. Démarrer l'infrastructure
docker compose up -d postgres kafka redis influxdb vault llm-service

# 2. Créer le schéma base de données
cd eyeflow-server
npx prisma migrate deploy

# 3. Démarrer le serveur NestJS
npm run start:dev

# 4. Compiler et démarrer le SVM Rust
cd ../eyeflow-svm-node
cargo run --release

# 5. Démarrer le dashboard
cd ../eyeflow-dashboard
npm run dev -- --port 3001
```

---

## Variables d'environnement

### eyeflow-server

```env
# Base de données
DATABASE_URL=postgresql://eyeflow:eyeflow_secret@localhost:5432/eyeflow_db

# Authentification
JWT_SECRET=your-super-secret-key-minimum-256-bits
JWT_EXPIRES_IN=86400

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=eyeflow-server
KAFKA_AUDIT_TOPIC=eyeflow.audit

# Vault
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=root-dev-token
VAULT_MOUNT_PATH=eyeflow

# LLM Service
LLM_SERVICE_URL=http://localhost:8001

# Signature IR
IR_SIGNING_PRIVATE_KEY=/etc/eyeflow/keys/ir_signing.pem

# InfluxDB
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your-influx-token
INFLUXDB_ORG=eyeflow
INFLUXDB_BUCKET=eyeflow_metrics

# Environnement
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

### eyeflow-svm-node (config.toml)

```toml
[server]
url = "wss://eyeflow-server:3000/ws"
node_id = "svm-nœud-usine-A"
tls_cert = "/etc/eyeflow/certs/node.crt"
tls_key = "/etc/eyeflow/certs/node.key"
ca_cert = "/etc/eyeflow/certs/ca.crt"

[vault]
addr = "https://vault.internal:8200"
role = "eyeflow-svm-role"
auth_method = "kubernetes"  # ou "token" pour dev

[kafka]
brokers = ["kafka:9092"]
topic = "eyeflow.audit"

[executor]
max_concurrent_executions = 8
default_instruction_timeout_ms = 5000
max_llm_retries = 3

[offline]
enabled = true
buffer_path = "/var/lib/eyeflow/offline_buffer.db"
max_buffer_mb = 256
```

### eyeflow-llm-service

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
DEFAULT_PROVIDER=openai
DEFAULT_MODEL=gpt-4o
MAX_TOKENS=2048
REQUEST_TIMEOUT_SECONDS=30
```

---

## Déploiement production (Kubernetes / Helm)

### Installation Helm

```bash
helm repo add eyeflow https://charts.eyeflow.io
helm repo update

helm install eyeflow eyeflow/eyeflow \
  --namespace eyeflow \
  --create-namespace \
  --set server.replicaCount=3 \
  --set server.image.tag=1.4.0 \
  --set database.host=postgres.internal \
  --set vault.addr=https://vault.internal:8200 \
  --values ./production-values.yaml
```

### `production-values.yaml` (extrait)

```yaml
server:
  replicaCount: 3
  resources:
    requests:
      cpu: "500m"
      memory: "512Mi"
    limits:
      cpu: "2"
      memory: "2Gi"
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70

llmService:
  replicaCount: 2
  resources:
    requests:
      cpu: "250m"
      memory: "256Mi"

svmNodes:
  # Géré en dehors de K8s — edge devices
  # Enregistrement automatique via bootstrap token

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: api.eyeflow.example.com
      paths: [{path: /, pathType: Prefix}]
  tls:
    - secretName: eyeflow-tls
      hosts: [api.eyeflow.example.com]
```

---

## Cross-compilation edge ARM

### Raspberry Pi 4 (ARMv7 / AArch64)

```bash
# Installer la cible Rust
rustup target add aarch64-unknown-linux-gnu

# Installer le cross-compilateur
sudo apt install gcc-aarch64-linux-gnu

# Configurer Cargo (.cargo/config.toml)
cat >> .cargo/config.toml <<EOF
[target.aarch64-unknown-linux-gnu]
linker = "aarch64-linux-gnu-gcc"
EOF

# Compiler
cd eyeflow-svm-node
cargo build --release --target aarch64-unknown-linux-gnu

# Copier sur le RPi
scp target/aarch64-unknown-linux-gnu/release/eyeflow-svm \
  pi@raspberry-edge:/usr/local/bin/

# Démarrer comme service systemd
ssh pi@raspberry-edge "sudo systemctl enable --now eyeflow-svm"
```

---

## Cross-compilation MCU (Embassy no-std)

### STM32F7 (Cortex-M7)

```bash
# Cibles embedded
rustup target add thumbv7em-none-eabihf
cargo install probe-rs-tools --locked

# Compiler le firmware
cd eyeflow-svm-mcu
cargo build --release --target thumbv7em-none-eabihf

# Flasher via probe-rs
probe-rs flash --chip STM32F767ZITx \
  target/thumbv7em-none-eabihf/release/eyeflow-svm-mcu

# Moniteur série
probe-rs run --chip STM32F767ZITx
```

### nRF52840 (BLE + bord)

```bash
rustup target add thumbv7em-none-eabihf

cargo build --release --target thumbv7em-none-eabihf \
  --features nrf52840

probe-rs flash --chip nRF52840_xxAA \
  target/thumbv7em-none-eabihf/release/eyeflow-svm-mcu
```

---

## Configuration Vault (production)

```bash
# Activer le moteur KV v2
vault secrets enable -path=eyeflow kv-v2

# Créer une politique SVM
vault policy write eyeflow-svm - <<EOF
path "eyeflow/data/llm-keys/*" {
  capabilities = ["read"]
}
path "eyeflow/data/capabilities/*" {
  capabilities = ["read"]
}
EOF

# Activer l'auth Kubernetes
vault auth enable kubernetes
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc"

# Créer le rôle SVM
vault write auth/kubernetes/role/eyeflow-svm \
  bound_service_account_names=eyeflow-svm \
  bound_service_account_namespaces=eyeflow \
  policies=eyeflow-svm \
  ttl=24h

# Stocker les clés API LLM
vault kv put eyeflow/llm-keys/openai \
  api_key="sk-..."

vault kv put eyeflow/llm-keys/anthropic \
  api_key="sk-ant-..."
```

---

## InfluxDB + Grafana

### Créer les métriques InfluxDB

```bash
# Token d'écriture
influx auth create \
  --org eyeflow \
  --write-buckets \
  --description "eyeflow-server write token"

# Importer le dashboard Grafana
curl -X POST http://localhost:3001/api/dashboards/import \
  -H "Content-Type: application/json" \
  -d @grafana/eyeflow-dashboard.json
```

### Métriques exposées

| Métrique InfluxDB | Tags | Description |
|-------------------|------|-------------|
| `execution_duration_ms` | `rule_id`, `node_id`, `status` | Durée d'exécution |
| `instruction_count` | `opcode`, `rule_id` | Instructions par type |
| `llm_call_duration_ms` | `provider`, `model` | Latence LLM |
| `llm_token_usage` | `provider`, `model` | Tokens consommés |
| `fallback_triggered` | `strategy`, `rule_id` | Déclenchements fallback |
| `audit_chain_length` | `node_id` | Longueur chaîne audit |
| `active_rules` | `node_id` | Règles déployées |
| `svm_memory_mb` | `node_id` | Consommation mémoire SVM |

---

## Checklist de sécurité production

```bash
# 1. Générer les clés de signature IR
openssl genpkey -algorithm ed25519 -out /etc/eyeflow/keys/ir_signing.pem
openssl pkey -in /etc/eyeflow/keys/ir_signing.pem -pubout \
  -out /etc/eyeflow/keys/ir_signing.pub

# 2. Configurer mTLS entre server et SVM nodes
# (Certificats à générer avec cfssl ou cert-manager)

# 3. Vérifier que VAULT_DEV_ROOT_TOKEN_ID n'est pas utilisé en prod

# 4. Activer l'audit Vault
vault audit enable file file_path=/var/log/vault/audit.log

# 5. Activer le network policy Kubernetes
kubectl apply -f k8s/network-policy.yaml

# 6. Scanner les images Docker
docker scout cves eyeflow/server:1.4.0
```
