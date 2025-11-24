const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require('electron');
const path = require('path');

// Fix for black screen / blank window during getDisplayMedia (screen capture)
app.disableHardwareAcceleration();

// Try to load .env file if available
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (e) {
  // dotenv might not be installed or available, ignore
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 300,
    minHeight: 400,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    alwaysOnTop: true,
    resizable: true,
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  const isDev = !app.isPackaged;
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();

  // Handle getDisplayMedia requests
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then((sources) => {
        if (sources.length > 0) {
          // Grant access to the first screen available for system audio loopback
          callback({ video: sources[0], audio: 'loopback' });
        } else {
          console.error("No screen sources found");
          callback(null);
        }
      })
      .catch((error) => {
        console.error("Error selecting display source:", error);
        callback(null);
      });
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('resize-window', async (event, width, height) => {
  if (mainWindow) {
    mainWindow.setSize(width, height);
  }
});

ipcMain.handle('toggle-stealth-mode', async (event, enable) => {
  if (!mainWindow) return false;
  
  try {
    const stealthPath = path.resolve(__dirname, '../build/Release/stealth.node');
    delete require.cache[require.resolve(stealthPath)];
    const stealthAddon = require(stealthPath);
    
    const buffer = mainWindow.getNativeWindowHandle();
    const success = stealthAddon.setWindowStealth(buffer, enable);
    return success;

  } catch (e) {
    console.error("Native stealth failed:", e);
    mainWindow.setContentProtection(enable);
    return true;
  }
});