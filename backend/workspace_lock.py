"""Reentrant lock shared by threads and separate Web/desktop service processes."""
import os
import threading
from pathlib import Path


class WorkspaceLock:
    def __init__(self, name):
        self.name = name
        self.mutex = threading.RLock()
        self.local = threading.local()

    def __enter__(self):
        from runtime_paths import workspace_directory
        self.mutex.acquire()
        try:
            depth = getattr(self.local, 'depth', 0)
            if depth == 0:
                directory = workspace_directory() / 'production/.locks'
                directory.mkdir(parents=True, exist_ok=True)
                handle = (directory / (self.name + '.lock')).open('a+b')
                try:
                    if os.name == 'nt':
                        import msvcrt
                        handle.seek(0)
                        if not handle.read(1):
                            handle.write(b'0')
                            handle.flush()
                        handle.seek(0)
                        msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
                except BaseException:
                    handle.close()
                    raise
                self.local.handle = handle
            self.local.depth = depth + 1
            return self
        except BaseException:
            self.mutex.release()
            raise

    def __exit__(self, *_):
        try:
            self.local.depth -= 1
            if self.local.depth == 0:
                handle = self.local.handle
                try:
                    if os.name == 'nt':
                        import msvcrt
                        handle.seek(0)
                        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
                finally:
                    handle.close()
                    del self.local.handle
        finally:
            self.mutex.release()
