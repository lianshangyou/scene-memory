"""Launch a local service without inheriting a hook console or pipe handles."""

import os
import re
import shutil
import subprocess
import sys

command = sys.argv[1:]
if not command:
    raise SystemExit(2)
command[0] = shutil.which(command[0]) or command[0]
log_path = os.environ.get("CLAUDE_SMART_SPAWN_LOG")
backend_log_limit = None
if len(command) > 5 and command[1].replace("\\", "/").endswith("/backend-log-runner.sh"):
    log_path = command[2]
    backend_log_limit = command[3]
    command = command[5:]
    if command and command[0] == "env":
        command.pop(0)
        while command and "=" in command[0] and not command[0].startswith("--"):
            key, value = command.pop(0).split("=", 1)
            os.environ[key] = value
    command[0] = shutil.which(command[0]) or command[0]
for key in ("CLAUDE_SMART_CLI_PATH", "PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT", "CLAUDE_SMART_PLUGIN_ROOT"):
    value = os.environ.get(key, "")
    if re.match(r"^/[A-Za-z]/", value):
        os.environ[key] = value[1].upper() + ":" + value[2:]
if backend_log_limit:
    runner = os.path.join(os.path.dirname(__file__), "windows-log-runner.py")
    command = [sys.executable, runner, log_path, backend_log_limit, *command]
    log_path = None
output = open(log_path, "ab", buffering=0) if log_path else subprocess.DEVNULL
try:
    child = subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=output,
        stderr=output,
        close_fds=True,
        creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    print(child.pid)
finally:
    if log_path:
        output.close()
