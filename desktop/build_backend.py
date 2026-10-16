"""Bundle the service and an explicit public/scaffolding allowlist, never vault data."""
import os
import shutil
import subprocess
import sys
import importlib.metadata
import sysconfig
from pathlib import Path
from workspace_seed import write_seed

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'build/desktop-content'


def main():
    if sys.platform != 'darwin':
        raise SystemExit('Build the macOS app on macOS, once per target architecture.')
    shutil.rmtree(STAGE, ignore_errors=True)
    STAGE.mkdir(parents=True)
    store_build = '--app-store' in sys.argv
    for name in ('index.html', 'frontend', 'assets'):
        # Store distribution has no license to redistribute character references
        # or the example comics. Keep the originals in the author's workspace.
        if store_build and name == 'assets':
            (STAGE / 'assets/refer_image').mkdir(parents=True)
            # Product branding is owned by this app, unlike bundled comic and
            # character references excluded from the Store distribution.
            if (ROOT / 'assets/brand').is_dir():
                shutil.copytree(ROOT / 'assets/brand', STAGE / 'assets/brand')
            continue
        source, destination = ROOT / name, STAGE / name
        if source.is_dir():
            shutil.copytree(source, destination, ignore=shutil.ignore_patterns('__pycache__', '.DS_Store', 'tests', 'demos', 'examples'))
        else:
            shutil.copy2(source, destination)
    # Only versioned reusable ComicBrain files are distributable.
    tracked = subprocess.check_output(['git', 'ls-files', '-z', 'ComicBrain'], cwd=ROOT).decode().split('\0')
    for name in filter(None, tracked):
        relative = Path(name)
        if not (name.startswith('ComicBrain/.agents/skills/') or name in ('ComicBrain/AGENTS.md', 'ComicBrain/production/README.md')):
            continue
        destination = STAGE / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / relative, destination)
    write_seed(STAGE / 'ComicBrain')
    if store_build:
        licenses = STAGE / 'licenses'
        licenses.mkdir()
        for distribution in importlib.metadata.distributions():
            name = distribution.metadata.get('Name', 'unknown')
            target = licenses / name
            target.mkdir(exist_ok=True)
            (target / 'METADATA.txt').write_text(distribution.read_text('METADATA') or '')
            for relative in distribution.files or []:
                if any(part.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE')) for part in relative.parts):
                    source = Path(distribution.locate_file(relative))
                    if source.is_file():
                        destination = target / str(relative).replace('../', '')
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(source, destination)
        for source in (Path(sysconfig.get_path('stdlib')) / 'LICENSE.txt', Path(sys.base_prefix) / 'LICENSE.txt', Path(sys.base_prefix) / 'LICENSE'):
            if source.is_file():
                shutil.copy2(source, licenses / 'Python-LICENSE.txt')
                break
        else:
            raise RuntimeError('Python license is missing from the store runtime')
    command = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
               '--name', 'comicperfect-server', '--distpath', str(ROOT / 'build'),
               '--workpath', str(ROOT / 'build/pyinstaller'), '--specpath', str(ROOT / 'build'),
               '--paths', str(ROOT / 'backend'), '--paths', str(ROOT),
               '--add-data', f'{STAGE}{os.pathsep}app-content',
               '--collect-all', 'langchain_openai', '--collect-all', 'langchain_core',
               '--collect-all', 'tiktoken', '--hidden-import', 'tiktoken_ext.openai_public',
               '--hidden-import', 'controllers.console_controller',
               '--hidden-import', 'services.canon_service', '--hidden-import', 'services.series_memory_service',
               str(ROOT / 'desktop/server.py')]
    subprocess.run(command, cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
