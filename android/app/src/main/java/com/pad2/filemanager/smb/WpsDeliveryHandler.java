package com.pad2.filemanager.smb;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.FileObserver;
import android.util.Log;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

public class WpsDeliveryHandler {

    private static final String TAG = "WpsDeliveryHandler";

    private Context context;
    private SmbClient smbClient;
    private StreamCacheService cacheService;
    private EditSessionManager sessionManager;
    private FileAppResolver appResolver;
    private FileObserver fileObserver;
    private FileObserver dirObserver;
    private volatile boolean observerDetectedChange = false;
    private volatile String observerEventLog = "";
    private String currentRemotePath;
    private File currentLocalFile;
    private String currentBaselineHash;
    private long currentBaselineMtime;
    private long currentRemoteMtime;
    private String currentSessionUuid;
    private String currentUriScheme;
    private String currentIntentAction;

    public WpsDeliveryHandler(Context context, SmbClient smbClient) {
        this.context = context;
        this.smbClient = smbClient;
        this.cacheService = new StreamCacheService(context, smbClient);
        this.sessionManager = new EditSessionManager(context);
        this.appResolver = new FileAppResolver(context);
    }

    public Map<String, Object> openFileInWps(String remotePath) throws IOException {
        Log.i(TAG, "Opening file in WPS: " + remotePath);

        long remoteFileSize = smbClient.getFileSize(remotePath);
        Log.i(TAG, "Remote file size: " + remoteFileSize + " bytes");

        if (!cacheService.checkCacheSpace(remoteFileSize)) {
            Map<String, Object> errResult = new HashMap<>();
            errResult.put("intentLaunched", false);
            errResult.put("error", "缓存空间不足，无法缓存文件 (" + remoteFileSize + " bytes)");
            errResult.put("errorType", "INSUFFICIENT_SPACE");
            Log.e(TAG, "Insufficient cache space for " + remotePath);
            return errResult;
        }

        Map<String, Object> cacheResult = cacheService.streamToCache(remotePath);
        String localPath = (String) cacheResult.get("localPath");
        String baselineHash = (String) cacheResult.get("sha256");
        long fileSize = (long) cacheResult.get("size");
        File localFile = new File(localPath);
        String localFileName = localFile.getName();
        long baselineMtime = localFile.lastModified();

        Map<String, Object> remoteAttrs = smbClient.getFileAttributes(remotePath);
        long remoteMtime = (long) remoteAttrs.get("lastWriteTime");

        currentRemotePath = remotePath;
        currentLocalFile = localFile;
        currentBaselineHash = baselineHash;
        currentBaselineMtime = baselineMtime;
        currentRemoteMtime = remoteMtime;

        Uri uri = Uri.fromFile(localFile);
        String mimeType = FileAppResolver.getMimeType(localFileName);

        Map<String, Object> appInfo = appResolver.resolveApp(localFileName, uri);
        boolean appResolved = (boolean) appInfo.get("resolved");

        if (!appResolved) {
            Map<String, Object> errResult = new HashMap<>();
            errResult.put("intentLaunched", false);
            errResult.put("error", appInfo.get("suggestion"));
            errResult.put("errorType", "NO_APP");
            errResult.put("mimeType", mimeType);
            errResult.put("localPath", localPath);
            errResult.put("baselineHash", baselineHash);
            Log.e(TAG, "No app found for " + mimeType);
            return errResult;
        }

        Intent intent = new Intent(Intent.ACTION_EDIT);
        intent.setDataAndType(uri, mimeType);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (appInfo.containsKey("packageName") && (boolean) appInfo.getOrDefault("useExplicitPackage", false)) {
            intent.setPackage((String) appInfo.get("packageName"));
        }

        startFileObserver(localFile);

        Map<String, Object> result = new HashMap<>();
        result.put("uri", uri.toString());
        result.put("localPath", localPath);
        result.put("baselineHash", baselineHash);
        result.put("baselineMtime", baselineMtime);
        result.put("remoteMtime", remoteMtime);
        result.put("fileSize", fileSize);
        result.put("mimeType", mimeType);
        result.put("appName", appInfo.get("appName"));
        result.put("isWps", appInfo.getOrDefault("isWps", false));
        result.put("intentAction", "ACTION_EDIT");
        result.put("uriScheme", "file");
        result.put("streamingUsed", true);
        result.put("cacheElapsedMs", cacheResult.get("elapsedMs"));

        currentUriScheme = "file";
        currentIntentAction = "ACTION_EDIT";

        try {
            context.startActivity(intent);
            result.put("intentLaunched", true);

            Map<String, Object> sessionMap = sessionManager.createSession(
                    remotePath, localPath, localFileName,
                    baselineHash, baselineMtime, remoteMtime, fileSize,
                    "file", "ACTION_EDIT"
            );
            currentSessionUuid = (String) sessionMap.get("sessionId");
            result.put("sessionId", currentSessionUuid);
            result.put("sessionStatus", "open");

            Log.i(TAG, "File delivered successfully: " + remotePath + " -> " + localPath);
        } catch (Exception e) {
            Log.w(TAG, "file:// ACTION_EDIT failed, trying FileProvider", e);
            try {
                Uri fpUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", localFile);
                Intent fpIntent = new Intent(Intent.ACTION_EDIT);
                fpIntent.setDataAndType(fpUri, mimeType);
                fpIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                fpIntent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                fpIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                if (appInfo.containsKey("packageName") && (boolean) appInfo.getOrDefault("useExplicitPackage", false)) {
                    fpIntent.setPackage((String) appInfo.get("packageName"));
                }

                context.startActivity(fpIntent);
                result.put("intentLaunched", true);
                result.put("intentAction", "ACTION_EDIT");
                result.put("uriScheme", "content");
                result.put("uri", fpUri.toString());
                currentUriScheme = "content";

                Map<String, Object> sessionMap = sessionManager.createSession(
                        remotePath, localPath, localFileName,
                        baselineHash, baselineMtime, remoteMtime, fileSize,
                        "content", "ACTION_EDIT"
                );
                currentSessionUuid = (String) sessionMap.get("sessionId");
                result.put("sessionId", currentSessionUuid);
                result.put("sessionStatus", "open");

                Log.i(TAG, "File delivered via FileProvider fallback: " + remotePath);
            } catch (Exception e2) {
                Log.e(TAG, "Failed to launch WPS", e2);
                result.put("intentLaunched", false);
                result.put("error", e2.getMessage());
                result.put("errorType", "LAUNCH_FAILED");
                result.put("fallbackTried", true);
            }
        }

        return result;
    }

    private void startFileObserver(File file) {
        if (fileObserver != null) {
            fileObserver.stopWatching();
        }
        if (dirObserver != null) {
            dirObserver.stopWatching();
        }
        observerDetectedChange = false;
        observerEventLog = "";

        fileObserver = new FileObserver(file, FileObserver.MODIFY | FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO) {
            @Override
            public void onEvent(int event, String path) {
                String msg = "FileObserver event: " + event + " path: " + path;
                Log.i(TAG, msg);
                observerDetectedChange = true;
                observerEventLog += msg + "; ";
            }
        };
        fileObserver.startWatching();

        File cacheDir = file.getParentFile();
        if (cacheDir != null) {
            dirObserver = new FileObserver(cacheDir, FileObserver.MODIFY | FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO | FileObserver.CREATE) {
                @Override
                public void onEvent(int event, String path) {
                    String msg = "DirObserver event: " + event + " path: " + path;
                    Log.i(TAG, msg);
                    observerEventLog += msg + "; ";
                    if (path != null && !path.equals(file.getName())) {
                        observerDetectedChange = true;
                    }
                }
            };
            dirObserver.startWatching();
        }
    }

    public Map<String, Object> checkLocalFileChanged() {
        Map<String, Object> result = new HashMap<>();
        if (currentLocalFile == null) {
            result.put("error", "No file opened");
            return result;
        }
        long currentMtime = currentLocalFile.lastModified();
        boolean changed = currentMtime != currentBaselineMtime;
        result.put("changed", changed);
        result.put("currentMtime", currentMtime);
        result.put("baselineMtime", currentBaselineMtime);
        result.put("observerDetectedChange", observerDetectedChange);
        result.put("observerEventLog", observerEventLog);
        if (changed) {
            try {
                String newHash = StreamCacheService.calculateSHA256(currentLocalFile);
                result.put("newHash", newHash);
                result.put("baselineHash", currentBaselineHash);
                result.put("contentChanged", !newHash.equals(currentBaselineHash));
            } catch (Exception e) {
                result.put("error", "Failed to calculate hash: " + e.getMessage());
            }
        }
        return result;
    }

    public Map<String, Object> writeback() throws IOException {
        Map<String, Object> result = new HashMap<>();
        if (currentLocalFile == null || currentRemotePath == null) {
            result.put("error", "No file to writeback");
            return result;
        }

        if (fileObserver != null) fileObserver.stopWatching();
        if (dirObserver != null) dirObserver.stopWatching();

        try {
            String localHash = StreamCacheService.calculateSHA256(currentLocalFile);

            Map<String, Object> remoteAttrs = smbClient.getFileAttributes(currentRemotePath);
            long remoteMtime = (long) remoteAttrs.get("lastWriteTime");

            byte[] localData = readFileBytes(currentLocalFile);
            smbClient.writeFileSafe(currentRemotePath, localData);

            byte[] verifyData = smbClient.readFile(currentRemotePath);
            String verifyHash = StreamCacheService.calculateSHA256(currentLocalFile);

            result.put("writebackSuccess", verifyHash.equals(localHash));
            result.put("localHash", localHash);
            result.put("verifyHash", verifyHash);
            result.put("remoteMtimeBefore", remoteMtime);
            result.put("remoteMtimeAfter", System.currentTimeMillis());

            currentBaselineHash = localHash;
            currentBaselineMtime = currentLocalFile.lastModified();
            currentRemoteMtime = remoteMtime;

            if (currentSessionUuid != null) {
                if (verifyHash.equals(localHash)) {
                    sessionManager.updateStatus(currentSessionUuid, "writeback");
                    sessionManager.updateBaseline(currentSessionUuid, localHash, currentBaselineMtime);
                } else {
                    sessionManager.failSession(currentSessionUuid);
                }
            }
        } finally {
            if (fileObserver != null) fileObserver.startWatching();
            if (dirObserver != null) dirObserver.startWatching();
        }

        return result;
    }

    public Map<String, Object> checkRemoteChanged() throws IOException {
        Map<String, Object> result = new HashMap<>();
        if (currentRemotePath == null) {
            result.put("error", "No file opened");
            return result;
        }
        Map<String, Object> attrs = smbClient.getFileAttributes(currentRemotePath);
        long remoteMtime = (long) attrs.get("lastWriteTime");
        result.put("remoteMtime", remoteMtime);
        result.put("baselineMtime", currentRemoteMtime);
        result.put("remoteChanged", remoteMtime != currentRemoteMtime);
        return result;
    }

    public Map<String, Object> getSessionInfo() {
        Map<String, Object> result = new HashMap<>();
        if (currentSessionUuid != null) {
            EditSessionEntity entity = sessionManager.getSessionByUuid(currentSessionUuid);
            if (entity != null) {
                result = EditSessionManager.entityToMap(entity);
            }
        }
        result.put("openSessions", sessionManager.countOpenSessions());
        return result;
    }

    public void cleanup() {
        if (fileObserver != null) {
            fileObserver.stopWatching();
            fileObserver = null;
        }
        if (dirObserver != null) {
            dirObserver.stopWatching();
            dirObserver = null;
        }
        if (currentLocalFile != null && currentLocalFile.exists()) {
            currentLocalFile.delete();
        }
        if (currentSessionUuid != null) {
            sessionManager.closeSession(currentSessionUuid);
        }
        currentLocalFile = null;
        currentRemotePath = null;
        currentBaselineHash = null;
        currentSessionUuid = null;
    }

    private byte[] readFileBytes(File file) throws IOException {
        java.io.FileInputStream fis = new java.io.FileInputStream(file);
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int len;
        while ((len = fis.read(buffer)) != -1) {
            baos.write(buffer, 0, len);
        }
        fis.close();
        return baos.toByteArray();
    }
}
