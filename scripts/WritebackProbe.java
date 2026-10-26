import com.hierynomus.msdtyp.AccessMask;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.mssmb2.SMBApiException;
import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;
import com.hierynomus.smbj.share.File;

import java.io.OutputStream;
import java.util.EnumSet;

/** 完整复刻 PAD2 writeback 链：getFileAttributes → writeFile(temp) → open(temp,WRITE|DELETE) → rename(getName 整串, true) */
public class WritebackProbe {
    static DiskShare share;

    static void writeFile(String path, byte[] data) throws Exception {
        File file = share.openFile(path, EnumSet.of(AccessMask.GENERIC_WRITE), null, SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OVERWRITE_IF, null);
        try {
            OutputStream os = file.getOutputStream();
            os.write(data);
            os.flush();
            os.close();
        } finally {
            file.close();
        }
    }

    static void writeFileSafe(String path, byte[] data) throws Exception {
        String tempPath = path + ".tmp" + System.currentTimeMillis();
        writeFile(tempPath, data);
        try {
            File file = share.openFile(tempPath, EnumSet.of(AccessMask.GENERIC_WRITE, AccessMask.DELETE), null, SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null);
            file.rename(new java.io.File(path).getName(), true);
            file.close();
        } catch (Exception e) {
            try { share.rm(tempPath); System.out.println("  [cleanup] rm temp ok"); } catch (Exception e2) { System.out.println("  [cleanup] rm temp FAILED: " + e2.getMessage()); }
            Throwable c = e;
            while (c != null) {
                System.out.println("  [cause] " + c.getClass().getName() + ": " + c.getMessage());
                c = c.getCause();
            }
            throw new Exception("Safe write failed: rename error", e);
        }
    }

    public static void main(String[] args) throws Exception {
        String target = "AutoFileBackup\\PAD2-S6-01\\测试表.xlsx";
        SMBClient client = new SMBClient();
        try (Connection conn = client.connect("192.168.2.247")) {
            try (Session session = conn.authenticate(new AuthenticationContext("guest", "".toCharArray(), ""))) {
                try (DiskShare s = (DiskShare) session.connectShare("soft")) {
                    share = s;
                    System.out.println("[0] connected dialect=" + conn.getNegotiatedProtocol().getDialect());
                    // 复刻 writeback ①：getFileAttributes
                    File f1 = share.openFile(target, EnumSet.of(AccessMask.GENERIC_READ), null, SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null);
                    try { System.out.println("[1] attrs size=" + f1.getFileInformation().getStandardInformation().getEndOfFile()); }
                    finally { f1.close(); }
                    // 复刻 writeback ②：writeFileSafe（编辑内容 ~5.7KB）
                    byte[] data = new byte[5687];
                    for (int i = 0; i < data.length; i++) data[i] = (byte) (i % 251);
                    try {
                        writeFileSafe(target, data);
                        System.out.println("[2] writeFileSafe OK");
                    } catch (Exception e) {
                        System.out.println("[2] writeFileSafe FAILED（如上 cause 链）");
                    }
                    // 终态
                    try { File f2 = share.openFile(target, EnumSet.of(AccessMask.GENERIC_READ), null, SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null);
                        System.out.println("[3] target now size=" + f2.getFileInformation().getStandardInformation().getEndOfFile()); f2.close(); }
                    catch (Exception e) { System.out.println("[3] target open FAILED: " + e.getMessage()); }
                }
            }
        }
    }
}