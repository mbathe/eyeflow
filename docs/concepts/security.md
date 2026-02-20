---
id: security
sidebar_position: 10
title: Sécurité
description: Modèle de menace EyeFlow — protection contre l'injection de prompt, permissions compilées, Vault HashiCorp, certifications par secteur et isolation d'exécution.
---

# Sécurité

La sécurité d'EyeFlow est **by design**, non bolted-on. Le modèle d'exécution déterministe élimine structurellement les principales classes d'attaques contre les systèmes IA.

---

## Modèle de menace

| Menace | Vecteur | Mitigation EyeFlow |
|--------|---------|-------------------|
| **Injection de prompt** | Données malveillantes dans l'event payload | LLM n'accède pas au payload à l'exécution — il lit un contexte figé compilé |
| **Prompt jailbreak** | Modifier le comportement LLM via input | Impossible — le LLM n'est pas appelé à l'exécution |
| **Exfiltration via LLM** | LLM transmettant des données sensibles | LLM compilé statiquement, output contraint par logit_bias |
| **Modification de programme** | Altération du binaire IR post-compilation | Signature Ed25519 vérifiée à chaque chargement |
| **Escalade de privileges** | Instruction non autorisée dans un programme | Capabilities vérifiées formellement + signées |
| **Replay attack** | Réutilisation d'un ancien programme révoqué | Version + timestamp + révocation propagée à tous les nœuds |
| **Man-in-the-middle** | Interception communication SVM ↔ Server | WebSocket TLS mutuel (mTLS) |
| **Data injection** | Faux événements vers la SVM | Sources d'événements authentifiées (HMAC, mTLS, API keys) |

---

## Zéro injection de prompt à l'exécution

C'est la garantie de sécurité la plus fondamentale d'EyeFlow.

**Dans un système agent classique :**
```
User input (malveillant) → injecté dans le prompt → LLM dévié → action non attendue
```

**Dans EyeFlow :**
```
User input → EventPayload normalisé → SVM (pas de LLM) → exécute binaire signé
              ↕
              LLM est seulement appelé pour des champs définis dans outputSchema
              et uniquement si l'instruction LLM_CALL est dans le binaire signé
```

Le payload d'événement ne peut **jamais atteindre** un prompt LLM directement — seul le compilateur construit les prompts, et ils sont figés à la compilation.

---

## Permissions compilées

Chaque programme déclare ses capabilities requises à la compilation. La SVM vérifie :

1. **Toutes les capabilities** référencées existent dans le Catalog
2. **Toutes les capabilities** ont une signature Ed25519 valide
3. **Le programme appelant** a les permissions nécessaires
4. **Aucune capability non déclarée** n'est accessible

```typescript
// eyeflow-server/src/compiler/ir-generator/interfaces/ir.interface.ts
interface PermissionFlags {
  canReadSensors:    boolean;
  canWriteActuators: boolean;
  canCallLLM:        boolean;
  canAccessVault:    boolean;
  canEmitEvents:     boolean;
  canNetworkEgress:  boolean;
}
```

Ces flags sont vérifiés par Z3 à la compilation — un programme qui tente d'utiliser une permission non déclarée est **refusé avant signature**.

---

## Gestion des secrets — HashiCorp Vault

Tous les secrets (clés API, credentials) sont stockés dans **HashiCorp Vault** et jamais dans le binaire LLM-IR :

```toml
# eyeflow-svm.toml
[vault]
addr      = "https://vault.company.com:8200"
auth_method = "kubernetes"  # ou "approle", "token"
namespace = "eyeflow"
```

Les `dynamicSlots` de type `vault` résolvent les secrets **au moment de l'appel LLM**, pas à la compilation. Le binaire contient uniquement le chemin Vault, jamais la valeur.

Rotation des secrets :
```bash
# Rotation de clé API LLM sans recompilation
vault write secret/eyeflow/llm/openai_key value="sk-new-key"
# Les nœuds SVM récupèrent automatiquement la nouvelle valeur au prochain appel
```

---

## Transport — TLS mutuel

Communication entre les composants :

| Canal | Protocole | Auth |
|-------|----------|------|
| Dashboard → Server | HTTPS TLS 1.3 | Bearer JWT |
| SVM → Server | WebSocket TLS 1.3 | mTLS (cert nœud) |
| SVM → LLM Service | HTTPS TLS 1.3 | Bearer token Vault |
| SVM → Vault | HTTPS TLS 1.3 | AppRole / K8s ServiceAccount |
| Kafka (audit) | TLS + SASL | SASL/SCRAM |

---

## Isolation d'exécution

Chaque programme s'exécute dans son propre contexte isolé :

- **Rust ownership model** : pas de data races par construction du langage
- **Pas de shared state** entre programmes concurrents (ResourceArbiter)
- **Sandboxing Linux** : `seccomp` + namespaces si activé en production
- **MCU** : pas de syscalls, pas de heap dynamique partagé

---

## Certifications par secteur

| Secteur | Standard | Fonctionnalités EyeFlow concernées |
|---------|---------|-------------------------------------|
| **Médical** | IEC 62304 | Traçabilité, Z3 formal proofs, audit chain |
| **Médical** | ISO 13485 | Documentation lifecycle, validation lots |
| **Industriel** | IEC 61508 SIL2 | Z3 invariants, postconditions, emergency stop |
| **Industriel** | IEC 62443 | mTLS, Vault, segmentation réseau |
| **Finance** | SOC2 Type II | Audit trail immuable, accès logs |
| **Finance** | PCI-DSS | Vault secrets, no data in logs |
| **Général** | RGPD Art. 22 | Traçabilité décisions automatisées |
| **Europe** | NIS2 | Résilience, audit, incident response |

---

## Checklist sécurité déploiement

```bash
# Vérifier la configuration sécurité
eyeflow-cli security audit --output security-report.json

# Résultat attendu :
✅ TLS activé sur tous les canaux
✅ Vault configuré (secrets non en clair)
✅ mTLS entre SVM et Server
✅ Binaires signés Ed25519
✅ Audit chain Kafka activée
✅ seccomp profiles appliqués
✅ Capabilities catalog up-to-date
⚠️  AVERTISSEMENT: 2 capabilities sans préconditions définies
❌  ERREUR: node-edge-01 utilise certificat expirant dans 7 jours
```

---

## Signaler une vulnérabilité

Contacter l'équipe de sécurité EyeFlow : **security@eyeflow.io**  
PGP : disponible sur Keyserver Ubuntu.

Divulgation responsable : 90 jours avant publication.

---

## Prochaines étapes

👉 [Audit et observabilité](./audit-observability) — preuves cryptographiques  
👉 [Déploiement](../for-developers/deployment) — configuration sécurité en production  
👉 [Verticals — Finance](../verticals/finance) — conformité SOC2/PCI-DSS
