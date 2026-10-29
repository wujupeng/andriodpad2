package com.pad2.filemanager.update;

import com.hierynomus.msdtyp.AccessMask;
import com.hierynomus.msfscc.fileinformation.FileIdBothDirectoryInformation;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.SmbConfig;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;
import com.hierynomus.smbj.share.File;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.EnumSet;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class UpdateSmbClient {
    private SMBClient smbClient;
    private Connection connection;
    private Session session;
    private DiskShare diskShare;

    public void connect(String host, String shareName, String username, String password, String domain) throws IOException {
        disconnect();
        SmbConfig config = SmbConfig.builder()
            .withSoTimeout(30, TimeUnit.SECONDS)
            .withTimeout(60, TimeUnit.SECONDS)
            .build();
        smbClient = new SMBClient(config);
        connection = smbClient.connect(host);
        AuthenticationContext authContext;
        if (username == null || username.isEmpty()) {
            authContext = AuthenticationContext.anonymous();
        } else {
            authContext = new AuthenticationContext(username, password != null ? password.toCharArray() : new char[0], domain);
        }
        session = connection.authenticate(authContext);
        diskShare = (DiskShare) session.connectShare(shareName);
    }

    public void disconnect() {
        try { if (diskShare != null) diskShare.close(); } catch (Exception ignored) {}
        try { if (session != null) session.close(); } catch (Exception ignored) {}
        try { if (connection != null) connection.close(); } catch (Exception ignored) {}
        diskShare = null; session = null; connection = null; smbClient = null;
    }

    public boolean isConnected() {
        return diskShare != null && connection != null && connection.isConnected();
    }

    public byte[] readFile(String path) throws IOException {
        File file = diskShare.openFile(path, EnumSet.of(AccessMask.GENERIC_READ), null, SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null);
        try (InputStream is = file.getInputStream(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
            return bos.toByteArray();
        }
    }

    public long getFileSize(String path) throws IOException {
        File file = diskShare.openFile(path, EnumSet.of(AccessMask.GENERIC_READ), null, SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null);
        try { return file.getFileInformation().getStandardInformation().getEndOfFile(); }
        finally { file.close(); }
    }

    public InputStream getFileStream(String path) throws IOException {
        return getFileStream(path, 0);
    }

    public InputStream getFileStream(String path, long offset) throws IOException {
        File file = diskShare.openFile(path, EnumSet.of(AccessMask.GENERIC_READ), null, SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null);
        InputStream is = file.getInputStream();
        if (offset > 0) {
            long skipped = is.skip(offset);
            if (skipped != offset) {
                try { is.close(); } catch (Exception ignored) {}
                try { file.close(); } catch (Exception ignored) {}
                throw new IOException("skip mismatch: expected " + offset + ", skipped " + skipped);
            }
        }
        return is;
    }
}