import os
import json
import subprocess
import logging
from datetime import datetime
from uuid import uuid4
from typing import Any, Dict, Optional
from enum import Enum

import socketio
from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('EyeFlowAgent')

# ==================== Config ====================

SERVER_HOST = os.getenv('SERVER_HOST', 'localhost')
SERVER_PORT = int(os.getenv('SERVER_PORT', 3000))
AGENT_ID = os.getenv('AGENT_ID', f'agent-{uuid4().hex[:8]}')
AGENT_NAME = os.getenv('AGENT_NAME', 'Local Agent')
AGENT_VERSION = os.getenv('AGENT_VERSION', '0.1.0')

SERVER_URL = f'http://{SERVER_HOST}:{SERVER_PORT}'

# ==================== Models ====================

class ActionType(str, Enum):
    SHELL = 'shell'
    PYTHON = 'python'
    HTTP = 'http'
    DB_QUERY = 'db_query'


class JobRequest(BaseModel):
    jobId: str
    action: Dict[str, Any]
    params: Dict[str, Any] = Field(default_factory=dict)


class JobStatus(str, Enum):
    PENDING = 'pending'
    RUNNING = 'running'
    SUCCESS = 'success'
    FAILED = 'failed'
    TIMEOUT = 'timeout'


# ==================== Socket.IO Client ====================

sio = socketio.Client(
    reconnection=True,
    reconnection_delay=1,
    reconnection_delay_max=5,
    reconnection_attempts=0,  # infinite
    logger=True,
    engineio_logger=False,
)

current_jobs: Dict[str, Dict] = {}


@sio.event
def connect():
    logger.info('✅ Connected to EyeFlow Server')
    # Register agent
    sio.emit('agent:register', {
        'agentId': AGENT_ID,
        'agentName': AGENT_NAME,
        'version': AGENT_VERSION,
    })


@sio.event
def agent_registered_ack(data):
    if data.get('success'):
        logger.info(f'✅ Agent {AGENT_ID} registered successfully')


@sio.event
def job_dispatch(data):
    """Receive job dispatch from server"""
    try:
        job_req = JobRequest(**data)
        logger.info(f'📋 Job received: {job_req.jobId}')
        
        # Execute in background
        execute_job(job_req)
    except Exception as e:
        logger.error(f'❌ Error processing job: {e}')


def execute_job(job_req: JobRequest):
    """Execute a job and report status"""
    job_id = job_req.jobId
    action = job_req.action
    params = job_req.params

    # Track job
    current_jobs[job_id] = {
        'status': JobStatus.RUNNING,
        'progress': 0,
        'logs': [],
        'startedAt': datetime.now().isoformat(),
    }

    # Notify job started
    update_job_status(job_id, JobStatus.RUNNING, 0, ['Job started'])

    try:
        action_type = ActionType(action.get('type', 'shell'))
        config = action.get('config', {})

        if action_type == ActionType.SHELL:
            result = execute_shell(config, params, job_id)
        elif action_type == ActionType.PYTHON:
            result = execute_python(config, params, job_id)
        elif action_type == ActionType.HTTP:
            result = execute_http(config, params, job_id)
        else:
            raise ValueError(f'Unknown action type: {action_type}')

        # Job success
        update_job_status(job_id, JobStatus.SUCCESS, 100, 
                         [f'Job completed successfully'], result)
        logger.info(f'✅ Job {job_id} completed')

    except Exception as e:
        # Job failed
        error_msg = str(e)
        update_job_status(job_id, JobStatus.FAILED, 0, 
                         [f'Error: {error_msg}'])
        logger.error(f'❌ Job {job_id} failed: {error_msg}')


def execute_shell(config: Dict, params: Dict, job_id: str) -> Dict:
    """Execute shell command"""
    command = config.get('command', '')
    timeout = config.get('timeout', 300)

    if not command:
        raise ValueError('command is required for shell execution')

    logger.info(f'🔧 Executing shell: {command}')
    
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        # Send logs
        logs = result.stdout.split('\n') if result.stdout else []
        if result.stderr:
            logs.extend(result.stderr.split('\n'))
        
        update_job_status(job_id, JobStatus.RUNNING, 50, logs)

        if result.returncode != 0:
            raise Exception(f'Command failed with code {result.returncode}')

        return {
            'exitCode': result.returncode,
            'stdout': result.stdout,
            'stderr': result.stderr,
        }

    except subprocess.TimeoutExpired:
        raise Exception(f'Command timeout after {timeout}s')


def execute_python(config: Dict, params: Dict, job_id: str) -> Dict:
    """Execute Python script/code"""
    code = config.get('code', '')
    timeout = config.get('timeout', 300)

    if not code:
        raise ValueError('code is required for python execution')

    logger.info(f'🐍 Executing Python code')

    try:
        # Create safe execution context
        safe_dict = {
            '__builtins__': __builtins__,
            'params': params,
        }

        exec(code, safe_dict)
        
        return {
            'success': True,
            'result': safe_dict.get('result', None),
        }

    except Exception as e:
        raise Exception(f'Python execution failed: {str(e)}')


def execute_http(config: Dict, params: Dict, job_id: str) -> Dict:
    """Execute HTTP request"""
    import requests

    url = config.get('url', '')
    method = config.get('method', 'GET')
    headers = config.get('headers', {})
    body = config.get('body', {})
    timeout = config.get('timeout', 30)

    if not url:
        raise ValueError('url is required for HTTP execution')

    logger.info(f'🌐 HTTP {method} {url}')

    try:
        if method.upper() == 'GET':
            response = requests.get(url, headers=headers, timeout=timeout)
        elif method.upper() == 'POST':
            response = requests.post(url, json=body, headers=headers, timeout=timeout)
        else:
            raise ValueError(f'Unsupported HTTP method: {method}')

        return {
            'statusCode': response.status_code,
            'headers': dict(response.headers),
            'body': response.text,
        }

    except requests.RequestException as e:
        raise Exception(f'HTTP request failed: {str(e)}')


def update_job_status(job_id: str, status: JobStatus, progress: int, 
                     logs: list, result: Optional[Dict] = None):
    """Send job status update to server"""
    try:
        sio.emit('job:status_update', {
            'jobId': job_id,
            'status': status.value,
            'progress': progress,
            'logs': logs,
            'result': result,
        })
        logger.debug(f'📤 Status update sent: {job_id} => {status.value}')
    except Exception as e:
        logger.error(f'Failed to send status update: {e}')


def send_heartbeat():
    """Send heartbeat to server"""
    try:
        sio.emit('agent:heartbeat', {
            'agentId': AGENT_ID,
            'timestamp': datetime.now().isoformat(),
            'activeJobs': len(current_jobs),
        })
    except Exception as e:
        logger.warning(f'Failed to send heartbeat: {e}')


@sio.event
def disconnect():
    logger.warning('⚠️ Disconnected from server, attempting reconnection...')


@sio.on('*')
def catch_all(event, data):
    logger.debug(f'Received event: {event} => {data}')


# ==================== Main ====================

def main():
    logger.info(f'''
╔════════════════════════════════════════════════════╗
║       🤖 EyeFlow Agent Started                    ║
║                                                    ║
║  Agent ID: {AGENT_ID}
║  Agent Name: {AGENT_NAME}
║  Server: {SERVER_URL}
║                                                    ║
╚════════════════════════════════════════════════════╝
    ''')

    # Connect to server
    try:
        sio.connect(SERVER_URL, 
                   auth={'agentId': AGENT_ID},
                   transports=['websocket', 'polling'])
        logger.info('🔗 Connecting to server...')
    except Exception as e:
        logger.error(f'❌ Failed to connect: {e}')
        return

    # Keep alive
    try:
        while True:
            import time
            time.sleep(5)
            send_heartbeat()
    except KeyboardInterrupt:
        logger.info('Shutting down gracefully...')
        sio.disconnect()


if __name__ == '__main__':
    main()
