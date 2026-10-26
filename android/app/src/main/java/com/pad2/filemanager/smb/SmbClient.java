package com.pad2.filemanager.smb;

import com.hierynomus.msdtyp.AccessMask;
import com.hierynomus.msfscc.fileinformation.FileIdBothDirectoryInformation;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2CreateOptions;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.mssmb2.SMBApiException;
import com.hierynomus.mserref.NtStatus;
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
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
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

    public InputStream readFileStream(String path) throws IOException {
        reconnectIfNeeded();
        final File file = diskShare.openFile(
            normalizePath(path),
            EnumSet.of(AccessMask.GENERIC_READ),
            null,
            SMB2ShareAccess.ALL,
            SMB2CreateDisposition.FILE_OPEN,
            null
        );
        final InputStream is = file.getInputStream();
        return new InputStream() {
            @Override
            public int read() throws IOException {
                return is.read();
            }

            @Override
            public int read(byte[] b, int off, int len) throws IOException {
                return is.read(b, off, len);
            }

            @Override
            public void close() throws IOException {
                try {
                    is.close();
                } finally {
                    file.close();
                }
            }
        };
    }

    public long getFileSize(String path) throws IOException {
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
            return file.getFileInformation().getStandardInformation().getEndOfFile();
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


    // ===== TASK-S5-03：复制与移动（s5-02-file-operations-design.md §B/§C）=====

    /** 文件名提取（SMB 反斜杠路径——S5-01 教训：不可用 java.io.File.getName） */
    private static String fileNameOf(String normalizedPath) {
        int idx = normalizedPath.lastIndexOf('\\');
        return idx >= 0 ? normalizedPath.substring(idx + 1) : normalizedPath;
    }

    /** 远端文件存在探测（非目录） */
    private boolean remoteFileExists(String normalizedPath) {
        try {
            getFileSize(normalizedPath);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 远端文件 SHA-256（校验用） */
    private String hashOf(String normalizedPath) throws IOException {
        MessageDigest d;
        try {
            d = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
        InputStream is = readFileStream(normalizedPath);
        try {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = is.read(buf)) >= 0) d.update(buf, 0, n);
        } finally {
            try { is.close(); } catch (Exception ignored) {}
        }
        return hexOf(d.digest());
    }

    private static String hexOf(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    /**
     * 复制（远端→远端）：流式读源→按 CreateDisposition 原子创建目标→SHA-256 校验。
     * TASK-S5-03 真机两轮确诊后的终版方案：
     * - rename 落位不可用（Samba 对 replaceIfExists=false 一律 COLLISION、写句柄未
     *   关时 rename 静默不生效）——改用 FILE_CREATE 服务器侧原子存在性检查；
     * - overwrite=false → FILE_CREATE：目标已存在 → STATUS_OBJECT_NAME_COLLISION
     *   → 转译"目标已存在"（原子防覆盖，零竞态窗口，PM 红线①）；
     * - overwrite=true → FILE_OVERWRITE_IF（用户经 ConflictDialog 显式授权）；
     * - 失败清理：删除本次半写的目标（源不受影响；清理失败时重试会命中
     *   COLLISION → 冲突决策 → 覆盖重写自愈——网络超时不等同于操作未发生）。
     *
     * @return { bytesCopied: long, sha256: String（目标校验值，与源一致） }
     */
    public Map<String, Object> copyFile(String sourcePath, String destinationDir,
                                        String destFileName, boolean overwrite) throws IOException {
        reconnectIfNeeded();
        String src = normalizePath(sourcePath);
        String dstDir = normalizePath(destinationDir == null ? "" : destinationDir);
        String dstName = (destFileName != null && !destFileName.isEmpty())
                ? destFileName : fileNameOf(src);
        String dst = dstDir.isEmpty() ? dstName : dstDir + "\\" + dstName;

        // 目标目录预检（根目录为空串时跳过）
        if (!dstDir.isEmpty() && !directoryExists(dstDir)) {
            throw new IOException("目标目录不存在: " + dstDir);
        }

        InputStream is = null;
        File outFile = null;
        try {
            MessageDigest digest;
            try {
                digest = MessageDigest.getInstance("SHA-256");
            } catch (NoSuchAlgorithmException e) {
                throw new RuntimeException("SHA-256 not available", e);
            }
            long bytes = 0;
            is = readFileStream(src);
            // 原子创建：FILE_CREATE（不覆盖）/ FILE_OVERWRITE_IF（显式授权覆盖）
            outFile = diskShare.openFile(
                dst,
                EnumSet.of(AccessMask.GENERIC_WRITE),
                null,
                SMB2ShareAccess.ALL,
                overwrite ? SMB2CreateDisposition.FILE_OVERWRITE_IF
                          : SMB2CreateDisposition.FILE_CREATE,
                null
            );
            OutputStream os = outFile.getOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = is.read(buf)) >= 0) {
                digest.update(buf, 0, n);
                os.write(buf, 0, n);
                bytes += n;
            }
            os.flush();
            os.close();
            outFile.close();
            outFile = null;
            String srcSha = hexOf(digest.digest());

            // 落位后校验（PM 红线①：SHA 一致是内容证据；失败如实抛——源完好）
            String dstSha = hashOf(dst);
            if (!dstSha.equals(srcSha)) {
                throw new IOException("复制校验失败: SHA-256 不一致（源文件未受影响）");
            }

            Map<String, Object> r = new HashMap<>();
            r.put("bytesCopied", bytes);
            r.put("sha256", dstSha);
            return r;
        } catch (SMBApiException e) {
            String msg = String.valueOf(e.getMessage());
            if (msg.contains("STATUS_OBJECT_NAME_COLLISION")) {
                // 原子防覆盖命中：目标已存在（毫秒级竞态内创建亦被服务器拦截）
                throw new IOException("目标已存在: " + dstName);
            }
            cleanupPartial(dst, is, outFile);
            throw new IOException(msg, e);
        } catch (IOException e) {
            cleanupPartial(dst, is, outFile);
            throw e;
        } catch (RuntimeException e) {
            cleanupPartial(dst, is, outFile);
            throw new IOException(String.valueOf(e.getMessage()), e);
        } finally {
            try { if (is != null) is.close(); } catch (Exception ignored) {}
            try { if (outFile != null) outFile.close(); } catch (Exception ignored) {}
        }
    }

    /** 失败清理：关句柄后删除本次半写的目标（源不动；清理失败由重试 COLLISION 自愈） */
    private void cleanupPartial(String dst, InputStream is, File outFile) {
        try { if (is != null) is.close(); } catch (Exception ignored) {}
        try { if (outFile != null) outFile.close(); } catch (Exception ignored) {}
        try { deleteFile(dst); } catch (Exception ignored) {}
    }

    /**
     * 移动（远端→远端，跨目录）：copyFile（含 SHA 校验）成功后才删除源（PM 红线②：
     * 先复制并验证，再删源；任何不确定状态不删源）。
     * 中断窗口=源与目标并存（安全侧失败，用户重跑即完成）——无文件消失路径。
     * 源删除失败（网络）→ 如实抛错（目标已就绪、源保留），不伪报成功。
     */
    public Map<String, Object> moveFile(String sourcePath, String destinationDir,
                                        String destFileName, boolean overwrite) throws IOException {
        Map<String, Object> copyResult = copyFile(sourcePath, destinationDir, destFileName, overwrite);
        // copy+verify 成功 → 才删源（copyFile 内部已含目标 SHA 校验）
        deleteFile(sourcePath);
        return copyResult;
    }

    // ===== TASK-S5-04-R：远端重命名（s5-04-rename-design.md 方案 A，PM 授权实施）=====

    /**
     * 远端重命名：SMB2 SET_INFO FileRename（单目录项原子操作）。
     * 设计约束（s5-04 设计 §3.2，含 S5-04 探针三轮实测证据）：
     * - FileName 恒"相对共享根"解析（无相对源目录语义）——必须显式构造
     *   "源目录\新名"完整相对路径，禁用 File.getName 隐式模式（纯名=移位共享根，T-A 实证）；
     * - replaceIfExists 恒 false：目标存在→服务端原子 STATUS_OBJECT_NAME_COLLISION
     *   →转译"目标已存在"（T-B2 实证：两文件内容原样，零竞态防覆盖——不依赖前置检查）；
     * - 毫秒级零数据传输+mtime 保留（T-A2 实证）；单请求原子（无部分完成态；重试幂等
     *   ——首次成功后重试命中 COLLISION→呈现"已存在"，不重复执行）；
     * - 目标已存在的 COLLISION 与 copyFile 的防覆盖共用语义（不删目标不覆盖源）。
     */
    public void renameFile(String path, String newName) throws IOException {
        reconnectIfNeeded();
        String src = normalizePath(path);
        if (newName == null || newName.trim().isEmpty()) {
            throw new IOException("新名称不能为空");
        }
        // 显式构造完整共享相对路径：源目录 + '\' + 新名（根目录文件→纯新名）
        int lastSep = src.lastIndexOf('\\');
        String newRelative = lastSep >= 0 ? src.substring(0, lastSep + 1) + newName : newName;

        File file = diskShare.openFile(
            src,
            EnumSet.of(AccessMask.GENERIC_WRITE, AccessMask.DELETE),
            null,
            SMB2ShareAccess.ALL,
            SMB2CreateDisposition.FILE_OPEN,
            null
        );
        try {
            file.rename(newRelative, false);
        } catch (SMBApiException e) {
            String msg = String.valueOf(e.getMessage());
            if (msg.contains("STATUS_OBJECT_NAME_COLLISION")) {
                throw new IOException("目标已存在: " + newName);
            }
            throw new IOException(msg, e);
        } finally {
            file.close();
        }
    }

    // ===== TASK-S5-05：远端单文件删除（s5-02 设计 §E 四层防线，PM 授权实施）=====

    /**
     * 远端删除（仅单文件）：
     * - 目录目标拒绝执行（folderExists 预检——目录递归删除属后续任务，不伪报支持）；
     * - 文件存在性预检（getFileSize 探测）：不存在 → "文件不存在"明确失败（不伪报成功）；
     * - 删除后核验（再探测应不存在——服务器事实为唯一判据）；
     * - 与 cleanup() 零代码共享（不同方法不同目标集：rm(路径) vs 缓存目录遍历——
     *   PM 条件：缓存清理逻辑不得复用远端删除）；
     * - 目标不存在于预检与删除竞态窗口（外部并发删除）→ rm 抛 NOT_FOUND 类错误
     *   → 如实失败（幂等重试语义：用户重跑时预检先行拦截）。
     */
    public void deleteRemoteFile(String path) throws IOException {
        reconnectIfNeeded();
        String p = normalizePath(path);
        // 目录拒绝（PM 门槛：目录目标拒绝执行，不支持递归删除）
        if (directoryExists(p)) {
            throw new IOException("不支持删除文件夹（本版本仅支持单文件删除）");
        }
        // 存在性预检：目标不存在 → 明确失败（PM 门槛：不伪报删除成功）
        if (!remoteFileExists(p)) {
            throw new IOException("文件不存在: " + path);
        }
        // 执行删除（deleteFile 原语=rm 单文件）
        deleteFile(p);
        // 删除后服务器核验（事实判据）
        if (remoteFileExists(p)) {
            throw new IOException("删除后核验失败：文件仍存在于服务器");
        }
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