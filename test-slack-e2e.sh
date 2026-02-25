#!/usr/bin/env bash
# ============================================================
#  EyeFlow — Test end-to-end connecteur Slack
#  Usage : ./test-slack-e2e.sh [VOTRE_SLACK_BOT_TOKEN] [#channel]
#
#  Prérequis :
#    - eyeflow-server  sur http://localhost:3000
#    - eyeflow-llm-service sur http://localhost:8000
# ============================================================
set -e

# ── Couleurs ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()    { echo -e "${RED}[FAIL]${NC} $*"; }
step()    { echo -e "\n${BOLD}══════════════════════════════════════${NC}"; echo -e "${BOLD} $*${NC}"; echo -e "${BOLD}══════════════════════════════════════${NC}"; }

API_URL="${API_URL:-http://localhost:3000}"
LLM_URL="${LLM_URL:-http://localhost:8000}"
SLACK_TOKEN="${1:-${SLACK_BOT_TOKEN:-xoxb-REMPLACEZ-PAR-VOTRE-TOKEN}}"
SLACK_CHANNEL="${2:-${SLACK_CHANNEL:-general}}"
# Normaliser le channel (enlever le # si présent)
SLACK_CHANNEL="${SLACK_CHANNEL#\#}"

# ── Auth ────────────────────────────────────────────────────
step "1. Authentification"
LOGIN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@eyeflow.io","password":"Test1234!"}')

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accessToken',''))" 2>/dev/null)
USER_ID=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)

if [ -z "$TOKEN" ] || [ -z "$USER_ID" ]; then
  fail "Impossible de se connecter à $API_URL"
  echo "Réponse: $LOGIN"
  exit 1
fi
success "Connecté : USER_ID=$USER_ID"

HDR_AUTH="Authorization: Bearer $TOKEN"
HDR_JSON="Content-Type: application/json"
HDR_USER="X-User-ID: $USER_ID"

# ── Check services ───────────────────────────────────────────
step "2. Vérification des services"

if curl -sf "$API_URL/health" > /dev/null; then
  success "NestJS actif sur $API_URL"
else
  fail "NestJS non disponible sur $API_URL"
  exit 1
fi

if curl -sf "$LLM_URL/health" > /dev/null; then
  success "Python LLM service actif sur $LLM_URL"
else
  warn "Python LLM service non disponible sur $LLM_URL (requis pour création de règle)"
  LLM_AVAILABLE=false
fi

# ── Connecteur Slack ─────────────────────────────────────────
step "3. Création du connecteur Slack"

# Supprimer un éventuel connecteur test existant
EXISTING=$(curl -s "$API_URL/connectors?type=slack" \
  -H "$HDR_AUTH" -H "$HDR_USER" | \
  python3 -c "import sys,json; cs=json.load(sys.stdin); [print(c['id']) for c in cs if c.get('name')=='Slack Test E2E']" 2>/dev/null)

if [ -n "$EXISTING" ]; then
  warn "Connecteur existant trouvé ($EXISTING) — suppression..."
  curl -s -X DELETE "$API_URL/connectors/$EXISTING" \
    -H "$HDR_AUTH" -H "$HDR_USER" > /dev/null
  success "Ancien connecteur supprimé"
fi

CREATE=$(curl -s -X POST "$API_URL/connectors" \
  -H "$HDR_AUTH" -H "$HDR_JSON" -H "$HDR_USER" \
  -d "{
    \"type\": \"slack\",
    \"name\": \"Slack Test E2E\",
    \"description\": \"Connecteur Slack pour test end-to-end\",
    \"auth\": {
      \"type\": \"bearer_token\",
      \"credentials\": {
        \"botToken\": \"$SLACK_TOKEN\",
        \"defaultChannel\": \"$SLACK_CHANNEL\"
      }
    }
  }")

CONNECTOR_ID=$(echo "$CREATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
CONN_STATUS=$(echo "$CREATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('statusCode','ok'))" 2>/dev/null)

if [ -z "$CONNECTOR_ID" ] || [ "$CONN_STATUS" != "ok" ]; then
  fail "Création du connecteur échouée"
  echo "$CREATE" | python3 -m json.tool 2>/dev/null || echo "$CREATE"
  exit 1
fi
success "Connecteur créé : ID=$CONNECTOR_ID"

# ── Test de connexion ────────────────────────────────────────
step "4. Test de la connexion Slack"

if [ "$SLACK_TOKEN" = "xoxb-REMPLACEZ-PAR-VOTRE-TOKEN" ]; then
  warn "Token fictif détecté — test de connexion ignoré"
  warn "Passez votre vrai token : ./test-slack-e2e.sh xoxb-votre-token #general"
else
  TEST=$(curl -s -X POST "$API_URL/connectors/$CONNECTOR_ID/test" \
    -H "$HDR_AUTH" -H "$HDR_USER")
  TEST_OK=$(echo "$TEST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success', False))" 2>/dev/null)

  if [ "$TEST_OK" = "True" ]; then
    LATENCY=$(echo "$TEST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('latency','?'))" 2>/dev/null)
    success "Connexion Slack ✅ (latence: ${LATENCY}ms)"
  else
    ERR=$(echo "$TEST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','?'))" 2>/dev/null)
    fail "Test de connexion échoué: $ERR"
    warn "Continuons malgré tout pour tester le reste du flow..."
  fi
fi

# ── Création de règle via l'API ──────────────────────────────
step "5. Création d'une règle Slack via l'API"

# On crée une règle directement sans passer par le LLM
# (pour un test purement technique)
info "Création d'une règle : 'Si valeur CPU > 80 → envoyer alerte Slack'"

RULE=$(curl -s -X POST "$API_URL/tasks/rules" \
  -H "$HDR_JSON" -H "$HDR_USER" \
  -d "{
    \"name\": \"Alerte CPU Slack\",
    \"description\": \"Test E2E : alerte Slack quand CPU > 80%\",
    \"sourceConnectorType\": \"ON_EVENT\",
    \"condition\": {
      \"fieldName\": \"cpu_usage\",
      \"operator\": \"gt\",
      \"value\": 80
    },
    \"actions\": [
      {
        \"name\": \"sendMessage\",
        \"parameters\": {
          \"connector\": \"$CONNECTOR_ID\",
          \"connectorId\": \"$CONNECTOR_ID\",
          \"function\": \"sendMessage\",
          \"channel\": \"$SLACK_CHANNEL\",
          \"message\": \"🚨 Alerte CPU : usage > 80% détecté par EyeFlow\"
        }
      }
    ],
    \"debounceConfig\": {
      \"strategy\": \"debounce\",
      \"minIntervalMs\": 60000,
      \"maxActionsPerHour\": 10
    }
  }")

RULE_ID=$(echo "$RULE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
RULE_STATUS=$(echo "$RULE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('statusCode','ok'))" 2>/dev/null)

if [ -z "$RULE_ID" ] || [ "$RULE_STATUS" != "ok" ]; then
  fail "Création de la règle échouée"
  echo "$RULE" | python3 -m json.tool 2>/dev/null || echo "$RULE"
  exit 1
fi
success "Règle créée : ID=$RULE_ID (status: $(echo "$RULE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null))"

# ── Vérification règle dans la liste ─────────────────────────
step "6. Vérification : règle visible dans Automations"

RULES=$(curl -s "$API_URL/tasks/rules" -H "$HDR_USER")
COUNT=$(echo "$RULES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('rules',d) if isinstance(d,dict) else d))" 2>/dev/null)
success "Règles en base : $COUNT règle(s)"

# ── Approbation ───────────────────────────────────────────────
step "7. Approbation de la règle"

APPROVE=$(curl -s -X POST "$API_URL/tasks/rules/$RULE_ID/approve" \
  -H "$HDR_JSON" -H "$HDR_USER" \
  -d '{}')

APPROVED_STATUS=$(echo "$APPROVE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null)
if [[ "$APPROVED_STATUS" == "ACTIVE" ]] || echo "$APPROVE" | grep -q "approved\|active\|ACTIVE"; then
  success "Règle approuvée et déployée ✅"
else
  warn "Statut après approbation: $APPROVED_STATUS"
  echo "$APPROVE" | python3 -m json.tool 2>/dev/null | head -10
fi

# ── Déclenchement manuel ─────────────────────────────────────
step "8. Déclenchement manuel de la règle"

if [ "$SLACK_TOKEN" != "xoxb-REMPLACEZ-PAR-VOTRE-TOKEN" ]; then
  TRIGGER=$(curl -s -X POST "$API_URL/tasks/rules/$RULE_ID/trigger" \
    -H "$HDR_JSON" -H "$HDR_USER" \
    -d '{"eventData": {"cpu_usage": 95, "server": "prod-01", "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}}'  2>/dev/null)

  EXEC_ID=$(echo "$TRIGGER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('executionId',''))" 2>/dev/null)
  if [ -n "$EXEC_ID" ]; then
    success "Exécution déclenchée : ID=$EXEC_ID"
    
    # Attendre l'exécution
    sleep 2
    EXEC=$(curl -s "$API_URL/tasks/rules/$RULE_ID/executions" \
      -H "$HDR_AUTH" -H "$HDR_USER" | python3 -m json.tool 2>/dev/null | head -20)
    echo "$EXEC"
  else
    warn "Endpoint /trigger non disponible encore — déclenchez via un événement"
    echo "$TRIGGER" | python3 -m json.tool 2>/dev/null | head -10
  fi
else
  warn "Token fictif — déclenchement ignoré"
fi

# ── Résumé ────────────────────────────────────────────────────
step "✅  Résumé du test E2E"
echo ""
success "Connecteur ID  : $CONNECTOR_ID"
success "Règle ID       : $RULE_ID"
echo ""
echo -e "${BOLD}Prochaines étapes dans le dashboard :${NC}"
echo "  1. Ouvrir : http://localhost:5176/configuration  → onglet 'Connecteurs'"
echo "  2. Vérifier 'Slack Test E2E' avec bouton Test"
echo "  3. Ouvrir : http://localhost:5176/automations"
echo "  4. Vérifier la règle 'Alerte CPU Slack'"
echo ""
echo -e "${BOLD}Variables pour d'autres tests :${NC}"
echo "  CONNECTOR_ID=$CONNECTOR_ID"
echo "  RULE_ID=$RULE_ID"
echo "  USER_ID=$USER_ID"
