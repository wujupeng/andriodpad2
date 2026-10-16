package com.pad2.filemanager.smb;

import com.hierynomus.msdtyp.AccessMask;
import com.hierynomus.msfscc.fileinformation.FileIdBothDirectoryInformation;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2CreateOptions;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;
import com.hierynomus.smbj.share.File;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class SmbClient {

    private SMBClient smbClient;
    private Connection connection;
    private Session session;
    private DiskShare diskShare;

    private String host;
    private String shareName;
    private String username;
    private String password;
    private String domain;

    public void connect(String host, String shareName, String username, String password, String domain) throws IOException {
        this.host = host;
        this.shareName = shareName;
        this.username = username;
        this.password = password;
        this.domain = domain;

        disconnect();

        smbClient = new SMBClient();
        connection = smbClient.connect(host);
        AuthenticationContext authContext;
        if (username == null || username.isEmpty()) {
            authContext = AuthenticationContext.anonymous();
        } else {
            authContext = new AuthenticationContext(username, password.toCharArray(), domain);
        }
        session = connection.authenticate(authContext);
        diskShare = (DiskShare) session.connectShare(shareName);
    }

    public void disconnect() {
        try {
            if (diskShare != null) {
                diskShare.close();
                diskShare = null;
            }
            if (session != null) {
                session.close();
                session = null;
            }
            if (connection != null) {
                connection.close();
                connection = null;
            }
            if (smbClient != null) {
                smbClient.close();
                smbClient = null;
            }
        } catch (IOException e) {
            // ignore
        }
    }

    public boolean isConnected() {
        return diskShare != null && connection != null && connection.isConnected();
    }

    public void reconnectIfNeeded() throws IOException {
        if (host == null || shareName == null) {
            throw new IOException("Not configured");
        }
        boolean needReconnect = false;
        if (smbClient == null || connection == null || !connection.isConnected() || diskShare == null) {
            needReconnect = true;
        } else {
            try {
                diskShare.list("");
            } catch (Exception e) {
                needReconnect = true;
            }
        }
        if (needReconnect) {
            connect(host, shareName, username, password, domain);
        }
    }

    public List<Map<String, Object>> listDirectory(String path) throws IOException {
        reconnectIfNeeded();
        List<Map<String, Object>> result = new ArrayList<>();
        if (path == null || path.isEmpty() || path.equals("/")) {
            path = "";
        }
        if (path.startsWith("/")) {
            path = path.substring(1);
        }

        for (FileIdBothDirectoryInformation entry : diskShare.list(path)) {
            String fileName = entry.getFileName();
            if (fileName.equals(".") || fileName.equals("..")) {
                continue;
            }
            Map<String, Object> fileMap = new HashMap<>();
            fileMap.put("name", fileName);
            fileMap.put("isDirectory", (entry.getFileAttributes() & 0x10) != 0);
            fileMap.put("size", entry.getEndOfFile());
            fileMap.put("lastModified", entry.getLastWriteTime().toEpochMillis());
            fileMap.put("path", path.isEmpty() ? fileName : path + "\\" + fileName);
            result.add(fileMap);
        }
        return result;
    }

    public byte[] readFile(String path) throws IOException {
        reconnectIfNeeded();
        File file = diskShare.openFile(
            normalizePath(path),
            EnumSet.of(AccessMask.GENERIC_READ),
            null,
            SMB2ShareAccess.ALL,
            SMB2CreateDisposition.FILE_OPEN,
            null
        );
        try {
            InputStream is = file.getInputStream();
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int len;
            while ((len = is.read(buffer)) != -1) {
                baos.write(buffer, 0, len);
            }
            is.close();
            return baos.toByteArray();
        } finally {
            file.close();
        }
    }

    public void writeFile(String path, byte[] data) throws IOException {
        reconnectIfNeeded();
        File file = diskShare.openFile(
            normalizePath(path),
            EnumSet.of(AccessMask.GENERIC_WRITE),
            null,
            SMB2ShareAccess.ALL,
            SMB2CreateDisposition.FILE_OVERWRITE_IF,
            null
        );
        try {
            OutputStream os = file.getOutputStream();
            os.write(data);
            os.flush();
            os.close();
        } finally {
            file.close();
        }
    }

    public void writeFileSafe(String path, byte[] data) throws IOException {
        String tempPath = path + ".tmp" + System.currentTimeMillis();
        writeFile(tempPath, data);
        try {
            File file = diskShare.openFile(
                normalizePath(tempPath),
                EnumSet.of(AccessMask.GENERIC_WRITE, AccessMask.DELETE),
                null,
                SMB2ShareAccess.ALL,
                SMB2CreateDisposition.FILE_OPEN,
                null
            );
            file.rename(new java.io.File(path).getName(), true);
            file.close();
        } catch (Exception e) {
            try { deleteFile(tempPath); } catch (Exception ignored) {}
            throw new IOException("Safe write failed: rename error", e);
        }
    }

    public void deleteFile(String path) throws IOException {
        reconnectIfNeeded();
        diskShare.rm(normalizePath(path));
    }

    public void writeTextFile(String path, String text) throws IOException {
        reconnectIfNeeded();
        writeFile(path, text.getBytes("UTF-8"));
    }

    public void createDirectory(String path) throws IOException {
        reconnectIfNeeded();
        diskShare.mkdir(normalizePath(path));
    }

    public boolean directoryExists(String path) throws IOException {
        reconnectIfNeeded();
        try {
            return diskShare.folderExists(normalizePath(path));
        } catch (Exception e) {
            return false;
        }
    }

    public Map<String, Object> getFileAttributes(String path) throws IOException {
        reconnectIfNeeded();
        File file = diskShare.openFile(
            normalizePath(path),
            EnumSet.of(AccessMask.GENERIC_READ),
            null,
            SMB2ShareAccess.ALL,
            SMB2CreateDisposition.FILE_OPEN,
            null
        );
        try {
            Map<String, Object> attrs = new HashMap<>();
            attrs.put("size", file.getFileInformation().getStandardInformation().getEndOfFile());
            attrs.put("lastWriteTime", file.getFileInformation().getBasicInformation().getLastWriteTime().toEpochMillis());
            return attrs;
        } finally {
            file.close();
        }
    }

    private String normalizePath(String path) {
        if (path == null) return "";
        if (path.startsWith("/")) path = path.substring(1);
        return path.replace("/", "\\");
    }

    public String getHost() { return host; }
    public String getShareName() { return shareName; }
}