"""Stream the native Windows backend output into a bounded local log."""

import os
from pathlib import Path
import subprocess
import sys

log_path = Path(sys.argv[1])
limit = max(int(sys.argv[2]), 65536)
command = sys.argv[3:]
log_path.parent.mkdir(parents=True, exist_ok=True)
child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
try:
    with log_path.open("ab", buffering=0) as output:
        for line in iter(child.stdout.readline, b""):
            if output.tell() + len(line) > limit:
                output.close()
                tail = log_path.read_bytes()[-limit // 2:]
                log_path.write_bytes(tail[tail.find(b"\n") + 1:])
                output = log_path.open("ab", buffering=0)
            output.write(line[-limit:])
        output.close()
finally:
    child.stdout.close()
raise SystemExit(child.wait())
