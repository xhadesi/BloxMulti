const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, exec, execFile } = require('child_process');
const fs = require('fs');

let mainWindow;
let robloxInstances = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: false,
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, 'icon.ico')
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Find Roblox installation path
function findRobloxPath() {
  const localAppData = process.env.LOCALAPPDATA;
  const robloxPath = path.join(localAppData, 'Roblox', 'Versions');
  
  if (!fs.existsSync(robloxPath)) {
    return null;
  }

  const versions = fs.readdirSync(robloxPath);
  for (const version of versions) {
    if (version.startsWith('version-')) {
      const exePath = path.join(robloxPath, version, 'RobloxPlayerBeta.exe');
      if (fs.existsSync(exePath)) {
        return exePath;
      }
    }
  }
  
  return null;
}

// Use the C++ mutex killer
function killRobloxMutex() {
  return new Promise((resolve, reject) => {
    const mutexKillerPath = path.join(__dirname, 'resources', 'mutex_killer.exe');
    
    // Check if mutex killer exists
    if (!fs.existsSync(mutexKillerPath)) {
      console.log('Mutex killer not found, trying PowerShell fallback...');
      // Fallback to PowerShell method
      const psScript = `
        try {
          $mutex = [System.Threading.Mutex]::OpenExisting("ROBLOX_singletonMutex")
          if ($mutex) {
            $mutex.Close()
            $mutex.Dispose()
          }
        } catch {}
      `;
      exec(`powershell -Command "${psScript}"`, () => resolve());
      return;
    }
    
    execFile(mutexKillerPath, (error) => {
      // Ignore errors - mutex might not exist
      resolve();
    });
  });
}

// Launch a new Roblox instance
ipcMain.handle('launch-instance', async () => {
  try {
    const robloxPath = findRobloxPath();
    
    if (!robloxPath) {
      return { success: false, error: 'Roblox not found. Please install Roblox first.' };
    }

    // Kill the mutex before launching
    await killRobloxMutex();
    
    // Small delay to ensure mutex is released
    await new Promise(resolve => setTimeout(resolve, 250));
    
    // Launch Roblox with CREATE_NEW_PROCESS_GROUP flag
    const robloxProcess = spawn(robloxPath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    
    robloxProcess.unref();
    
    const instanceId = Date.now();
    const instance = {
      id: instanceId,
      pid: robloxProcess.pid,
      startTime: Date.now()
    };
    
    robloxInstances.push(instance);
    
    return { 
      success: true, 
      instanceId: instanceId,
      pid: robloxProcess.pid 
    };
    
  } catch (error) {
    console.error('Launch error:', error);
    return { success: false, error: error.message };
  }
});

// Kill specific instance
ipcMain.handle('kill-instance', async (event, pid) => {
  try {
    // Use taskkill for more reliable termination
    exec(`taskkill /F /PID ${pid}`, (error) => {
      if (error) {
        console.log('Process might already be closed');
      }
    });
    
    robloxInstances = robloxInstances.filter(inst => inst.pid !== pid);
    
    // Small delay before returning
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Kill all instances
ipcMain.handle('kill-all-instances', async () => {
  try {
    exec('taskkill /F /IM RobloxPlayerBeta.exe', (error) => {
      // Ignore errors if no processes found
    });
    
    robloxInstances = [];
    
    // Small delay before returning
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get running instances (sync from system)
ipcMain.handle('sync-instances', async () => {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq RobloxPlayerBeta.exe" /FO CSV /NH', (error, stdout) => {
      if (error || !stdout.trim()) {
        robloxInstances = [];
        resolve({ instances: [] });
        return;
      }
      
      // Parse running Roblox processes
      const lines = stdout.trim().split('\n');
      const runningPids = lines.map(line => {
        const match = line.match(/"(\d+)"/);
        return match ? parseInt(match[1]) : null;
      }).filter(pid => pid !== null);
      
      // Filter instances to only include running processes
      robloxInstances = robloxInstances.filter(inst => 
        runningPids.includes(inst.pid)
      );
      
      resolve({ instances: robloxInstances });
    });
  });
});

// Window controls
ipcMain.on('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.on('close-window', () => {
  mainWindow.close();
});