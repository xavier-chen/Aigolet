import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';
import { join } from 'path';
import type { ServerSupervisor } from '../gateway/supervisor';
import { setQuitting } from './app-state';

let tray: Tray | null = null;

function getIconsDir(): string {
  const candidates = [
    join(__dirname, '../../resources/icons'),
    join(app.getAppPath(), 'resources/icons'),
  ];
  if (app.isPackaged) {
    candidates.unshift(join(process.resourcesPath, 'resources', 'icons'));
  }
  for (const dir of candidates) {
    const testPath = join(dir, 'tray-icon-Template.png');
    if (nativeImage.createFromPath(testPath).isEmpty() === false) {
      return dir;
    }
  }
  return candidates[0];
}

function loadTrayIcon(): Electron.NativeImage {
  const iconsDir = getIconsDir();
  const candidates =
    process.platform === 'darwin'
      ? [join(iconsDir, 'tray-icon-Template.png'), join(iconsDir, 'icon.png')]
      : process.platform === 'win32'
        ? [join(iconsDir, 'icon.ico'), join(iconsDir, 'icon.png')]
        : [join(iconsDir, '32x32.png'), join(iconsDir, 'icon.png')];

  for (const iconPath of candidates) {
    let icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      if (process.platform === 'darwin') {
        icon = icon.resize({ width: 22, height: 22 });
        icon.setTemplateImage(true);
      }
      return icon;
    }
  }

  // Visible fallback: 22×22 "A" template glyph (black on transparent)
  const fallback = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAQ0lEQVR42u2UQQoAQAgC+/+npx/sQjh0SeiomFhVhw1gcTDNYG2IGR1SbJ7wj4hVPYxeYx1MxO1roq4xfkhcVBU+zNAaRiHfbn5IygAAAABJRU5ErkJggg==',
  );
  if (process.platform === 'darwin') fallback.setTemplateImage(true);
  return fallback;
}

export function createTray(
  mainWindow: BrowserWindow,
  supervisor: ServerSupervisor | null,
): Tray {
  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Aigolet');

  const showWindow = () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  };

  const hideWindow = () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.hide();
  };

  const buildMenu = () => {
    const status = supervisor?.getStatus();
    const serverLabel =
      status?.status === 'running'
        ? 'Orchestrator: Running'
        : status?.status === 'starting'
          ? 'Orchestrator: Starting…'
          : 'Orchestrator: Stopped';

    return Menu.buildFromTemplate([
      {
        label: mainWindow.isVisible() ? 'Hide Aigolet' : 'Show Aigolet',
        click: () => {
          if (mainWindow.isDestroyed()) return;
          if (mainWindow.isVisible()) hideWindow();
          else showWindow();
        },
      },
      { type: 'separator' },
      {
        label: serverLabel,
        enabled: false,
      },
      {
        label: 'Restart Server',
        click: () => {
          void supervisor?.restart();
        },
      },
      { type: 'separator' },
      {
        label: 'Open Settings',
        click: () => {
          showWindow();
          mainWindow.webContents.send('navigate', '/settings');
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Aigolet',
        click: () => {
          setQuitting();
          app.quit();
        },
      },
    ]);
  };

  tray.setContextMenu(buildMenu());

  tray.on('click', () => {
    if (mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) hideWindow();
    else showWindow();
    tray?.setContextMenu(buildMenu());
  });

  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
