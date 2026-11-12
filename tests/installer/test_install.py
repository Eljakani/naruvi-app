"""Exercise the interactive installer without Docker, network, or persistent state."""
import fcntl
import os
from pathlib import Path
import pty
import select
import subprocess
import tempfile
import termios
import time
import unittest

REPO = Path(__file__).resolve().parents[2]


class InstallerTest(unittest.TestCase):
    def run_install(self, mode, preview=False, install_docker=None):
        """install_docker: None = Docker present; 'y'/'n' = Docker missing, answer to the offer."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            binaries = base / 'bin'
            binaries.mkdir()
            mocks = {
                'docker': '#!/bin/sh\ncase "$*" in *hash-password*) cat >/dev/null; printf \'$2a$14$testhash\\n\';; esac\n',
                'git': '#!/bin/sh\nfor last; do :; done\nmkdir -p "$last"\ncp -R "$TEST_REPO/deploy" "$last/deploy"\n',
                'curl': '#!/bin/sh\nprintf "%s" "$TEST_STATUS"\n',
            }
            docker_mock = mocks['docker']
            if install_docker:
                del mocks['docker']
                # get.docker.com is downloaded with -o; its "install" drops the docker mock on PATH.
                mocks['curl'] = ('#!/bin/sh\ncase "$*" in *get.docker.com*)\n'
                                 '  while [ "$1" != -o ]; do shift; done\n'
                                 '  printf \'printf "%%s" "$DOCKER_MOCK" > "$MOCK_BIN/docker"; chmod 700 "$MOCK_BIN/docker"\\n\' > "$2"; exit 0;;\n'
                                 'esac\nprintf "%s" "$TEST_STATUS"\n')
                mocks['sudo'] = '#!/bin/sh\nwhile case "$1" in -*) true;; *) false;; esac; do shift; done\n[ $# -eq 0 ] || exec "$@"\n'
                mocks['uname'] = '#!/bin/sh\necho Linux\n'
                # Hide any real docker: PATH holds only the mocks plus links to every other tool.
                for directory in os.environ['PATH'].split(os.pathsep):
                    if not os.path.isdir(directory):
                        continue
                    for tool in os.listdir(directory):
                        target = os.path.join(directory, tool)
                        if tool != 'docker' and tool not in mocks and not (binaries / tool).exists() and os.access(target, os.X_OK):
                            (binaries / tool).symlink_to(target)
            for name, content in mocks.items():
                p = binaries / name
                p.write_text(content)
                p.chmod(0o700)
            root = base / 'installation'
            home = base / 'home'
            (home / '.local' / 'bin').mkdir(parents=True)  # so the PATH-link prompt always appears
            path = str(binaries) if install_docker else f'{binaries}:{os.environ["PATH"]}'
            env = dict(os.environ, PATH=path, HOME=str(home), MOCK_BIN=str(binaries), DOCKER_MOCK=docker_mock,
                       NARUVI_INSTALL_DIR=str(root), TEST_REPO=str(REPO),
                       TEST_STATUS='200', NO_COLOR='1')
            master, slave = pty.openpty()
            def terminal():
                os.setsid()
                fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
            proc = subprocess.Popen(['bash', str(REPO / 'install.sh')] + (['--preview'] if preview else []), stdin=slave,
                                    stdout=slave, stderr=slave, env=env, preexec_fn=terminal)
            os.close(slave)
            prompts = [('Install Docker now?', install_docker)] if install_docker else []
            prompts += [('Choose 1-3', mode)]
            if mode in ('2', '3'):
                prompts += [('Domain, without', 'careers.example.com')]
            if mode in ('1', '3'):
                prompts += [('App port', '3456')]
            if mode == '3':
                prompts += [('Choose 1-2', '1')]
            prompts += [('Install into', ''), ('Install now?', 'y')]
            if not preview:
                prompts += [('~/.local/bin', 'n')]
            output = ''
            pending = ''
            deadline = time.time() + 20
            try:
                while time.time() < deadline:
                    if select.select([master], [], [], .1)[0]:
                        try:
                            data = os.read(master, 65536).decode()
                        except OSError:
                            break
                        output += data
                        pending += data
                        if prompts and prompts[0][0] in pending:
                            _, answer = prompts.pop(0)
                            os.write(master, (answer + '\n').encode())
                            pending = ''
                    if proc.poll() is not None:
                        break
                proc.wait(timeout=2)
                if install_docker == 'n':
                    self.assertEqual(proc.returncode, 1, output)
                    self.assertIn('Install Docker now?', output)
                    self.assertIn("Can't continue", output)
                    self.assertFalse(root.exists())
                    return
                self.assertEqual(proc.returncode, 0, output)
                if install_docker:
                    self.assertIn('Install Docker', output)
                    self.assertTrue((binaries / 'docker').exists())
                self.assertFalse(prompts, output)
                self.assertNotIn('\x1b[', output)
                if preview:
                    self.assertIn('Preview complete', output)
                    self.assertFalse(root.exists())
                    return
                self.assertEqual((root / 'install.log').stat().st_mode & 0o777, 0o600)
                config = (root / '.env').read_text()
                self.assertNotIn('long-test-password-123', config)
                self.assertNotIn('long-test-password-123', output)
                self.assertEqual((root / '.env').stat().st_mode & 0o777, 0o600)
                self.assertIn('Naruvi is ready', output)
                self.assertEqual((root / 'naruvi').stat().st_mode & 0o777, 0o700)
                self.assertIn('COMPOSE_PROJECT_NAME=naruvi', config)
                if mode == '2':
                    self.assertIn('NARUVI_DOMAIN=careers.example.com', config)
                    self.assertIn('COMPOSE_FILE=compose.yaml:hosted.yaml', config)
                elif mode == '3':
                    self.assertIn('NARUVI_URL=https://careers.example.com', config)
                    self.assertIn('NARUVI_BIND=127.0.0.1', config)
                    self.assertNotIn('NARUVI_TRUST_PROXY', config)
                else:
                    self.assertIn('NARUVI_PORT=3456', config)
            finally:
                if proc.poll() is None:
                    proc.kill()
                os.close(master)

    def test_local(self):
        self.run_install('1')

    def test_installs_missing_docker(self):
        self.run_install('1', install_docker='y')

    def test_declining_docker_stops(self):
        self.run_install('1', install_docker='n')

    def test_preview_does_not_install(self):
        self.run_install('1', preview=True)

    def test_server_preview(self):
        self.run_install('2', preview=True)

    def test_server(self):
        self.run_install('2')

    def test_proxy(self):
        self.run_install('3')

    def test_rerun_points_to_manager(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / '.env').write_text('x')
            (root / 'naruvi').write_text('#!/bin/sh\n')
            (root / 'naruvi').chmod(0o700)
            result = subprocess.run(['bash', str(REPO / 'install.sh'), '--yes', '--mode', 'local', '--dir', str(root)],
                                    capture_output=True, text=True, env=dict(os.environ, NO_COLOR='1'), timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('already installed', result.stdout)

    def test_non_interactive_requires_mode(self):
        result = subprocess.run(['bash', str(REPO / 'install.sh'), '--yes'], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2)


if __name__ == '__main__':
    unittest.main()
