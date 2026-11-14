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
    def run_install(self, mode, preview=False, install_docker=None, release=None, verified=True, pull_error=None, firewall=None):
        """install_docker: None = Docker present; 'y'/'n' = Docker missing, answer to the offer.
        release: a published release tag (the image path); None = no release, so main is built.
        firewall: None = no host firewall; 'y'/'n' = ufw is on, answer to the offer to open ports."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            binaries = base / 'bin'
            binaries.mkdir()
            mocks = {
                'docker': ('#!/bin/sh\ncase "$*" in\n'
                           '  "pull "*) [ -z "$TEST_PULL_ERROR" ] || { echo "$TEST_PULL_ERROR" >&2; exit 1; };;\n'
                           '  *hash-password*) cat >/dev/null; printf \'$2a$14$testhash\\n\';;\n'
                           '  *Server.Arch*) [ -z "$TEST_RELEASE" ] || echo amd64;;\n'
                           '  "image inspect"*) echo "ghcr.io/eljakani/naruvi-app@sha256:$(printf %064d 7)";;\n'
                           '  *cosign*verify*) [ "$TEST_VERIFIED" = 1 ] || exit 1;;\n'
                           '  *_journal.json*) echo 30;;\n'
                           '  *__drizzle_migrations*) echo "${TEST_MIGRATED:-30}";;\n'
                           '  "volume inspect"*) [ -n "$TEST_OLD_VOLUME" ] || exit 1;;\n'
                           '  "compose up"*) echo "$*" >> "$MOCK_BIN/up.log";;\n'
                           'esac\n'),
                'git': ('#!/bin/sh\ncase "$*" in\n'
                        '  *ls-remote*) [ -z "$TEST_RELEASE" ] || printf \'%040d\\trefs/tags/%s\\n\' 0 "$TEST_RELEASE";;\n'
                        '  *rev-parse*) printf \'%040d\\n\' 1;;\n'
                        '  *clone*) for last; do :; done; mkdir -p "$last"; cp -R "$TEST_REPO/deploy" "$last/deploy";;\n'
                        'esac\n'),
                'curl': '#!/bin/sh\nprintf "%s" "$TEST_STATUS"\n',
                # Never read or touch the real machine's firewall.
                'systemctl': '#!/bin/sh\nexit 3\n',
                'sudo': '#!/bin/sh\nwhile case "$1" in -*) true;; *) false;; esac; do shift; done\n[ $# -eq 0 ] || exec "$@"\n',
                'ufw': '#!/bin/sh\necho "$*" >> "$MOCK_BIN/ufw.log"\n',
            }
            ufw_conf = base / 'ufw.conf'
            if firewall:
                ufw_conf.write_text('ENABLED=yes\n')
            docker_mock = mocks['docker']
            if install_docker:
                del mocks['docker']
                # get.docker.com is downloaded with -o; its "install" drops the docker mock on PATH.
                mocks['curl'] = ('#!/bin/sh\ncase "$*" in *get.docker.com*)\n'
                                 '  while [ "$1" != -o ]; do shift; done\n'
                                 '  printf \'printf "%%s" "$DOCKER_MOCK" > "$MOCK_BIN/docker"; chmod 700 "$MOCK_BIN/docker"\\n\' > "$2"; exit 0;;\n'
                                 'esac\nprintf "%s" "$TEST_STATUS"\n')
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
                       NARUVI_INSTALL_DIR=str(root), TEST_REPO=str(REPO), NARUVI_UFW_CONF=str(ufw_conf),
                       TEST_STATUS='200', NO_COLOR='1', TEST_RELEASE=release or '', TEST_VERIFIED='1' if verified else '0',
                       TEST_PULL_ERROR=pull_error or '')
            master, slave = pty.openpty()
            def terminal():
                os.setsid()
                fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
            proc = subprocess.Popen(['bash', str(REPO / 'install.sh')] + (['--preview'] if preview else []), stdin=slave,
                                    stdout=slave, stderr=slave, env=env, preexec_fn=terminal)
            os.close(slave)
            prompts = [('Install Docker now?', install_docker)] if install_docker else []
            prompts += [('Choose 1-3', mode)]
            if firewall:
                prompts += [('Open ports 80 and 443 in ufw?', firewall)]
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
                if release and not verified:
                    self.assertEqual(proc.returncode, 1, output)
                    self.assertIn('did not pass signature verification', output)
                    self.assertNotIn('NARUVI_IMAGE=ghcr.io', (root / '.env').read_text())
                    return
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
                if release and pull_error:
                    # A download that fails says why, then builds here instead.
                    self.assertIn('NARUVI_IMAGE=naruvi-app:source', config)
                    self.assertIn('build.yaml', config)
                    if 'manifest unknown' in pull_error:
                        self.assertIn(f'none for {release} on this machine', output)
                    else:
                        self.assertIn("couldn't download it; building instead", output)
                        self.assertIn('Docker: ' + pull_error, output)
                    self.assertIn('Build image', output)
                elif release:
                    # The verified release image, pinned by digest; nothing built here.
                    self.assertIn('NARUVI_IMAGE=ghcr.io/eljakani/naruvi-app@sha256:' + '0' * 63 + '7', config)
                    self.assertNotIn('build.yaml', config)
                    self.assertIn('Download and verify image', output)
                    self.assertNotIn('Build image', output)
                    self.assertIn(release, output)
                else:
                    self.assertIn('NARUVI_IMAGE=naruvi-app:source', config)
                    self.assertIn('Build image', output)
                opened = (binaries / 'ufw.log').read_text() if (binaries / 'ufw.log').exists() else ''
                if firewall == 'y':
                    self.assertEqual(opened, 'allow 80/tcp\nallow 443/tcp\n')
                    self.assertIn('Open firewall', output)
                else:
                    self.assertEqual(opened, '')
                if mode == '2':
                    self.assertIn('NARUVI_DOMAIN=careers.example.com', config)
                    self.assertIn('COMPOSE_FILE=compose.yaml:hosted.yaml' + ('' if release else ':build.yaml'), config)
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

    def test_release_uses_signed_image(self):
        self.run_install('2', release='v9.9.9')

    def test_download_error_is_shown_then_builds(self):
        self.run_install('1', release='v9.9.9', pull_error='permission denied while trying to connect to the docker API at unix:///var/run/docker.sock')

    def test_missing_image_builds(self):
        self.run_install('1', release='v9.9.9', pull_error='Error response from daemon: manifest unknown')

    def test_unverified_image_stops(self):
        self.run_install('1', release='v9.9.9', verified=False)

    def test_server_preview(self):
        self.run_install('2', preview=True)

    def test_server(self):
        self.run_install('2')

    def test_server_opens_firewall(self):
        self.run_install('2', firewall='y')

    def test_server_leaves_firewall_when_declined(self):
        self.run_install('2', firewall='n')

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

    def unattended(self, base, *arguments, **settings):
        """Run `install.sh --yes` (or the installed `naruvi`, when the first argument is 'naruvi') against mocks."""
        binaries = base / 'bin'
        if not binaries.exists():
            binaries.mkdir()
            mocks = {
                'docker': ('#!/bin/sh\ncase "$*" in\n'
                           '  "volume inspect"*) [ -n "$TEST_OLD_VOLUME" ] || exit 1;;\n'
                           '  "compose build"*) [ -z "$TEST_BUILD_FAILS" ] || { echo "build broke" >&2; exit 1; };;\n'
                           '  *_journal.json*) echo 30;;\n'
                           '  *__drizzle_migrations*) echo "${TEST_MIGRATED:-30}";;\n'
                           '  *"ps -q --status running"*) [ -z "$TEST_RUNNING" ] || echo abc;;\n'
                           '  *setup-link.mts*) [ -z "$TEST_OWNER" ] || exit 2; echo "http://localhost:3456/auth/setup?token=$(printf %064d 0)";;\n'
                           'esac\n'),
                'git': '#!/bin/sh\ncase "$*" in *clone*) for last; do :; done; mkdir -p "$last"; cp -R "$TEST_REPO/deploy" "$last/deploy";; esac\n',
                'curl': '#!/bin/sh\nprintf 200\n',
                'sleep': '#!/bin/sh\nexit 0\n',
            }
            for name, content in mocks.items():
                (binaries / name).write_text(content)
                (binaries / name).chmod(0o700)
            (base / 'home').mkdir()
        root = base / 'installation'
        env = dict(os.environ, PATH=f'{binaries}:{os.environ["PATH"]}', HOME=str(base / 'home'), TEST_REPO=str(REPO),
                   NO_COLOR='1', NARUVI_REF='main', **settings)
        if arguments[0] == 'naruvi':
            command = [str(root / 'naruvi'), *arguments[1:]]
        else:
            command = ['bash', str(REPO / 'install.sh'), '--yes', '--dir', str(root), *arguments]
        return subprocess.run(command, capture_output=True, text=True, env=env, timeout=60)

    def secrets(self, base):
        lines = (base / 'installation' / '.env').read_text().splitlines()
        return [line for line in lines if line.startswith(('POSTGRES_PASSWORD=', 'SETTINGS_ENCRYPTION_KEY='))]

    def test_interrupted_install_resumes_with_the_same_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            first = self.unattended(base, '--mode', 'local', '--port', '3456', TEST_BUILD_FAILS='1')
            self.assertEqual(first.returncode, 1, first.stdout)
            self.assertIn('run the installer again', first.stdout)
            self.assertTrue((base / 'installation' / '.installing').exists())
            before = self.secrets(base)
            self.assertEqual(len(before), 2)
            second = self.unattended(base, '--mode', 'local', '--port', '3456')
            self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
            self.assertIn('Picking up the unfinished installation', second.stdout)
            self.assertIn('Naruvi is ready', second.stdout)
            self.assertIn('/auth/setup?token=', second.stdout)
            self.assertEqual(self.secrets(base), before)
            self.assertFalse((base / 'installation' / '.installing').exists())
            self.assertEqual((base / 'installation' / '.env').read_text().count('NARUVI_IMAGE='), 1)
            third = self.unattended(base, '--mode', 'local', '--port', '3456')
            self.assertIn('already installed', third.stdout)
            self.assertEqual(self.secrets(base), before)

    def test_install_stopped_before_secrets_starts_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / 'installation'
            (root / 'source').mkdir(parents=True)
            (root / '.installing').write_text('main\n')
            result = self.unattended(base, '--mode', 'local', '--port', '3456')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertNotIn('Picking up', result.stdout)
            self.assertIn('Naruvi is ready', result.stdout)

    def test_leftover_database_volume_stops_before_new_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            result = self.unattended(base, '--mode', 'local', '--port', '3456', TEST_OLD_VOLUME='1')
            self.assertEqual(result.returncode, 1)
            self.assertIn('volume naruvi_db-data', result.stdout)
            self.assertIn('docker volume rm', result.stdout)
            self.assertFalse((base / 'installation').exists())

    def test_unapplied_migrations_fail_the_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            result = self.unattended(base, '--mode', 'local', '--port', '3456', TEST_MIGRATED='29')
            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn('migrations are not applied', result.stdout)
            self.assertNotIn('Naruvi is ready', result.stdout)

    def test_manager_explains_broken_settings_and_setup_link(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            self.assertEqual(self.unattended(base, '--mode', 'local', '--port', '3456').returncode, 0)
            env = base / 'installation' / '.env'
            good = env.read_text()

            stopped = self.unattended(base, 'naruvi', 'setup-link')
            self.assertEqual(stopped.returncode, 1)
            self.assertIn('naruvi start', stopped.stdout)
            fresh = self.unattended(base, 'naruvi', 'setup-link', TEST_RUNNING='1')
            self.assertEqual(fresh.returncode, 0, fresh.stdout + fresh.stderr)
            self.assertIn('/auth/setup?token=', fresh.stdout)
            taken = self.unattended(base, 'naruvi', 'setup-link', TEST_RUNNING='1', TEST_OWNER='1')
            self.assertEqual(taken.returncode, 2)
            self.assertIn('already has an owner', taken.stdout)
            self.assertIn('naruvi reset-password', taken.stdout)

            env.write_text('\n'.join(line for line in good.splitlines() if not line.startswith('SETTINGS_ENCRYPTION_KEY=')) + '\n')
            missing = self.unattended(base, 'naruvi', 'start')
            self.assertEqual(missing.returncode, 1)
            self.assertIn('SETTINGS_ENCRYPTION_KEY is missing', missing.stderr)
            self.assertIn('backups/<timestamp>/env', missing.stderr)

            env.write_text(good.replace('NARUVI_URL=http://localhost:3456', 'NARUVI_URL=localhost:3456/'))
            address = self.unattended(base, 'naruvi', 'status')
            self.assertEqual(address.returncode, 1)
            self.assertIn('NARUVI_URL', address.stderr)

            env.write_text(good)
            behind = self.unattended(base, 'naruvi', 'start', TEST_MIGRATED='29')
            self.assertEqual(behind.returncode, 1)
            self.assertIn('migrations are not applied', behind.stdout)
            self.assertEqual(self.unattended(base, 'naruvi', 'start').returncode, 0)

    def test_non_interactive_requires_mode(self):
        result = subprocess.run(['bash', str(REPO / 'install.sh'), '--yes'], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2)


if __name__ == '__main__':
    unittest.main()
