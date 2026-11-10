package com.pad2.filemanager.smb;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Map;

import android.content.Intent;
import android.os.Environment;
import android.util.Log;

@CapacitorPlugin(name = "SmbPlugin")
public class SmbPlugin extends Plugin {

    private SmbClient smbClient;
    private WpsDeliveryHandler wpsHandler;
    private JSObject pendingShortcutEvent = null;
    private boolean shortcutListenerReady = false;

    @Override
    public void load() {
        smbClient = new SmbClient();
        wpsHandler = new WpsDeliveryHandler(getContext(), smbClient);
        handleShortcutIntent(getActivity().getIntent());
    }

    public void handleShortcutIntent(Intent intent) {
        if (intent == null || !intent.hasExtra("shortcut_profile_id")) return;
        String profileId = intent.getStringExtra("shortcut_profile_id");
        String path = intent.getStringExtra("shortcut_path");
        String sourceType = intent.getStringExtra("shortcut_source_type");
        if (path == null || path.isEmpty()) return;
        JSObject params = new JSObject();
        params.put("profileId", profileId != null ? profileId : "");
        params.put("path", path);
        if (sourceType != null && !sourceType.isEmpty()) {
            params.put("sourceType", sourceType);
        }
        Log.i("SmbPlugin", "handleShortcutIntent: sourceType=" + sourceType + " path=" + path + " profileId=" + profileId);
        if (shortcutListenerReady) {
            notifyListeners("shortcutLaunched", params);
        } else {
            pendingShortcutEvent = params;
        }
    }

    @PluginMethod
    public void notifyShortcutListenerReady(PluginCall call) {
        shortcutListenerReady = true;
        if (pendingShortcutEvent != null) {
            notifyListeners("shortcutLaunched", pendingShortcutEvent);
            pendingShortcutEvent = null;
        }
        call.resolve();
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host", "");
        String share = call.getString("share", "");
        String username = call.getString("username", "");
        String password = call.getString("password", "");
        String domain = call.getString("domain", "");

        try {
            smbClient.connect(host, share, username, password, domain);
            JSObject result = new JSObject();
            result.put("connected", true);
            result.put("host", host);
            result.put("share", share);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Connection failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        smbClient.disconnect();
        call.resolve();
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", smbClient.isConnected());
        call.resolve(result);
    }

    @PluginMethod
    public void listDirectory(PluginCall call) {
        String path = call.getString("path", "");
        try {
            List<Map<String, Object>> entries = smbClient.listDirectory(path);
            JSArray files = new JSArray();
            for (Map<String, Object> entry : entries) {
                JSObject fileObj = new JSObject();
                fileObj.put("name", entry.get("name"));
                fileObj.put("isDirectory", entry.get("isDirectory"));
                fileObj.put("size", entry.get("size"));
                fileObj.put("lastModified", entry.get("lastModified"));
                fileObj.put("path", entry.get("path"));
                files.put(fileObj);
            }
            JSObject result = new JSObject();
            result.put("files", files);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("List directory failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openInWps(PluginCall call) {
        String path = call.getString("path", "");
        try {
            Map<String, Object> result = wpsHandler.openFileInWps(path);
            JSObject ret = new JSObject();
            for (Map.Entry<String, Object> entry : result.entrySet()) {
                ret.put(entry.getKey(), entry.getValue());
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Open in WPS failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkLocalFileChanged(PluginCall call) {
        Map<String, Object> result = wpsHandler.checkLocalFileChanged();
        JSObject ret = new JSObject();
        for (Map.Entry<String, Object> entry : result.entrySet()) {
            ret.put(entry.getKey(), entry.getValue());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void foregroundCheck(PluginCall call) {
        Map<String, Object> result = wpsHandler.foregroundCheck();
        JSObject ret = new JSObject();
        for (Map.Entry<String, Object> entry : result.entrySet()) {
            ret.put(entry.getKey(), entry.getValue());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void writeback(PluginCall call) {
        try {
            Map<String, Object> result = wpsHandler.writeback();
            JSObject ret = new JSObject();
            for (Map.Entry<String, Object> entry : result.entrySet()) {
                ret.put(entry.getKey(), entry.getValue());
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Writeback failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkRemoteChanged(PluginCall call) {
        try {
            Map<String, Object> result = wpsHandler.checkRemoteChanged();
            JSObject ret = new JSObject();
            for (Map.Entry<String, Object> entry : result.entrySet()) {
                ret.put(entry.getKey(), entry.getValue());
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Check remote changed failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getFileAttributes(PluginCall call) {
        String path = call.getString("path", "");
        try {
            Map<String, Object> attrs = smbClient.getFileAttributes(path);
            JSObject ret = new JSObject();
            for (Map.Entry<String, Object> entry : attrs.entrySet()) {
                ret.put(entry.getKey(), entry.getValue());
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Get file attributes failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        wpsHandler.cleanup();
        call.resolve();
    }

    @PluginMethod
    public void resolveSaveAs(PluginCall call) {
        String choice = call.getString("choice", "DISCARD");
        String saveAsFilePath = call.getString("saveAsFilePath", "");
        try {
            Map<String, Object> result = wpsHandler.resolveSaveAs(choice, saveAsFilePath);
            JSObject ret = new JSObject();
            for (Map.Entry<String, Object> entry : result.entrySet()) {
                ret.put(entry.getKey(), entry.getValue());
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Resolve save-as failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getSessionInfo(PluginCall call) {
        Map<String, Object> result = wpsHandler.getSessionInfo();
        JSObject ret = new JSObject();
        for (Map.Entry<String, Object> entry : result.entrySet()) {
            ret.put(entry.getKey(), entry.getValue());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void isWpsInstalled(PluginCall call) {
        FileAppResolver resolver = new FileAppResolver(getContext());
        JSObject ret = new JSObject();
        ret.put("installed", resolver.isWpsInstalled());
        ret.put("packageName", resolver.getWpsPackageName());
        call.resolve(ret);
    }

    @PluginMethod
    public void writeTextFile(PluginCall call) {
        String path = call.getString("path", "");
        String content = call.getString("content", "");
        try {
            smbClient.writeTextFile(path, content);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", path);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Write text file failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void ensureDirectory(PluginCall call) {
        String path = call.getString("path", "");
        try {
            if (!smbClient.directoryExists(path)) {
                smbClient.createDirectory(path);
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", path);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Ensure directory failed: " + e.getMessage());
        }
    }

    // ===== TASK-S5-03：复制与移动桥接（s5-02 设计 §B-1；conflict 走 reject 传播，
    // 前端 smbErrorMapper 归 conflict 类 → ConflictDialog 决策/失败清单）=====

    @PluginMethod
    public void copyFile(PluginCall call) {
        String sourcePath = call.getString("sourcePath", "");
        String destinationDir = call.getString("destinationDir", "");
        String destFileName = call.getString("destFileName");
        Boolean overwrite = call.getBoolean("overwrite", false);
        try {
            Map<String, Object> result = smbClient.copyFile(sourcePath, destinationDir, destFileName, overwrite);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("bytesCopied", result.get("bytesCopied"));
            ret.put("sha256", result.get("sha256"));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Copy file failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void moveFile(PluginCall call) {
        String sourcePath = call.getString("sourcePath", "");
        String destinationDir = call.getString("destinationDir", "");
        String destFileName = call.getString("destFileName");
        Boolean overwrite = call.getBoolean("overwrite", false);
        try {
            Map<String, Object> result = smbClient.moveFile(sourcePath, destinationDir, destFileName, overwrite);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("bytesCopied", result.get("bytesCopied"));
            ret.put("sha256", result.get("sha256"));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Move file failed: " + e.getMessage());
        }
    }


    // ===== TASK-S5-04-R：远端重命名桥接（s5-04 设计方案 A；COLLISION 走 reject
    // 传播→前端 conflict 类→RenameDialog 内联/失败清单，与 copyFile 同语义）=====
    @PluginMethod
    public void renameFile(PluginCall call) {
        String path = call.getString("path", "");
        String newName = call.getString("newName", "");
        try {
            smbClient.renameFile(path, newName);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
             call.reject("Rename file failed: " + e.getMessage());
         }
     }

    // ===== TASK-S5-05：远端单文件删除桥接（s5-02 设计 §E；目录拒绝/不存在明确失败/
    // 删除后核验走 reject 传播——前端 mapSmbError 分类呈现）=====
    @PluginMethod
    public void deleteRemoteFile(PluginCall call) {
        String path = call.getString("path", "");
        try {
            smbClient.deleteRemoteFile(path);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Delete remote file failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void exportLog(PluginCall call) {
        String logDir = call.getString("logDir", "apk/log");
        String content = call.getString("content", "");
        String fileName = call.getString("fileName", "");
        try {
            if (!smbClient.directoryExists(logDir)) {
                smbClient.createDirectory(logDir);
            }
            String fullPath = logDir + "/" + fileName;
            smbClient.writeTextFile(fullPath, content);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", fullPath);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Export log failed: " + e.getMessage());
        }
    }

    // ===== TASK-LSO-07：本地文件上传到 SMB（流式读写+SHA-256 校验）=====
    // 冻结区边界：仅新增 @PluginMethod，既有方法零变更，SmbClient.java 零修改（仅复用 writeFileSafe）
    // R-1 风险：大文件全量加载 byte[]（SmbClient.writeFileSafe 签名约束），超 100MB 建议分片
    @PluginMethod
    public void uploadFromLocal(PluginCall call) {
        String localAbsolutePath = call.getString("localAbsolutePath", "");
        String destinationDir = call.getString("destinationDir", "");
        String destFileName = call.getString("destFileName");
        Boolean overwrite = call.getBoolean("overwrite", false);

        if (localAbsolutePath.isEmpty()) {
            call.reject("localAbsolutePath is required");
            return;
        }

        try {
            File localFile = new File(localAbsolutePath);
            if (!localFile.exists() || !localFile.isFile()) {
                call.reject("Local file not found: " + localAbsolutePath);
                return;
            }

            String targetName = (destFileName != null && !destFileName.isEmpty())
                ? destFileName : localFile.getName();
            String targetPath = destinationDir.isEmpty()
                ? targetName : destinationDir + "\\" + targetName;

            if (!overwrite && smbClient.directoryExists(targetPath)) {
                call.reject("Target already exists: " + targetPath);
                return;
            }

            byte[] data = readFileBytes(localFile);
            String sha256 = computeSha256(data);

            smbClient.writeFileSafe(targetPath, data);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("bytesCopied", data.length);
            ret.put("sha256", sha256);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Upload from local failed: " + e.getMessage());
        }
    }

    // ===== TASK-LSO-08：本地文件夹递归上传到 SMB（聚合 failures 清单）=====
    // 冻结区边界：仅新增 @PluginMethod，既有方法零变更
    // R-2 风险：深目录递归，限制 32 层
    @PluginMethod
    public void uploadDirectoryFromLocal(PluginCall call) {
        String localAbsolutePath = call.getString("localAbsolutePath", "");
        String destinationDir = call.getString("destinationDir", "");
        Boolean overwrite = call.getBoolean("overwrite", false);

        if (localAbsolutePath.isEmpty()) {
            call.reject("localAbsolutePath is required");
            return;
        }

        try {
            File localDir = new File(localAbsolutePath);
            if (!localDir.exists() || !localDir.isDirectory()) {
                call.reject("Local directory not found: " + localAbsolutePath);
                return;
            }

            String targetDirName = localDir.getName();
            String targetPath = destinationDir.isEmpty()
                ? targetDirName : destinationDir + "\\" + targetDirName;

            if (!smbClient.directoryExists(targetPath)) {
                smbClient.createDirectory(targetPath);
            }

            JSArray failures = new JSArray();
            int[] counters = new int[2]; // [totalFiles, totalBytes]
            uploadDirectoryRecursive(localDir, targetPath, overwrite, failures, counters, 0);

            JSObject ret = new JSObject();
            ret.put("success", failures.length() == 0);
            ret.put("totalFiles", counters[0]);
            ret.put("totalBytes", counters[1]);
            ret.put("failures", failures);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Upload directory from local failed: " + e.getMessage());
        }
    }

    private void uploadDirectoryRecursive(File localDir, String smbTargetDir,
            Boolean overwrite, JSArray failures, int[] counters, int depth) throws IOException {
        if (depth > 32) {
            JSObject failure = new JSObject();
            failure.put("path", localDir.getAbsolutePath());
            failure.put("reason", "递归深度超限（>32 层）");
            failures.put(failure);
            return;
        }

        File[] children = localDir.listFiles();
        if (children == null) return;

        for (File child : children) {
            if (child.isDirectory()) {
                String childSmbPath = smbTargetDir + "\\" + child.getName();
                try {
                    if (!smbClient.directoryExists(childSmbPath)) {
                        smbClient.createDirectory(childSmbPath);
                    }
                    uploadDirectoryRecursive(child, childSmbPath, overwrite, failures, counters, depth + 1);
                } catch (Exception e) {
                    JSObject failure = new JSObject();
                    failure.put("path", child.getAbsolutePath());
                    failure.put("reason", e.getMessage());
                    failures.put(failure);
                }
            } else {
                try {
                    byte[] data = readFileBytes(child);
                    String smbFilePath = smbTargetDir + "\\" + child.getName();
                    if (!overwrite && smbClient.directoryExists(smbFilePath)) {
                        JSObject failure = new JSObject();
                        failure.put("path", child.getAbsolutePath());
                        failure.put("reason", "Target already exists: " + smbFilePath);
                        failures.put(failure);
                        continue;
                    }
                    smbClient.writeFileSafe(smbFilePath, data);
                    counters[0] += 1;
                    counters[1] += data.length;
                } catch (Exception e) {
                    JSObject failure = new JSObject();
                    failure.put("path", child.getAbsolutePath());
                    failure.put("reason", e.getMessage());
                    failures.put(failure);
                }
            }
        }
    }

    // ===== TASK-S2L-NATIVE-01：SMB→本地单文件下载（流式读写+SHA-256 校验）=====
    @PluginMethod
    public void downloadFileToLocal(PluginCall call) {
        String sourcePath = call.getString("sourcePath", "");
        String destinationDir = call.getString("destinationDir", "");
        String destFileName = call.getString("destFileName");
        Boolean overwrite = call.getBoolean("overwrite", false);

        if (sourcePath.isEmpty()) {
            call.reject("sourcePath is required");
            return;
        }

        try {
            String srcNormalized = sourcePath.replace("/", "\\");
            String targetName = (destFileName != null && !destFileName.isEmpty())
                ? destFileName
                : srcNormalized.substring(srcNormalized.lastIndexOf('\\') + 1);

            File localDir = new File(Environment.getExternalStorageDirectory(), destinationDir);
            if (!localDir.exists()) localDir.mkdirs();
            File localFile = new File(localDir, targetName);

            if (!overwrite && localFile.exists()) {
                call.reject("Target already exists: " + localFile.getAbsolutePath());
                return;
            }

            InputStream is = smbClient.readFileStream(sourcePath);
            long bytesCopied = 0;
            try {
                FileOutputStream fos = new FileOutputStream(localFile);
                byte[] buf = new byte[64 * 1024];
                int n;
                try {
                    while ((n = is.read(buf)) >= 0) {
                        fos.write(buf, 0, n);
                        bytesCopied += n;
                    }
                    fos.flush();
                } finally {
                    fos.close();
                }
            } finally {
                is.close();
            }

            byte[] localData = readFileBytes(localFile);
            String sha256 = computeSha256(localData);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("bytesCopied", bytesCopied);
            ret.put("sha256", sha256);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Download file to local failed: " + e.getMessage());
        }
    }

    // ===== TASK-S2L-NATIVE-02：SMB→本地文件夹递归下载（聚合 failures 清单）=====
    @PluginMethod
    public void downloadDirectoryToLocal(PluginCall call) {
        String sourcePath = call.getString("sourcePath", "");
        String destinationDir = call.getString("destinationDir", "");
        Boolean overwrite = call.getBoolean("overwrite", false);

        if (sourcePath.isEmpty()) {
            call.reject("sourcePath is required");
            return;
        }

        try {
            String srcNormalized = sourcePath.replace("/", "\\");
            int lastSep = srcNormalized.lastIndexOf('\\');
            String folderName = lastSep >= 0 ? srcNormalized.substring(lastSep + 1) : srcNormalized;

            File localRoot = new File(Environment.getExternalStorageDirectory(), destinationDir + "/" + folderName);
            if (!overwrite && localRoot.exists()) {
                call.reject("Target already exists: " + localRoot.getAbsolutePath());
                return;
            }
            localRoot.mkdirs();

            JSArray failures = new JSArray();
            int[] counters = new int[2];
            downloadDirectoryRecursive(sourcePath, localRoot, overwrite, failures, counters, 0);

            JSObject ret = new JSObject();
            ret.put("success", failures.length() == 0);
            ret.put("totalFiles", counters[0]);
            ret.put("totalBytes", counters[1]);
            ret.put("failures", failures);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Download directory to local failed: " + e.getMessage());
        }
    }

    private void downloadDirectoryRecursive(String smbSource, File localTarget,
            Boolean overwrite, JSArray failures, int[] counters, int depth) throws IOException {
        if (depth > 32) {
            JSObject failure = new JSObject();
            failure.put("path", smbSource);
            failure.put("reason", "递归深度超限（>32 层）");
            failures.put(failure);
            return;
        }

        List<Map<String, Object>> children = smbClient.listDirectory(smbSource);
        for (Map<String, Object> child : children) {
            String childName = (String) child.get("name");
            boolean isDir = (Boolean) child.get("isDirectory");
            String childSmbPath = (String) child.get("path");

            if (isDir) {
                File childLocal = new File(localTarget, childName);
                try {
                    if (!childLocal.exists()) childLocal.mkdirs();
                    downloadDirectoryRecursive(childSmbPath, childLocal, overwrite, failures, counters, depth + 1);
                } catch (Exception e) {
                    JSObject failure = new JSObject();
                    failure.put("path", childSmbPath);
                    failure.put("reason", e.getMessage());
                    failures.put(failure);
                }
            } else {
                try {
                    File childLocal = new File(localTarget, childName);
                    if (!overwrite && childLocal.exists()) {
                        JSObject failure = new JSObject();
                        failure.put("path", childSmbPath);
                        failure.put("reason", "Target already exists: " + childLocal.getAbsolutePath());
                        failures.put(failure);
                        continue;
                    }
                    InputStream is = smbClient.readFileStream(childSmbPath);
                    long bytes = 0;
                    try {
                        FileOutputStream fos = new FileOutputStream(childLocal);
                        byte[] buf = new byte[64 * 1024];
                        int n;
                        try {
                            while ((n = is.read(buf)) >= 0) {
                                fos.write(buf, 0, n);
                                bytes += n;
                            }
                            fos.flush();
                        } finally {
                            fos.close();
                        }
                    } finally {
                        is.close();
                    }
                    counters[0] += 1;
                    counters[1] += bytes;
                } catch (Exception e) {
                    JSObject failure = new JSObject();
                    failure.put("path", childSmbPath);
                    failure.put("reason", e.getMessage());
                    failures.put(failure);
                }
            }
        }
    }

    // ===== TASK-S2L-NATIVE-03：SMB 远端递归删除文件夹（移动删源用）=====
    @PluginMethod
    public void deleteRemoteDirectory(PluginCall call) {
        String path = call.getString("path", "");
        if (path.isEmpty()) {
            call.reject("path is required");
            return;
        }

        try {
            JSArray failures = new JSArray();
            deleteRemoteDirectoryRecursive(path, failures, 0);

            try {
                smbClient.deleteFile(path);
            } catch (Exception e) {
                JSObject failure = new JSObject();
                failure.put("path", path);
                failure.put("reason", e.getMessage());
                failures.put(failure);
            }

            JSObject ret = new JSObject();
            ret.put("success", failures.length() == 0);
            ret.put("failures", failures);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Delete remote directory failed: " + e.getMessage());
        }
    }

    private void deleteRemoteDirectoryRecursive(String smbPath, JSArray failures, int depth) throws IOException {
        if (depth > 32) {
            JSObject failure = new JSObject();
            failure.put("path", smbPath);
            failure.put("reason", "递归深度超限（>32 层）");
            failures.put(failure);
            return;
        }

        List<Map<String, Object>> children = smbClient.listDirectory(smbPath);
        for (Map<String, Object> child : children) {
            boolean isDir = (Boolean) child.get("isDirectory");
            String childPath = (String) child.get("path");

            try {
                if (isDir) {
                    deleteRemoteDirectoryRecursive(childPath, failures, depth + 1);
                    smbClient.deleteFile(childPath);
                } else {
                    smbClient.deleteFile(childPath);
                }
            } catch (Exception e) {
                JSObject failure = new JSObject();
                failure.put("path", childPath);
                failure.put("reason", e.getMessage());
                failures.put(failure);
            }
        }
    }

    private byte[] readFileBytes(File file) throws IOException {
        byte[] data = new byte[(int) file.length()];
        try (FileInputStream fis = new FileInputStream(file)) {
            int offset = 0;
            int remaining = data.length;
            while (remaining > 0) {
                int read = fis.read(data, offset, remaining);
                if (read == -1) break;
                offset += read;
                remaining -= read;
            }
        }
        return data;
    }

    private String computeSha256(byte[] data) throws NoSuchAlgorithmException {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(data);
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    @PluginMethod
    public void createDesktopShortcut(PluginCall call) {
        String shortcutId = call.getString("id", "");
        String label = call.getString("label", "");
        String profileId = call.getString("profileId", "");
        String path = call.getString("path", "");

        if (shortcutId.isEmpty() || label.isEmpty()) {
            call.reject("id and label are required");
            return;
        }

        boolean success = ShortcutHelper.createShortcut(getContext(), shortcutId, label, profileId, path);
        JSObject result = new JSObject();
        result.put("success", success);
        if (success) {
            call.resolve(result);
        } else {
            call.reject("Failed to create shortcut");
        }
    }

    @PluginMethod
    public void createLocalDesktopShortcut(PluginCall call) {
        String shortcutId = call.getString("id", "");
        String label = call.getString("label", "");
        String path = call.getString("path", "");

        if (shortcutId.isEmpty() || label.isEmpty()) {
            call.reject("id and label are required");
            return;
        }

        boolean success = ShortcutHelper.createShortcutWithSource(getContext(), shortcutId, label, "", path, "local");
        JSObject result = new JSObject();
        result.put("success", success);
        if (success) {
            call.resolve(result);
        } else {
            call.reject("Failed to create shortcut");
        }
    }

    @PluginMethod
    public void removeDesktopShortcut(PluginCall call) {
        String shortcutId = call.getString("id", "");
        if (shortcutId.isEmpty()) {
            call.reject("id is required");
            return;
        }

        boolean success = ShortcutHelper.removeShortcut(getContext(), shortcutId);
        JSObject result = new JSObject();
        result.put("success", success);
        call.resolve(result);
    }

    @PluginMethod
    public void isShortcutAvailable(PluginCall call) {
        boolean available = ShortcutHelper.isAvailable(getContext());
        JSObject result = new JSObject();
        result.put("available", available);
        call.resolve(result);
    }
}