package com.pad2.filemanager.smb;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
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
    private WpsSaveDetector saveDetector;
    private SaveAsDiscoveryService saveAsDiscoveryService;
    private SaveAsResolutionPrompt saveAsResolutionPrompt;
    private String currentRemotePath;
    private File currentLocalFile;
    private String currentBaselineHash;
    private long currentBaselineMtime;
    private long currentRemoteMtime;
    private String currentSessionUuid;
    private String currentUriScheme;
    private String currentIntentAction;
    private long currentSessionStartTime;
    private String currentLocalFileName;

    public WpsDeliveryHandler(Context context, SmbClient smbClient) {
        this.context = context;
        this.smbClient = smbClient;
        this.cacheService = new StreamCacheService(context, smbClient);
        this.sessionManager = new EditSessionManager(context);
        this.appResolver = new FileAppResolver(context);
        this.saveDetector = new WpsSaveDetector(context);
        this.saveAsDiscoveryService = new SaveAsDiscoveryService();
        this.saveAsResolutionPrompt = new SaveAsResolutionPrompt();
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
        currentSessionStartTime = System.currentTimeMillis();
        currentLocalFileName = localFileName;

        String fileExtension = getFileExtension(localFileName);
        String mimeType = FileAppResolver.getMimeTypeWithSniff(localFileName, localFile);

        if (mimeType == null) {
            Map<String, Object> errResult = new HashMap<>();
            errResult.put("intentLaunched", false);
            errResult.put("error", "文件可能已损坏，无法作为 Word 文档打开");
            errResult.put("errorType", "CORRUPTED_DOCX");
            errResult.put("localPath", localPath);
            errResult.put("baselineHash", baselineHash);
            Log.e(TAG, "Corrupted .docx rejected: " + remotePath);
            return errResult;
        }

        DeliveryStrategy strategy = DeliveryStrategySelector.selectStrategy(
                fileExtension,
                "docx".equalsIgnoreCase(fileExtension) ? DocxContentSniffer.sniff(localFile) : null
        );
        Log.i(TAG, "Delivery strategy: " + strategy);

        if (strategy.getUriScheme() == DeliveryStrategy.UriScheme.REJECT_DELIVERY) {
            Map<String, Object> errResult = new HashMap<>();
            errResult.put("intentLaunched", false);
            errResult.put("error", "文件可能已损坏，无法作为 Word 文档打开");
            errResult.put("errorType", "CORRUPTED_DOCX");
            errResult.put("localPath", localPath);
            errResult.put("baselineHash", baselineHash);
            Log.e(TAG, "Delivery rejected for corrupted .docx: " + remotePath);
            return errResult;
        }

        Uri uri = Uri.fromFile(localFile);
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

        saveDetector.startMonitoring(localFile, baselineHash, baselineMtime);

        Map<String, Object> result = new HashMap<>();
        result.put("localPath", localPath);
        result.put("baselineHash", baselineHash);
        result.put("baselineMtime", baselineMtime);
        result.put("remoteMtime", remoteMtime);
        result.put("fileSize", fileSize);
        result.put("mimeType", mimeType);
        result.put("appName", appInfo.get("appName"));
        result.put("isWps", appInfo.getOrDefault("isWps", false));
        result.put("intentAction", "ACTION_EDIT");
        result.put("streamingUsed", true);
        result.put("cacheElapsedMs", cacheResult.get("elapsedMs"));
        result.put("deliveryStrategy", strategy.getUriScheme().name());

        boolean useContentFirst = strategy.getUriScheme() == DeliveryStrategy.UriScheme.CONTENT_URI_FIRST;
        String intentAction = strategy.getIntentAction().equals("ACTION_VIEW") ? Intent.ACTION_VIEW : Intent.ACTION_EDIT;

        if (useContentFirst) {
            try {
                Uri fpUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", localFile);
                String action = strategy.getIntentAction().equals("ACTION_VIEW") ? Intent.ACTION_VIEW : Intent.ACTION_EDIT;
                Intent intent = new Intent(action);
                intent.setDataAndType(fpUri, mimeType);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                if (appInfo.containsKey("packageName") && (boolean) appInfo.getOrDefault("useExplicitPackage", false)) {
                    intent.setPackage((String) appInfo.get("packageName"));
                }

                context.startActivity(intent);
                result.put("intentLaunched", true);
                result.put("uriScheme", "content");
                result.put("intentAction", action);
                result.put("uri", fpUri.toString());
                currentUriScheme = "content";
                currentIntentAction = action;

                Map<String, Object> sessionMap = sessionManager.createSession(
                        remotePath, localPath, localFileName,
                        baselineHash, baselineMtime, remoteMtime, fileSize,
                        "content", action
                );
                currentSessionUuid = (String) sessionMap.get("sessionId");
                result.put("sessionId", currentSessionUuid);
                result.put("sessionStatus", "open");
                Log.i(TAG, "File delivered via content:// (primary, " + action + "): " + remotePath + " -> " + localPath);
            } catch (Exception e) {
                Log.w(TAG, "content:// delivery failed, falling back to file://", e);
                deliverViaFileUri(localFile, mimeType, appInfo, remotePath, localPath, localFileName,
                        baselineHash, baselineMtime, remoteMtime, fileSize, result, intentAction);
            }
        } else {
            deliverViaFileUri(localFile, mimeType, appInfo, remotePath, localPath, localFileName,
                    baselineHash, baselineMtime, remoteMtime, fileSize, result, intentAction);
        }

        return result;
    }

    private void deliverViaFileUri(File localFile, String mimeType, Map<String, Object> appInfo,
                                   String remotePath, String localPath, String localFileName,
                                   String baselineHash, long baselineMtime, long remoteMtime,
                                   long fileSize, Map<String, Object> result, String intentAction) {
        Uri uri = Uri.fromFile(localFile);
        Intent intent = new Intent(intentAction);
        intent.setDataAndType(uri, mimeType);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (appInfo.containsKey("packageName") && (boolean) appInfo.getOrDefault("useExplicitPackage", false)) {
            intent.setPackage((String) appInfo.get("packageName"));
        }

        try {
            context.startActivity(intent);
            result.put("intentLaunched", true);
            result.put("uriScheme", "file");
            result.put("intentAction", intentAction);
            result.put("uri", uri.toString());
            currentUriScheme = "file";
            currentIntentAction = intentAction;

            Map<String, Object> sessionMap = sessionManager.createSession(
                        remotePath, localPath, localFileName,
                        baselineHash, baselineMtime, remoteMtime, fileSize,
                        "file", intentAction
                );
                currentSessionUuid = (String) sessionMap.get("sessionId");
                result.put("sessionId", currentSessionUuid);
                result.put("sessionStatus", "open");
                Log.i(TAG, "File delivered via file:// (" + intentAction + "): " + remotePath + " -> " + localPath);
        } catch (Exception e) {
            Log.w(TAG, "file:// failed, trying FileProvider", e);
            try {
                Uri fpUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", localFile);
                Intent fpIntent = new Intent(Intent.ACTION_EDIT);
                fpIntent.setDataAndType(fpUri, mimeType);
                fpIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                fpIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                if (appInfo.containsKey("packageName") && (boolean) appInfo.getOrDefault("useExplicitPackage", false)) {
                    fpIntent.setPackage((String) appInfo.get("packageName"));
                }

                context.startActivity(fpIntent);
                result.put("intentLaunched", true);
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
    }

    private static String getFileExtension(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        if (lastDot > 0 && lastDot < fileName.length() - 1) {
            return fileName.substring(lastDot + 1);
        }
        return "";
    }

    public Map<String, Object> checkLocalFileChanged() {
        SaveDetectionResult detectionResult = saveDetector.checkChange();
        Map<String, Object> result = detectionResult.toMap();

        switch (detectionResult.getVerdict()) {
            case SAVE_SUCCESS:
                if (currentSessionUuid != null) {
                    sessionManager.updateStatus(currentSessionUuid, "saved");
                }
                result.put("saveAsFileName", saveDetector.getSaveAsFileName());
                result.put("lastTempFileFiltered", null);
                result.put("eventLog", "");
                break;
            case SAVE_AS_DETECTED:
                result.put("saveAsFileName", saveDetector.getSaveAsFileName());
                result.put("saveAsPrompt", "检测到另存为: " + saveDetector.getSaveAsFileName() + "，请选择回写为新文件或覆盖原文件");
                break;
            case MTIME_FALSE_POSITIVE:
            case DETECTION_UNCERTAIN:
            case TEMP_FILE_FILTERED:
            case SAVE_FAILED:
                break;
        }

        return result;
    }

    public Map<String, Object> foregroundCheck() {
        Log.i(TAG, "Foreground check for missed events");
        SaveDetectionResult detectionResult = saveDetector.foregroundCheck();
        Map<String, Object> result = detectionResult.toMap();

        switch (detectionResult.getVerdict()) {
            case SAVE_SUCCESS:
                if (currentSessionUuid != null) {
                    sessionManager.updateStatus(currentSessionUuid, "saved");
                }
                break;
            case SAVE_AS_DETECTED:
                result.put("saveAsFileName", saveDetector.getSaveAsFileName());
                triggerSaveAsDiscovery(result);
                break;
            case DETECTION_UNCERTAIN:
                triggerSaveAsDiscovery(result);
                break;
            default:
                break;
        }

        return result;
    }

    private void triggerSaveAsDiscovery(Map<String, Object> result) {
        if (currentLocalFileName == null) return;

        long endTime = System.currentTimeMillis();
        EditSessionContext sessionCtx = new EditSessionContext(
                currentLocalFileName, currentSessionStartTime, endTime);

        java.util.List<File> saveAsFiles = saveAsDiscoveryService.discoverSaveAs(sessionCtx);

        if (!saveAsFiles.isEmpty()) {
            File saveAsFile = saveAsFiles.get(0);
            Map<String, Object> promptData = saveAsResolutionPrompt.prompt(saveAsFile, currentLocalFileName);
            result.put("saveAsPrompt", promptData.get("message"));
            result.put("saveAsDiscovered", true);
            result.put("saveAsFilePath", saveAsFile.getAbsolutePath());
            result.put("saveAsChoices", promptData.get("choices"));
            result.put("formatChange", promptData.getOrDefault("formatChange", false));
            Log.i(TAG, "Save-as discovered: " + saveAsFile.getAbsolutePath());
        } else {
            Map<String, Object> promptData = saveAsResolutionPrompt.prompt(null, currentLocalFileName);
            result.put("saveAsPrompt", promptData.get("message"));
            result.put("saveAsDiscovered", false);
            result.put("saveAsChoices", promptData.get("choices"));
            Log.i(TAG, "Save-as not auto-discovered, prompting manual select");
        }
    }

    public Map<String, Object> resolveSaveAs(String choice, String saveAsFilePath) throws IOException {
        Map<String, Object> result = new HashMap<>();
        SaveAsDecision.SaveAsChoice saveAsChoice;

        try {
            saveAsChoice = SaveAsDecision.SaveAsChoice.valueOf(choice);
        } catch (IllegalArgumentException e) {
            result.put("error", "Invalid choice: " + choice);
            return result;
        }

        result.put("choice", choice);
        result.put("saveAsFilePath", saveAsFilePath);

        switch (saveAsChoice) {
            case WRITE_AS_NEW:
                if (saveAsFilePath != null) {
                    File saveAsFile = new File(saveAsFilePath);
                    String newRemotePath = currentRemotePath != null ?
                            currentRemotePath.substring(0, currentRemotePath.lastIndexOf('/') + 1) + saveAsFile.getName() :
                            "/" + saveAsFile.getName();
                    byte[] data = readFileBytes(saveAsFile);
                    smbClient.writeFileSafe(newRemotePath, data);
                    result.put("writebackSuccess", true);
                    result.put("newRemotePath", newRemotePath);
                    Log.i(TAG, "Save-as resolved: WRITE_AS_NEW to " + newRemotePath);
                }
                break;
            case OVERWRITE_ORIGINAL:
                if (saveAsFilePath != null) {
                    File saveAsFile = new File(saveAsFilePath);
                    byte[] data = readFileBytes(saveAsFile);
                    smbClient.writeFileSafe(currentRemotePath, data);
                    String verifyHash = StreamCacheService.calculateSHA256FromStream(smbClient.readFileStream(currentRemotePath));
                    String localHash = StreamCacheService.calculateSHA256(saveAsFile);
                    result.put("writebackSuccess", verifyHash.equals(localHash));
                    Log.i(TAG, "Save-as resolved: OVERWRITE_ORIGINAL, verified=" + verifyHash.equals(localHash));
                }
                break;
            case DISCARD:
                result.put("writebackSuccess", false);
                result.put("discarded", true);
                Log.i(TAG, "Save-as resolved: DISCARD");
                break;
        }

        return result;
    }

    public Map<String, Object> writeback() throws IOException {
        Map<String, Object> result = new HashMap<>();
        if (currentLocalFile == null || currentRemotePath == null) {
            result.put("error", "No file to writeback");
            return result;
        }

        saveDetector.pause();

        try {
            String localHash = StreamCacheService.calculateSHA256(currentLocalFile);

            Map<String, Object> remoteAttrs = smbClient.getFileAttributes(currentRemotePath);
            long remoteMtime = (long) remoteAttrs.get("lastWriteTime");

            byte[] localData = readFileBytes(currentLocalFile);
            smbClient.writeFileSafe(currentRemotePath, localData);

            String verifyHash = StreamCacheService.calculateSHA256FromStream(smbClient.readFileStream(currentRemotePath));

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
                    Log.i(TAG, "Writeback verified: remote SHA-256 matches local");
                } else {
                    sessionManager.failSession(currentSessionUuid);
                    Log.e(TAG, "Writeback verification FAILED: remote SHA-256 != local SHA-256");
                }
            }

            saveDetector.updateBaseline(localHash, currentBaselineMtime);
        } finally {
            saveDetector.resume();
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
        saveDetector.stopMonitoring();
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
