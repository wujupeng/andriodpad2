package com.pad2.filemanager.smb;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.FileObserver;
import android.util.Log;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.Map;

public class WpsDeliveryHandler {

    private static final String TAG = "WpsDeliveryHandler";
    private static final String CACHE_DIR = "smb_cache";

    private Context context;
    private SmbClient smbClient;
    private FileObserver fileObserver;
    private FileObserver dirObserver;
    private volatile boolean observerDetectedChange = false;
    private volatile String observerEventLog = "";
    private String currentRemotePath;
    private File currentLocalFile;
    private String currentBaselineHash;
    private long currentBaselineMtime;

    public WpsDeliveryHandler(Context context, SmbClient smbClient) {
        this.context = context;
        this.smbClient = smbClient;
    }

    public Map<String, Object> openFileInWps(String remotePath) throws IOException {
        byte[] data = smbClient.readFile(remotePath);
        String localFileName = new File(remotePath).getName();
        File cacheDir = new File(context.getExternalFilesDir(null), CACHE_DIR);
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }
        File localFile = new File(cacheDir, localFileName);
        try (FileOutputStream fos = new FileOutputStream(localFile)) {
            fos.write(data);
        }

        currentRemotePath = remotePath;
        currentLocalFile = localFile;
        currentBaselineHash = calculateSHA256(data);
        currentBaselineMtime = localFile.lastModified();

        Uri uri = Uri.fromFile(localFile);
        Intent intent = new Intent(Intent.ACTION_EDIT);
        intent.setDataAndType(uri, getMimeType(localFileName));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        startFileObserver(localFile);

        Map<String, Object> result4 = new HashMap<>();
        result4.put("uri", uri.toString());
        result4.put("localPath", localFile.getAbsolutePath());
        result4.put("baselineHash", currentBaselineHash);
        result4.put("baselineMtime", currentBaselineMtime);
        result4.put("intentLaunched", true);
        result4.put("intentAction", "ACTION_EDIT");
        result4.put("uriScheme", "file");

        try {
            context.startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "file:// ACTION_EDIT failed, trying FileProvider", e);
            try {
                Uri fpUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", localFile);
                Intent fpIntent = new Intent(Intent.ACTION_EDIT);
                fpIntent.setDataAndType(fpUri, getMimeType(localFileName));
                fpIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                fpIntent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                fpIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fpIntent);
                result4.put("intentAction", "ACTION_EDIT");
                result4.put("uriScheme", "content");
                result4.put("uri", fpUri.toString());
            } catch (Exception e2) {
                Log.e(TAG, "Failed to launch WPS", e2);
                result4.put("intentLaunched", false);
                result4.put("error", e2.getMessage());
            }
        }

        return result4;
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
                byte[] data = readFileBytes(currentLocalFile);
                String newHash = calculateSHA256(data);
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

        byte[] localData = readFileBytes(currentLocalFile);
        String localHash = calculateSHA256(localData);

        Map<String, Object> remoteAttrs = smbClient.getFileAttributes(currentRemotePath);
        long remoteMtime = (long) remoteAttrs.get("lastWriteTime");

        smbClient.writeFileSafe(currentRemotePath, localData);

        byte[] verifyData = smbClient.readFile(currentRemotePath);
        String verifyHash = calculateSHA256(verifyData);

        result.put("writebackSuccess", verifyHash.equals(localHash));
        result.put("localHash", localHash);
        result.put("verifyHash", verifyHash);
        result.put("remoteMtimeBefore", remoteMtime);
        result.put("remoteMtimeAfter", System.currentTimeMillis());

        currentBaselineHash = localHash;
        currentBaselineMtime = currentLocalFile.lastModified();

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
        result.put("baselineMtime", currentBaselineMtime);
        result.put("remoteChanged", remoteMtime != currentBaselineMtime);
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
        currentLocalFile = null;
        currentRemotePath = null;
        currentBaselineHash = null;
    }

    private byte[] readFileBytes(File file) throws IOException {
        java.io.FileInputStream fis = new java.io.FileInputStream(file);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int len;
        while ((len = fis.read(buffer)) != -1) {
            baos.write(buffer, 0, len);
        }
        fis.close();
        return baos.toByteArray();
    }

    public static String calculateSHA256(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data);
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    private String getMimeType(String fileName) {
        String extension = MimeTypeMap.getFileExtensionFromUrl(fileName);
        String mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        if (mimeType == null) {
            if (extension != null) {
                switch (extension.toLowerCase()) {
                    case "doc": return "application/msword";
                    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                    case "xls": return "application/vnd.ms-excel";
                    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                    case "ppt": return "application/vnd.ms-powerpoint";
                    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
                    case "pdf": return "application/pdf";
                    case "txt": return "text/plain";
                    default: return "*/*";
                }
            }
            return "*/*";
        }
        return mimeType;
    }
}