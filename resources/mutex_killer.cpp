#include <windows.h>
#include <tlhelp32.h>
#include <iostream>
#include <string>

// Kill the Roblox singleton mutex
bool KillRobloxMutex() {
    HANDLE hMutex = OpenMutexW(MUTEX_ALL_ACCESS, FALSE, L"ROBLOX_singletonMutex");
    
    if (hMutex != NULL) {
        CloseHandle(hMutex);
        return true;
    }
    
    // Also try alternative mutex names
    const wchar_t* mutexNames[] = {
        L"ROBLOX_singletonMutex",
        L"RobloxPlayerMutex",
        L"RobloxMutex"
    };
    
    for (int i = 0; i < 3; i++) {
        hMutex = OpenMutexW(MUTEX_ALL_ACCESS, FALSE, mutexNames[i]);
        if (hMutex != NULL) {
            CloseHandle(hMutex);
            return true;
        }
    }
    
    return true; // Return true even if mutex doesn't exist
}

// Find and launch Roblox
std::wstring FindRobloxPath() {
    wchar_t localAppData[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, localAppData))) {
        std::wstring basePath = std::wstring(localAppData) + L"\\Roblox\\Versions\\";
        
        WIN32_FIND_DATAW findData;
        HANDLE hFind = FindFirstFileW((basePath + L"version-*").c_str(), &findData);
        
        if (hFind != INVALID_HANDLE_VALUE) {
            do {
                if (findData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
                    std::wstring exePath = basePath + findData.cFileName + L"\\RobloxPlayerBeta.exe";
                    if (GetFileAttributesW(exePath.c_str()) != INVALID_FILE_ATTRIBUTES) {
                        FindClose(hFind);
                        return exePath;
                    }
                }
            } while (FindNextFileW(hFind, &findData));
            FindClose(hFind);
        }
    }
    return L"";
}

bool LaunchRoblox(const std::wstring& robloxPath) {
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    
    wchar_t cmdLine[MAX_PATH];
    wcscpy_s(cmdLine, robloxPath.c_str());
    
    if (CreateProcessW(
        NULL,
        cmdLine,
        NULL,
        NULL,
        FALSE,
        DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
        NULL,
        NULL,
        &si,
        &pi
    )) {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        return true;
    }
    
    return false;
}

int main(int argc, char* argv[]) {
    // Kill the mutex
    KillRobloxMutex();
    
    // Small delay
    Sleep(100);
    
    // If "launch" argument is provided, also launch Roblox
    if (argc > 1 && std::string(argv[1]) == "launch") {
        std::wstring robloxPath = FindRobloxPath();
        if (!robloxPath.empty()) {
            LaunchRoblox(robloxPath);
        }
    }
    
    return 0;
}

// Compile with:
// g++ mutex_killer.cpp -o mutex_killer.exe -lshlwapi -static -static-libgcc -static-libstdc++
